/* ------------------------------------------------------------------
   entities.js - physics, players, bubbles, monsters, items, effects
   ------------------------------------------------------------------ */

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function bubbleBox(b) {
  return { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

function clampRow(r) { return r < 0 ? 0 : (r >= ROWS ? ROWS - 1 : r); }

/* Fall off the bottom of the screen, come back in at the top. */
function wrapVertical(e) {
  if (e.y > WORLD_H) e.y = -e.h;
  else if (e.y + e.h < 0) e.y = WORLD_H;
}

/* Axis-separated tile collision.
   'X' blocks all four directions; '#' only catches a falling entity
   whose feet were at or above the platform top on the previous step.
   LAND_TOLERANCE forgives a few units so barely-made jumps still stick. */
function moveAndCollide(e, level) {
  e.hitWall = false;

  /* ---- horizontal ---- */
  var prevX = e.x;
  e.x += e.vx;
  if (e.vx !== 0) {
    /* Probe rows are clamped into the grid. Above the ceiling or below the
       floor an entity is inside a wrap chute, and the row it is passing
       through must still stop it - otherwise out-of-range rows read as empty
       and it can walk straight out of the arena. */
    var r0 = clampRow(Math.floor(e.y / TILE));
    var r1 = clampRow(Math.floor((e.y + e.h - 1) / TILE));
    var col, r;
    if (e.vx > 0) {
      col = Math.floor((e.x + e.w - 1) / TILE);
      for (r = r0; r <= r1; r++) {
        /* Never resolve further back than where the step began. An entity
           whose head is a hair inside the ceiling row would otherwise be
           "pushed out of" a column it already fills, teleporting it a whole
           body width backwards. */
        if (isSolid(level, col, r)) {
          e.x = Math.max(col * TILE - e.w, prevX);
          e.hitWall = true;
          break;
        }
      }
    } else {
      col = Math.floor(e.x / TILE);
      for (r = r0; r <= r1; r++) {
        if (isSolid(level, col, r)) {
          e.x = Math.min((col + 1) * TILE, prevX);
          e.hitWall = true;
          break;
        }
      }
    }
    if (e.hitWall) e.vx = 0;
  }

  /* backstop: the arena edge is absolute, whatever the tiles say. Every
     layout is framed by a one-tile wall, so stop just inside it. */
  if (e.x < TILE) { e.x = TILE; e.vx = 0; e.hitWall = true; }
  else if (e.x + e.w > WORLD_W - TILE) { e.x = WORLD_W - TILE - e.w; e.vx = 0; e.hitWall = true; }

  /* ---- vertical ---- */
  var prevBottom = e.y + e.h;
  e.y += e.vy;
  e.onGround = false;
  e.hitCeiling = false;

  var c0 = Math.floor(e.x / TILE);
  var c1 = Math.floor((e.x + e.w - 1) / TILE);
  var c;

  if (e.vy > 0) {
    var row = Math.floor((e.y + e.h) / TILE);
    for (c = c0; c <= c1; c++) {
      var t = tileAt(level, c, row);
      var landing = (t === 'X') ||
                    (t === '#' && prevBottom <= row * TILE + LAND_TOLERANCE);
      /* Row 0 is always the ceiling. Resting on top of it would leave the
         entity off-screen with no way down, so fall through instead. */
      if (landing && row > 0) {
        e.y = row * TILE - e.h;
        e.vy = 0;
        e.onGround = true;
        break;
      }
    }
  } else if (e.vy < 0) {
    var row2 = Math.floor(e.y / TILE);
    for (c = c0; c <= c1; c++) {
      if (isSolid(level, c, row2)) {
        e.y = (row2 + 1) * TILE;
        e.vy = 0;
        e.hitCeiling = true;
        break;
      }
    }
  }

  wrapVertical(e);
}

/* Is there something to stand on just past the entity's leading edge? */
function groundAhead(e, level, dir) {
  var probeX = dir > 0 ? e.x + e.w + 2 : e.x - 2;
  var col = Math.floor(probeX / TILE);
  var row = Math.floor((e.y + e.h + 2) / TILE);
  return isPlatform(level, col, row);
}

/* ==================================================================
   PLAYER
   ================================================================== */
var EXTEND_LETTERS = ['E', 'X', 'T', 'E', 'N', 'D'];

class Player {
  constructor(index) {
    this.index = index;
    this.kind = index === 0 ? 'cat' : 'bunny';
    this.name = index === 0 ? 'MOCHI' : 'PUFF';
    this.color = index === 0 ? '#57e0a5' : '#7fa8ff';
    this.w = 15;
    this.h = 19;
    this.lives = 3;
    this.score = 0;
    this.letters = [false, false, false, false, false, false];
    this.active = true;
    this.reset(TILE * 3, TILE * 14);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.index === 0 ? 1 : -1;
    this.onGround = false;
    this.alive = true;
    this.dying = 0;
    this.invuln = 120;
    this.bubbleCd = 0;
    this.animT = Math.random() * 120;
    this.squash = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.trapBubble = null;
    this.respawn = 0;
    this.riding = null;
  }

  clearPowers() {
    this.shoes = false;
    this.rapid = false;
    this.fastBubble = false;
    this.longBubble = false;
    this.ringBonus = 0;
  }

  addScore(n) { this.score += n; }

  /* Collect an EXTEND letter; returns true when the word completes. */
  takeLetter(i) {
    if (this.letters[i]) return false;
    this.letters[i] = true;
    for (var k = 0; k < 6; k++) if (!this.letters[k]) return false;
    this.letters = [false, false, false, false, false, false];
    this.lives++;
    return true;
  }

  update(input, game) {
    this.animT++;

    if (this.dying > 0) {
      this.dying--;
      this.y += this.vy;
      this.vy += GRAVITY * 0.5;
      if (this.dying === 0) game.finishDeath(this);
      return;
    }
    if (this.respawn > 0) {
      this.respawn--;
      if (this.respawn === 0) game.respawnPlayer(this);
      return;
    }
    if (!this.alive) return;

    /* trapped inside a bubble - float along with it until freed */
    if (this.trapBubble) {
      var tb = this.trapBubble;
      this.x = tb.x - this.w / 2;
      this.y = tb.y - this.h / 2;
      return;
    }

    if (this.invuln > 0) this.invuln--;
    if (this.bubbleCd > 0) this.bubbleCd--;

    var wasGround = this.onGround;
    var speed = this.shoes ? RUN_SPEED_FAST : RUN_SPEED;
    if (input.left && !input.right) { this.vx = -speed; this.facing = -1; }
    else if (input.right && !input.left) { this.vx = speed; this.facing = 1; }
    else this.vx = 0;

    /* jump buffering: an early press still fires the moment you land */
    if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER_FRAMES;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;

    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = JUMP_V;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.squash = -2.2;
      this.riding = null;
      Sound.play('jump');
    }

    if (input.firePressed && this.bubbleCd <= 0) {
      game.spawnPlayerBubble(this);
      this.bubbleCd = this.rapid ? 8 : 18;
      this.squash = 1.4;
      Sound.play('bubble');
      if (this.ringBonus) this.addScore(this.ringBonus);
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    this.riding = null;
    moveAndCollide(this, game.level);

    /* coyote time: a moment of grace after stepping off an edge */
    if (this.onGround) this.coyote = COYOTE_FRAMES;
    else if (this.coyote > 0) this.coyote--;

    if (this.onGround && !wasGround) this.squash = 2.0;
    this.squash = approach(this.squash, 0, 0.22);
  }

  draw(ctx) {
    if (!this.alive && this.dying === 0) return;
    if (this.respawn > 0) return;
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0 && this.dying === 0) return;

    var fx = this.x + this.w / 2;
    var fy = this.y + this.h;
    var opts = { squash: this.squash, alpha: this.dying > 0 ? 0.75 : 1 };
    if (this.dying > 0) {
      ctx.save();
      ctx.translate(fx, fy - 8);
      ctx.rotate(this.dying * 0.16);
      ctx.translate(-fx, -(fy - 8));
      drawCritter(ctx, this.kind, fx, fy, this.facing, this.animT, opts);
      ctx.restore();
      return;
    }
    drawCritter(ctx, this.kind, fx, fy, this.facing, this.animT, opts);
  }
}

/* ==================================================================
   BUBBLE
   ================================================================== */
var BUBBLE_LIFE = 520;
var ESCAPE_TIME = 380;

class Bubble {
  constructor(x, y, dir, owner, opts) {
    opts = opts || {};
    this.x = x;
    this.y = y;
    this.r = 11;
    this.dir = dir;
    this.owner = owner;
    this.vx = dir * (opts.speed || 3.4);
    this.vy = 0;
    this.phase = 'shoot';
    this.rangeT = opts.range || 28;
    this.life = BUBBLE_LIFE;
    this.content = null;        // 'water' | 'fire' | 'lightning'
    this.enemy = null;
    this.player = null;
    this.escapeT = 0;
    this.dead = false;
    this.wobble = Math.random() * Math.PI * 2;
    this.canTrap = true;
    this.age = 0;
    this.hue = Math.random() * 360;
  }

  get trapped() { return !!(this.enemy || this.player); }

  trap(enemy) {
    this.enemy = enemy;
    this.phase = 'float';
    this.vx = 0;
    this.vy = 0;
    this.r = 13;
    this.escapeT = ESCAPE_TIME;
    this.canTrap = false;
    this.life = Math.max(this.life, ESCAPE_TIME + 60);
  }

  trapPlayer(p) {
    this.player = p;
    p.trapBubble = this;
    this.phase = 'float';
    this.vx = 0;
    this.vy = 0;
    this.r = 13;
    this.escapeT = 300;
    this.canTrap = false;
  }

  update(game) {
    this.age++;
    this.wobble += 0.11;
    if (this.age > 42) this.canTrap = false;

    if (this.phase === 'shoot') {
      var nx = this.x + this.vx;
      var col = Math.floor((nx + this.dir * this.r) / TILE);
      var row = Math.floor(this.y / TILE);
      if (isSolid(game.level, col, row)) {
        this.phase = 'float';
        this.vx = 0;
      } else {
        this.x = nx;
        if (--this.rangeT <= 0) { this.phase = 'float'; this.vx = 0; }
      }
    } else {
      this.vx = approach(this.vx, game.level.drift + Math.sin(this.wobble) * 0.18, 0.04);
      this.vy = approach(this.vy, -0.5, 0.03);
      this.x += this.vx;
      this.y += this.vy;

      var cTop = Math.floor((this.y - this.r) / TILE);
      var cCol = Math.floor(this.x / TILE);
      if (isSolid(game.level, cCol, cTop)) {
        this.y = (cTop + 1) * TILE + this.r;
        this.vy = 0;
      }
      var lc = Math.floor((this.x - this.r) / TILE);
      var rc = Math.floor((this.x + this.r) / TILE);
      var mr = Math.floor(this.y / TILE);
      if (isSolid(game.level, lc, mr)) { this.x = (lc + 1) * TILE + this.r; this.vx = Math.abs(this.vx); }
      if (isSolid(game.level, rc, mr)) { this.x = rc * TILE - this.r; this.vx = -Math.abs(this.vx); }
      /* Never drift above the ceiling row. A bubble that slipped out through
         a wrap gap used to carry its rider clean off the top of the screen.
         The extra slack keeps a rider fully in view. */
      var minY = TILE + this.r + 4;
      if (this.y < minY) { this.y = minY; this.vy = 0; }
    }

    if (this.escapeT > 0 && --this.escapeT === 0) {
      if (this.enemy) game.releaseEnemy(this);
      else if (this.player) game.freePlayer(this);
    }

    if (--this.life <= 0) this.dead = true;
  }

  draw(ctx, t) {
    if (this.life < 80 && Math.floor(this.life / 5) % 2 === 0) return;

    var x = this.x, y = this.y, r = this.r;
    var tint = '#cfe8ff';
    if (this.content === 'water') tint = '#5cc8ff';
    else if (this.content === 'fire') tint = '#ff9040';
    else if (this.content === 'lightning') tint = '#ffe14a';

    /* glassy sphere */
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0.30)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    /* contents */
    if (this.enemy) {
      var warn = this.escapeT < 100 && Math.floor(this.escapeT / 6) % 2 === 0;
      drawCritter(ctx, this.enemy.kind, x, y + r * 0.62, this.enemy.dir, t,
        { scale: 0.46, angry: this.enemy.angry || warn });
    } else if (this.player) {
      drawCritter(ctx, this.player.kind, x, y + r * 0.62, this.player.facing, t, { scale: 0.46 });
    } else if (this.content) {
      drawElementIcon(ctx, this.content, x, y);
    }

    /* rim + highlights */
    ctx.strokeStyle = tint;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.globalAlpha = 0.9;
    oval(ctx, x - r * 0.38, y - r * 0.42, r * 0.20, r * 0.13, '#ffffff');
    oval(ctx, x - r * 0.54, y - r * 0.14, r * 0.09, r * 0.07, '#ffffff');
    ctx.globalAlpha = 1;
  }
}

function drawElementIcon(ctx, kind, x, y) {
  if (kind === 'water') {
    ctx.fillStyle = '#3aa8ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.quadraticCurveTo(x + 4.4, y + 1, x, y + 4.4);
    ctx.quadraticCurveTo(x - 4.4, y + 1, x, y - 5);
    ctx.fill();
    oval(ctx, x - 1.2, y + 1.4, 1.1, 1.5, 'rgba(255,255,255,0.75)');
  } else if (kind === 'fire') {
    ctx.fillStyle = '#ff5a20';
    ctx.beginPath();
    ctx.moveTo(x, y - 5.5);
    ctx.quadraticCurveTo(x + 4.6, y - 0.5, x + 2.4, y + 3.4);
    ctx.quadraticCurveTo(x, y + 5.4, x - 2.4, y + 3.4);
    ctx.quadraticCurveTo(x - 4.6, y - 0.5, x, y - 5.5);
    ctx.fill();
    ctx.fillStyle = '#ffd040';
    ctx.beginPath();
    ctx.moveTo(x, y - 1.6);
    ctx.quadraticCurveTo(x + 2.2, y + 1, x, y + 3.6);
    ctx.quadraticCurveTo(x - 2.2, y + 1, x, y - 1.6);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    ctx.moveTo(x + 1.4, y - 5.4);
    ctx.lineTo(x - 3.2, y + 0.6);
    ctx.lineTo(x - 0.2, y + 0.6);
    ctx.lineTo(x - 1.4, y + 5.4);
    ctx.lineTo(x + 3.4, y - 0.8);
    ctx.lineTo(x + 0.4, y - 0.8);
    ctx.closePath();
    ctx.fill();
  }
}

/* ==================================================================
   MONSTERS
   ================================================================== */
var ENEMY_DEFS = {
  chick: { w: 16, h: 18, speed: 0.50, gravity: true },
  ghost: { w: 16, h: 19, speed: 0.40, gravity: true },
  bat:   { w: 17, h: 16, speed: 1.00, gravity: false },
  frog:  { w: 17, h: 16, speed: 0.80, gravity: true }
};

class Enemy {
  constructor(kind, col, row, difficulty, level) {
    var d = ENEMY_DEFS[kind];
    this.kind = kind;
    this.type = kind;
    this.def = d;
    this.w = d.w;
    this.h = d.h;
    this.x = col * TILE + (TILE - d.w) / 2;
    this.y = row * TILE + (TILE - d.h);
    /* Monsters are taller than a tile, so a bottom-aligned spawn pokes their
       head into whatever sits above. Drop them until it is clear, or they
       start life wedged in the ceiling and jitter instead of patrolling. */
    var lvl = level || (typeof Game !== 'undefined' ? Game.level : null);
    if (lvl) {
      for (var guard = 0; guard < 3; guard++) {
        var tr = Math.floor(this.y / TILE);
        var a0 = Math.floor(this.x / TILE);
        var a1 = Math.floor((this.x + this.w - 1) / TILE);
        var blocked = false;
        for (var ac = a0; ac <= a1; ac++) if (isSolid(lvl, ac, tr)) blocked = true;
        if (!blocked) break;
        this.y = (tr + 1) * TILE;
      }
    }
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.angry = false;
    this.dead = false;
    this.bubbled = false;
    this.difficulty = difficulty || 0;
    this.jumpT = 60 + Math.floor(Math.random() * 120);
    this.shootT = 100 + Math.floor(Math.random() * 90);
    this.hopT = 20 + Math.floor(Math.random() * 40);
    this.animT = Math.floor(Math.random() * 200);
    if (kind === 'bat') {
      var a = (Math.random() * 0.7 + 0.4) * (Math.random() < 0.5 ? -1 : 1);
      this.vx = Math.cos(a) * this.speed() * this.dir;
      this.vy = Math.sin(a) * this.speed();
      if (Math.abs(this.vy) < 0.3) this.vy = 0.5;
    }
  }

  speed() {
    var s = this.def.speed * (1 + this.difficulty * 0.12);
    return this.angry ? s * 1.9 : s;
  }

  enrage() { this.angry = true; }

  update(game) {
    if (this.bubbled) return;
    this.animT++;
    var lvl = game.level;
    var spd = this.speed();

    if (this.kind === 'bat') {
      var len = Math.hypot(this.vx, this.vy) || 1;
      this.vx = this.vx / len * spd;
      this.vy = this.vy / len * spd;
      var oldVx = this.vx, oldVy = this.vy;
      moveAndCollide(this, lvl);
      if (this.hitWall) { this.vx = -oldVx; }
      if (this.onGround || this.hitCeiling) this.vy = -oldVy;
      if (this.vy === 0) this.vy = oldVy < 0 ? 0.5 : -0.5;
      this.dir = this.vx < 0 ? -1 : 1;
      return;
    }

    if (this.kind === 'frog') {
      if (this.onGround) {
        if (--this.hopT <= 0) {
          this.vy = -4.8;
          this.hopT = 24 + Math.floor(Math.random() * 26);
          if (Math.random() < 0.25) this.dir *= -1;
        }
        this.vx = 0;
      } else {
        this.vx = this.dir * spd;
      }
    } else {
      this.vx = this.dir * spd;

      if (this.onGround && !groundAhead(this, lvl, this.dir)) {
        if (this.kind === 'chick' && Math.random() < 0.35) this.vy = JUMP_V;
        else this.dir *= -1;
      }

      if (this.kind === 'chick' && this.onGround && --this.jumpT <= 0) {
        this.jumpT = 70 + Math.floor(Math.random() * 140);
        var target = game.nearestPlayer(this);
        if (target && target.y + target.h < this.y - 8) this.vy = JUMP_V;
        else if (Math.random() < 0.4) this.vy = JUMP_V;
      }

      if (this.kind === 'ghost' && --this.shootT <= 0) {
        this.shootT = (this.angry ? 80 : 150) + Math.floor(Math.random() * 70);
        game.rocks.push(new Star(
          this.x + (this.dir > 0 ? this.w : -7),
          this.y + 5, this.dir
        ));
        Sound.play('shoot');
      }
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    moveAndCollide(this, lvl);
    if (this.hitWall) this.dir *= -1;
  }

  draw(ctx) {
    if (this.bubbled) return;
    drawCritter(ctx, this.kind, this.x + this.w / 2, this.y + this.h,
                this.dir, this.animT, { angry: this.angry });
  }
}

/* The ghost's thrown star */
class Star {
  constructor(x, y, dir) {
    this.x = x;
    this.y = y;
    this.w = 7;
    this.h = 7;
    this.vx = dir * 2.0;
    this.vy = 0;
    this.spin = 0;
    this.dead = false;
    this.life = 240;
  }
  update(game) {
    this.x += this.vx;
    this.spin += 0.25;
    var col = Math.floor((this.x + (this.vx > 0 ? this.w : 0)) / TILE);
    var row = Math.floor((this.y + this.h / 2) / TILE);
    if (isSolid(game.level, col, row)) this.dead = true;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    var cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.spin);
    ctx.fillStyle = '#ffd76e';
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = (i % 2 === 0) ? 4.6 : 2.0;
      var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* The invincible hunter that shows up after HURRY UP! */
class Hunter {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 19;
    this.dir = 1;
    this.animT = 0;
  }
  update(game) {
    var t = game.nearestPlayer(this);
    this.animT++;
    if (!t) return;
    var dx = (t.x - this.x), dy = (t.y - this.y);
    var d = Math.hypot(dx, dy) || 1;
    var spd = 0.85;
    this.x += dx / d * spd;
    this.y += dy / d * spd;
    this.dir = dx < 0 ? -1 : 1;
  }
  draw(ctx) {
    drawCritter(ctx, 'hunter', this.x + this.w / 2, this.y + this.h,
                this.dir, this.animT, {});
  }
}

/* ==================================================================
   ITEMS - fruit, gems, power-ups and EXTEND letters
   ================================================================== */
var FRUIT_TABLE = [
  { name: 'cherry',    c1: '#ff4d6a', c2: '#4fc36a', value: 500,  shape: 'round' },
  { name: 'apple',     c1: '#ff6347', c2: '#4fc36a', value: 1000, shape: 'round' },
  { name: 'orange',    c1: '#ffa233', c2: '#4fc36a', value: 1500, shape: 'round' },
  { name: 'lemon',     c1: '#ffe14a', c2: '#4fc36a', value: 2000, shape: 'oval' },
  { name: 'melon',     c1: '#5fd98a', c2: '#c8ffdb', value: 2500, shape: 'round' },
  { name: 'grape',     c1: '#b07aff', c2: '#4fc36a', value: 3000, shape: 'cluster' },
  { name: 'peach',     c1: '#ff9ec4', c2: '#4fc36a', value: 4000, shape: 'round' },
  { name: 'plum',      c1: '#8a6bff', c2: '#4fc36a', value: 5000, shape: 'round' },
  { name: 'ice cream', c1: '#ffd6e8', c2: '#e0a35e', value: 6000, shape: 'cone' }
];

var POWER_DEFS = {
  shoes:  { color: '#ff6b7a', value: 100,  label: 'S', hint: 'FAST FEET' },
  candyY: { color: '#ffd85e', value: 100,  label: 'R', hint: 'RAPID FIRE' },
  candyB: { color: '#5fc8ff', value: 100,  label: 'F', hint: 'FAST BUBBLES' },
  candyP: { color: '#c08aff', value: 100,  label: 'L', hint: 'LONG RANGE' },
  ring:   { color: '#ff7ac0', value: 1000, label: '+', hint: 'BONUS RING' }
};

var ITEM_PICKUP_DELAY = 38;   // so loot pops out visibly instead of vanishing

class Item {
  constructor(kind, x, y, data, burst) {
    this.kind = kind;          // 'fruit' | 'gem' | 'power' | 'letter'
    this.x = x;
    this.y = y;
    this.w = 13;
    this.h = 13;
    this.onGround = false;
    this.dead = false;
    this.life = 780;
    this.spin = Math.random() * Math.PI * 2;
    this.data = data || {};
    this.value = this.data.value || 0;
    this.floaty = (kind === 'letter');
    this.pickupT = ITEM_PICKUP_DELAY;

    /* loot arcs out of the burst so you can see it and go get it */
    if (burst) {
      this.vx = (Math.random() - 0.5) * 3.2;
      this.vy = -2.6 - Math.random() * 1.2;
    } else {
      this.vx = 0;
      this.vy = -1.0;
    }
  }

  update(game) {
    if (this.pickupT > 0) this.pickupT--;
    this.spin += 0.05;

    if (this.floaty) {
      this.y += Math.sin(this.spin) * 0.22 - 0.14;
      this.x += Math.cos(this.spin * 0.7) * 0.2;
      if (this.y < 10) this.y = 10;
      var lc = Math.floor(this.x / TILE), rc = Math.floor((this.x + this.w) / TILE);
      var mr = Math.floor((this.y + this.h / 2) / TILE);
      if (isSolid(game.level, lc, mr)) this.x = (lc + 1) * TILE;
      if (isSolid(game.level, rc, mr)) this.x = rc * TILE - this.w;
    } else {
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
      moveAndCollide(this, game.level);
      if (this.onGround) { this.vx *= 0.7; if (Math.abs(this.vx) < 0.05) this.vx = 0; }
    }
    if (--this.life <= 0) this.dead = true;
  }

  draw(ctx, t) {
    if (this.life < 130 && Math.floor(this.life / 5) % 2 === 0) return;
    var cx = this.x + this.w / 2;
    var cy = this.y + this.h / 2 + Math.sin(t * 0.06 + this.spin) * 0.7;

    if (this.kind === 'fruit') this.drawFruit(ctx, cx, cy);
    else if (this.kind === 'gem') this.drawGem(ctx, cx, cy);
    else if (this.kind === 'power') this.drawPower(ctx, cx, cy);
    else this.drawLetter(ctx, cx, cy);
  }

  drawFruit(ctx, cx, cy) {
    var f = this.data;
    ctx.globalAlpha = 0.25;
    oval(ctx, cx, cy + 6, 4.5, 1.6, '#000000');
    ctx.globalAlpha = 1;

    /* stalk + leaf */
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3);
    ctx.quadraticCurveTo(cx + 0.6, cy - 6, cx + 1.6, cy - 7);
    ctx.stroke();
    oval(ctx, cx + 3.2, cy - 6.6, 2.4, 1.3, f.c2);

    if (f.shape === 'cluster') {
      oval(ctx, cx - 2.4, cy, 2.5, 2.5, f.c1);
      oval(ctx, cx + 2.4, cy, 2.5, 2.5, f.c1);
      oval(ctx, cx, cy + 2.6, 2.5, 2.5, f.c1);
      oval(ctx, cx, cy - 1.4, 2.6, 2.6, f.c1);
    } else if (f.shape === 'cone') {
      ctx.fillStyle = f.c2;
      ctx.beginPath();
      ctx.moveTo(cx - 3.2, cy - 0.4);
      ctx.lineTo(cx + 3.2, cy - 0.4);
      ctx.lineTo(cx, cy + 6);
      ctx.closePath();
      ctx.fill();
      oval(ctx, cx, cy - 2, 4, 3.4, f.c1);
    } else if (f.shape === 'oval') {
      oval(ctx, cx, cy + 0.6, 3.4, 4.4, f.c1);
    } else {
      oval(ctx, cx, cy + 0.6, 4.3, 4.3, f.c1);
    }
    ctx.globalAlpha = 0.55;
    oval(ctx, cx - 1.6, cy - 1.2, 1.4, 1.0, '#ffffff');
    ctx.globalAlpha = 1;
  }

  drawGem(ctx, cx, cy) {
    var c = this.data.color;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(this.spin) * 0.14);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, -1.4);
    ctx.lineTo(0, 6);
    ctx.lineTo(-5, -1.4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(2.2, -1.4);
    ctx.lineTo(0, 1.2);
    ctx.lineTo(-2.2, -1.4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawPower(ctx, cx, cy) {
    var p = POWER_DEFS[this.data.power];
    ctx.globalAlpha = 0.3;
    oval(ctx, cx, cy, 8, 8, p.color);
    ctx.globalAlpha = 1;
    roundRect(ctx, cx - 5.5, cy - 5.5, 11, 11, 3.4);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
    txt(ctx, p.label, cx, cy + 0.4, 8, '#2b1630', 'center');
  }

  drawLetter(ctx, cx, cy) {
    ctx.globalAlpha = 0.35;
    oval(ctx, cx, cy, 9, 9, '#ffe14a');
    ctx.globalAlpha = 1;
    var g = ctx.createRadialGradient(cx - 2, cy - 2.5, 1, cx, cy, 7);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,225,74,0.20)');
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#ffe14a';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    txt(ctx, EXTEND_LETTERS[this.data.letter], cx, cy + 0.4, 9, '#fff6c4', 'center');
  }
}

/* ==================================================================
   ELEMENTAL EFFECTS
   ================================================================== */
class WaterDrop {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.w = 10; this.h = 10;
    this.dir = dir; this.vx = 0; this.vy = 1;
    this.onGround = false; this.dead = false; this.life = 420;
    this.trail = [];
  }
  update(game) {
    if (this.onGround) { this.vx = this.dir * 1.9; this.vy = 0.7; }
    else { this.vx = this.dir * 0.6; this.vy = Math.min(4.4, this.vy + 0.25); }
    moveAndCollide(this, game.level);
    if (this.hitWall) this.dir *= -1;
    this.trail.push({ x: this.x, y: this.y, t: 18 });
    if (this.trail.length > 24) this.trail.shift();
    for (var i = 0; i < this.trail.length; i++) this.trail[i].t--;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    for (var i = 0; i < this.trail.length; i++) {
      var s = this.trail[i];
      ctx.globalAlpha = Math.max(0.1, s.t / 18) * 0.55;
      oval(ctx, s.x + 5, s.y + 6, 5, 4, '#3aa8ff');
    }
    ctx.globalAlpha = 1;
    oval(ctx, this.x + 5, this.y + 5, 5.4, 5, '#7fd0ff');
    ctx.globalAlpha = 0.8;
    oval(ctx, this.x + 3.2, this.y + 3.2, 1.8, 1.2, '#ffffff');
    ctx.globalAlpha = 1;
  }
}

class FireDrop {
  constructor(x, y, dir, spread) {
    this.x = x; this.y = y; this.w = 10; this.h = 10;
    this.dir = dir; this.vx = dir * 0.6; this.vy = 0.5;
    this.onGround = false; this.dead = false;
    this.spread = spread === undefined ? 5 : spread;
    this.life = 160; this.anim = 0;
  }
  update(game) {
    this.anim += 0.4;
    if (!this.onGround) {
      this.vy = Math.min(4.5, this.vy + 0.28);
      this.vx = this.dir * 0.6;
      moveAndCollide(this, game.level);
      if (this.onGround && this.spread > 0) {
        var next = this.spread - 1;
        this.spread = 0;
        if (game.effects.length < 40) {
          game.effects.push(new FireDrop(this.x + this.dir * 12, this.y - 7, this.dir, next));
          Sound.play('fire');
        }
      }
    } else {
      this.vx = 0; this.vy = 0.5;
      moveAndCollide(this, game.level);
      if (--this.life <= 0) this.dead = true;
    }
  }
  draw(ctx) {
    var f = Math.sin(this.anim) * 1.2;
    var cx = this.x + 5, cy = this.y + 6;
    ctx.fillStyle = '#ff4a10';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7 - f);
    ctx.quadraticCurveTo(cx + 5, cy - 1, cx + 3, cy + 4);
    ctx.quadraticCurveTo(cx, cy + 6, cx - 3, cy + 4);
    ctx.quadraticCurveTo(cx - 5, cy - 1, cx, cy - 7 - f);
    ctx.fill();
    ctx.fillStyle = '#ffc84a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3 - f * 0.6);
    ctx.quadraticCurveTo(cx + 2.4, cy + 0.6, cx, cy + 3.6);
    ctx.quadraticCurveTo(cx - 2.4, cy + 0.6, cx, cy - 3 - f * 0.6);
    ctx.fill();
  }
}

class Bolt {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.w = 18; this.h = 8;
    this.dir = dir; this.dead = false; this.anim = 0;
  }
  update() {
    this.x += this.dir * 5.4;
    this.anim += 0.5;
    if (this.x < -24 || this.x > WORLD_W + 24) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    oval(ctx, this.x + 9, this.y + 4, 12, 5, '#ffe14a');
    ctx.globalAlpha = 1;
    ctx.fillStyle = Math.floor(this.anim) % 2 ? '#ffffff' : '#ffe14a';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + 2);
    for (var i = 0; i < 4; i++) {
      ctx.lineTo(this.x + i * 4.5 + 2.2, this.y + (i % 2 ? 0 : 6));
      ctx.lineTo(this.x + (i + 1) * 4.5, this.y + (i % 2 ? 6 : 0));
    }
    ctx.lineTo(this.x + 18, this.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/* ==================================================================
   PARTICLES & SCORE POPS
   ================================================================== */
class Particle {
  constructor(x, y, vx, vy, color, life, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.color = color; this.life = life; this.max = life;
    this.size = size || 2.4;
    this.dead = false;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.12;
    this.vx *= 0.98;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    var k = Math.max(0, this.life / this.max);
    ctx.globalAlpha = k;
    oval(ctx, this.x, this.y, this.size * k, this.size * k, this.color);
    ctx.globalAlpha = 1;
  }
}

class ScorePop {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = String(text);
    this.color = color || '#ffffff';
    this.life = 70;
    this.dead = false;
  }
  update() {
    this.y -= 0.42;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.min(1, this.life / 24);
    txtGlow(ctx, this.text, this.x, this.y, 10, this.color, 'center');
    ctx.globalAlpha = 1;
  }
}
