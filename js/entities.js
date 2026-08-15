/* ------------------------------------------------------------------
   entities.js - physics helpers, players, bubbles, monsters, items,
                 elemental effects and particles
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

/* Fall off the bottom of the screen, come back in at the top. */
function wrapVertical(e) {
  if (e.y > WORLD_H) e.y = -e.h;
  else if (e.y + e.h < 0) e.y = WORLD_H;
}

/* Axis-separated tile collision.
   Solid 'X' blocks all four directions; '#' only catches a falling
   entity whose feet were above the platform on the previous step. */
function moveAndCollide(e, level) {
  e.hitWall = false;

  /* ---- horizontal ---- */
  e.x += e.vx;
  if (e.vx !== 0) {
    var r0 = Math.floor(e.y / TILE);
    var r1 = Math.floor((e.y + e.h - 1) / TILE);
    var col;
    if (e.vx > 0) {
      col = Math.floor((e.x + e.w - 1) / TILE);
      for (var r = r0; r <= r1; r++) {
        if (isSolid(level, col, r)) {
          e.x = col * TILE - e.w;
          e.hitWall = true;
          break;
        }
      }
    } else {
      col = Math.floor(e.x / TILE);
      for (var r2 = r0; r2 <= r1; r2++) {
        if (isSolid(level, col, r2)) {
          e.x = (col + 1) * TILE;
          e.hitWall = true;
          break;
        }
      }
    }
    if (e.hitWall) e.vx = 0;
  }

  /* ---- vertical ---- */
  var prevBottom = e.y + e.h;
  e.y += e.vy;
  e.onGround = false;
  e.hitCeiling = false;

  var c0 = Math.floor(e.x / TILE);
  var c1 = Math.floor((e.x + e.w - 1) / TILE);

  if (e.vy > 0) {
    /* the row the feet are moving INTO - using y+h (not y+h-1) keeps a
       resting entity reporting onGround every frame instead of flickering */
    var row = Math.floor((e.y + e.h) / TILE);
    for (var c = c0; c <= c1; c++) {
      var t = tileAt(level, c, row);
      var landing = (t === 'X') || (t === '#' && prevBottom <= row * TILE);
      if (landing) {
        e.y = row * TILE - e.h;
        e.vy = 0;
        e.onGround = true;
        break;
      }
    }
  } else if (e.vy < 0) {
    var row2 = Math.floor(e.y / TILE);
    for (var c2 = c0; c2 <= c1; c2++) {
      if (isSolid(level, c2, row2)) {
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
    this.name = index === 0 ? 'BUB' : 'BOB';
    this.color = index === 0 ? '#4cf05c' : '#5c9cff';
    this.w = 12;
    this.h = 14;
    this.lives = 3;
    this.score = 0;
    this.letters = [false, false, false, false, false, false];
    this.active = true;
    this.reset(TILE * 2, TILE * 12);
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
    this.animT = 0;
    this.trapBubble = null;
    this.respawn = 0;
  }

  clearPowers() {
    this.shoes = false;
    this.rapid = false;
    this.fastBubble = false;
    this.longBubble = false;
    this.ringBonus = 0;
  }

  get sprite() { return this.index === 0 ? SPR.bub : SPR.bob; }

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
      var b = this.trapBubble;
      this.x = b.x - this.w / 2;
      this.y = b.y - this.h / 2;
      return;
    }

    if (this.invuln > 0) this.invuln--;
    if (this.bubbleCd > 0) this.bubbleCd--;

    var speed = this.shoes ? RUN_SPEED_FAST : RUN_SPEED;
    var moving = false;
    if (input.left && !input.right) { this.vx = -speed; this.facing = -1; moving = true; }
    else if (input.right && !input.left) { this.vx = speed; this.facing = 1; moving = true; }
    else this.vx = 0;

    if (input.jumpPressed && this.onGround) {
      this.vy = JUMP_V;
      this.onGround = false;
      Sound.play('jump');
    }

    if (input.firePressed && this.bubbleCd <= 0) {
      game.spawnPlayerBubble(this);
      this.bubbleCd = this.rapid ? 8 : 20;
      Sound.play('bubble');
      if (this.ringBonus) this.addScore(this.ringBonus);
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    moveAndCollide(this, game.level);

    this.animT += moving ? 0.25 : 0.08;
  }

  draw(ctx) {
    if (this.dying > 0) {
      /* spin-out on death */
      var f = Math.floor(this.dying / 4) % 2;
      ctx.globalAlpha = 0.9;
      drawSprite(ctx, this.sprite, this.x - 2, this.y - 2, f === 1);
      ctx.globalAlpha = 1;
      return;
    }
    if (!this.alive || this.respawn > 0) return;
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) return;

    var bob = this.onGround ? Math.floor(Math.sin(this.animT * 2) * 1.4) : 0;
    drawSprite(ctx, this.sprite, this.x - 2, this.y - 2 + bob, this.facing < 0);
  }
}

/* ==================================================================
   BUBBLE
   ================================================================== */
var BUBBLE_LIFE = 480;      // 8 seconds afloat before it bursts by itself
var ESCAPE_TIME = 360;      // 6 seconds before a trapped monster breaks free

class Bubble {
  constructor(x, y, dir, owner, opts) {
    opts = opts || {};
    this.x = x;
    this.y = y;
    this.r = 8;
    this.dir = dir;
    this.owner = owner;
    this.vx = dir * (opts.speed || 3.2);
    this.vy = 0;
    this.phase = 'shoot';
    this.rangeT = opts.range || 26;
    this.life = BUBBLE_LIFE;
    this.content = null;        // 'water' | 'fire' | 'lightning'
    this.enemy = null;          // trapped monster
    this.player = null;         // trapped player
    this.escapeT = 0;
    this.dead = false;
    this.wobble = Math.random() * Math.PI * 2;
    this.canTrap = true;
    this.age = 0;
  }

  get trapped() { return !!(this.enemy || this.player); }

  trap(enemy) {
    this.enemy = enemy;
    this.phase = 'float';
    this.vx = 0;
    this.vy = 0;
    this.r = 9;
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
    this.r = 9;
    this.escapeT = 300;
    this.canTrap = false;
  }

  update(game) {
    this.age++;
    this.wobble += 0.12;
    if (this.age > 40) this.canTrap = false;

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
      /* drift on the level's current, rise, and settle under the ceiling */
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
      if (this.y - this.r < 0) { this.y = this.r; this.vy = 0; }
    }

    if (this.escapeT > 0 && --this.escapeT === 0) {
      if (this.enemy) game.releaseEnemy(this);
      else if (this.player) game.freePlayer(this);
    }

    if (--this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    var flicker = this.life < 90 && Math.floor(this.life / 5) % 2 === 0;
    if (flicker) return;

    var x = this.x, y = this.y, r = this.r;

    /* trapped monster / player rides inside */
    if (this.enemy) {
      var warn = this.escapeT < 90 && Math.floor(this.escapeT / 6) % 2 === 0;
      var spr = this.enemy.spriteFor(warn);
      drawSpriteScaled(ctx, spr, x - 6, y - 6, 12, this.enemy.dir < 0);
    } else if (this.player) {
      drawSpriteScaled(ctx, this.player.sprite, x - 6, y - 6, 12, this.player.facing < 0);
    } else if (this.content) {
      drawElementIcon(ctx, this.content, x, y);
    }

    var ring = '#cfe8ff';
    if (this.content === 'water') ring = '#5cc8ff';
    else if (this.content === 'fire') ring = '#ff9040';
    else if (this.content === 'lightning') ring = '#ffe14a';
    else if (this.enemy) ring = '#ffffff';

    ctx.strokeStyle = ring;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = this.trapped ? 0.14 : 0.24;
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* highlight */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x - r * 0.55), Math.round(y - r * 0.6), 2, 1);
    ctx.fillRect(Math.round(x - r * 0.65), Math.round(y - r * 0.35), 1, 2);
  }
}

function drawElementIcon(ctx, kind, x, y) {
  if (kind === 'water') {
    ctx.fillStyle = '#3aa8ff';
    ctx.fillRect(x - 3, y - 1, 6, 4);
    ctx.fillRect(x - 2, y - 3, 4, 2);
    ctx.fillStyle = '#bfe8ff';
    ctx.fillRect(x - 2, y, 2, 1);
  } else if (kind === 'fire') {
    ctx.fillStyle = '#ff5a20';
    ctx.fillRect(x - 2, y - 1, 4, 4);
    ctx.fillStyle = '#ffd040';
    ctx.fillRect(x - 1, y - 3, 2, 4);
  } else {
    ctx.fillStyle = '#ffe14a';
    ctx.fillRect(x - 1, y - 4, 3, 3);
    ctx.fillRect(x - 2, y - 1, 3, 3);
    ctx.fillRect(x, y + 1, 2, 3);
  }
}

/* ==================================================================
   MONSTERS
   ================================================================== */
var ENEMY_DEFS = {
  zen:     { w: 13, h: 14, speed: 0.48, spr: 'zen', mad: 'zenMad', gravity: true },
  mighta:  { w: 13, h: 14, speed: 0.38, spr: 'mighta', mad: 'mightaMad', gravity: true },
  monsta:  { w: 14, h: 13, speed: 0.95, spr: 'monsta', mad: 'monstaMad', gravity: false },
  banebou: { w: 13, h: 14, speed: 0.75, spr: 'banebou', mad: 'banebouMad', gravity: true }
};

class Enemy {
  constructor(type, col, row, difficulty) {
    var d = ENEMY_DEFS[type];
    this.type = type;
    this.def = d;
    this.w = d.w;
    this.h = d.h;
    this.x = col * TILE + (TILE - d.w) / 2;
    this.y = row * TILE + (TILE - d.h);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.angry = false;
    this.dead = false;
    this.bubbled = false;
    this.difficulty = difficulty || 0;
    this.jumpT = 60 + Math.floor(Math.random() * 120);
    this.shootT = 90 + Math.floor(Math.random() * 90);
    this.hopT = 20 + Math.floor(Math.random() * 40);
    this.animT = Math.random() * 10;
    if (type === 'monsta') {
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

  spriteFor(forceMad) {
    return (this.angry || forceMad) ? SPR[this.def.mad] : SPR[this.def.spr];
  }

  enrage() { this.angry = true; }

  update(game) {
    if (this.bubbled) return;
    this.animT += 0.15;
    var lvl = game.level;
    var spd = this.speed();

    if (this.type === 'monsta') {
      /* free flier: straight lines, bounces off solid blocks only */
      var len = Math.hypot(this.vx, this.vy) || 1;
      this.vx = this.vx / len * spd;
      this.vy = this.vy / len * spd;
      var oldVx = this.vx, oldVy = this.vy;
      moveAndCollide(this, lvl);
      if (this.hitWall) { this.vx = -oldVx; this.dir = this.vx < 0 ? -1 : 1; }
      if (this.onGround || this.hitCeiling) this.vy = -oldVy;
      if (this.vy === 0) this.vy = oldVy < 0 ? 0.5 : -0.5;
      this.dir = this.vx < 0 ? -1 : 1;
      return;
    }

    if (this.type === 'banebou') {
      if (this.onGround) {
        if (--this.hopT <= 0) {
          this.vy = -4.3;
          this.hopT = 24 + Math.floor(Math.random() * 26);
          if (Math.random() < 0.25) this.dir *= -1;
        }
        this.vx = 0;
      } else {
        this.vx = this.dir * spd;
      }
    } else {
      this.vx = this.dir * spd;

      /* turn at walls and at the edge of a platform (sometimes jump instead) */
      if (this.onGround && !groundAhead(this, lvl, this.dir)) {
        if (this.type === 'zen' && Math.random() < 0.35) this.vy = JUMP_V;
        else this.dir *= -1;
      }

      if (this.type === 'zen' && this.onGround && --this.jumpT <= 0) {
        this.jumpT = 70 + Math.floor(Math.random() * 140);
        var target = game.nearestPlayer(this);
        if (target && target.y + target.h < this.y - 8) this.vy = JUMP_V;
        else if (Math.random() < 0.4) this.vy = JUMP_V;
      }

      if (this.type === 'mighta' && --this.shootT <= 0) {
        this.shootT = (this.angry ? 70 : 130) + Math.floor(Math.random() * 70);
        game.rocks.push(new Rock(
          this.x + (this.dir > 0 ? this.w : -6),
          this.y + 4, this.dir
        ));
        Sound.play('pop');
      }
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    moveAndCollide(this, lvl);
    if (this.hitWall) this.dir *= -1;
  }

  draw(ctx) {
    if (this.bubbled) return;
    var bob = this.onGround ? Math.floor(Math.sin(this.animT) * 1.2) : 0;
    drawSprite(ctx, this.spriteFor(false), this.x - 2, this.y - 2 + bob, this.dir < 0);
  }
}

/* Mighta's thrown boulder */
class Rock {
  constructor(x, y, dir) {
    this.x = x;
    this.y = y;
    this.w = 6;
    this.h = 6;
    this.vx = dir * 1.8;
    this.vy = 0;
    this.spin = 0;
    this.dead = false;
    this.life = 240;
  }
  update(game) {
    this.x += this.vx;
    this.spin += 0.3;
    var col = Math.floor((this.x + (this.vx > 0 ? this.w : 0)) / TILE);
    var row = Math.floor((this.y + this.h / 2) / TILE);
    if (isSolid(game.level, col, row)) this.dead = true;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.fillStyle = '#a08060';
    ctx.fillRect(this.x, this.y, 6, 6);
    ctx.fillStyle = '#d0b090';
    ctx.fillRect(this.x + 1, this.y + 1, 2, 2);
    ctx.fillStyle = '#604020';
    ctx.fillRect(this.x + 3, this.y + 3, 2, 2);
  }
}

/* The invincible hunter that shows up after HURRY UP! */
class Skel {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 13;
    this.h = 14;
    this.dir = 1;
    this.animT = 0;
  }
  update(game) {
    var t = game.nearestPlayer(this);
    this.animT += 0.2;
    if (!t) return;
    var dx = (t.x - this.x), dy = (t.y - this.y);
    var d = Math.hypot(dx, dy) || 1;
    var spd = 0.75;
    this.x += dx / d * spd;
    this.y += dy / d * spd;
    this.dir = dx < 0 ? -1 : 1;
  }
  draw(ctx) {
    ctx.globalAlpha = 0.85 + Math.sin(this.animT) * 0.12;
    drawSprite(ctx, SPR.skel, this.x - 2, this.y - 2, this.dir < 0);
    ctx.globalAlpha = 1;
  }
}

/* ==================================================================
   ITEMS - fruit, gems, power-ups and EXTEND letters
   ================================================================== */
var FRUIT_TABLE = [
  { name: 'cherry', c1: '#ff3050', c2: '#30b030', value: 500 },
  { name: 'apple', c1: '#ff5030', c2: '#30b030', value: 1000 },
  { name: 'orange', c1: '#ff9020', c2: '#30b030', value: 1500 },
  { name: 'lemon', c1: '#ffe030', c2: '#30b030', value: 2000 },
  { name: 'melon', c1: '#40c060', c2: '#a0f0a0', value: 2500 },
  { name: 'grape', c1: '#a050e0', c2: '#30b030', value: 3000 },
  { name: 'peach', c1: '#ff90b0', c2: '#30b030', value: 4000 },
  { name: 'plum', c1: '#7050d0', c2: '#30b030', value: 5000 },
  { name: 'cake', c1: '#ffd0a0', c2: '#ff5080', value: 6000 }
];

var POWER_DEFS = {
  shoes:  { color: '#ff4040', value: 100, label: 'S' },
  candyY: { color: '#ffe030', value: 100, label: 'Y' },
  candyB: { color: '#40b0ff', value: 100, label: 'B' },
  candyP: { color: '#c060ff', value: 100, label: 'P' },
  ring:   { color: '#ff40a0', value: 1000, label: 'R' }
};

class Item {
  constructor(kind, x, y, data) {
    this.kind = kind;          // 'fruit' | 'gem' | 'power' | 'letter'
    this.x = x;
    this.y = y;
    this.w = 10;
    this.h = 10;
    this.vx = 0;
    this.vy = -1.2;
    this.onGround = false;
    this.dead = false;
    this.life = 700;
    this.bob = Math.random() * 6;
    this.data = data || {};
    this.value = this.data.value || 0;
    this.floaty = (kind === 'letter');
  }

  update(game) {
    if (this.floaty) {
      this.bob += 0.06;
      this.y += Math.sin(this.bob) * 0.25 - 0.12;
      this.x += Math.cos(this.bob * 0.7) * 0.2;
      if (this.y < 8) this.y = 8;
      var lc = Math.floor(this.x / TILE), rc = Math.floor((this.x + this.w) / TILE);
      var mr = Math.floor((this.y + this.h / 2) / TILE);
      if (isSolid(game.level, lc, mr)) this.x = (lc + 1) * TILE;
      if (isSolid(game.level, rc, mr)) this.x = rc * TILE - this.w;
    } else {
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
      moveAndCollide(this, game.level);
      if (this.onGround) this.vx = 0;
    }
    if (--this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    if (this.life < 120 && Math.floor(this.life / 5) % 2 === 0) return;
    var x = Math.round(this.x), y = Math.round(this.y);

    if (this.kind === 'fruit') {
      var f = this.data;
      ctx.fillStyle = f.c2;
      ctx.fillRect(x + 4, y, 2, 3);
      ctx.fillRect(x + 6, y, 2, 1);
      ctx.fillStyle = f.c1;
      ctx.fillRect(x + 1, y + 3, 8, 6);
      ctx.fillRect(x + 2, y + 2, 6, 1);
      ctx.fillRect(x + 2, y + 9, 6, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 2, y + 4, 2, 2);
    } else if (this.kind === 'gem') {
      ctx.fillStyle = this.data.color;
      ctx.fillRect(x + 3, y + 1, 4, 1);
      ctx.fillRect(x + 2, y + 2, 6, 2);
      ctx.fillRect(x + 1, y + 4, 8, 2);
      ctx.fillRect(x + 2, y + 6, 6, 2);
      ctx.fillRect(x + 3, y + 8, 4, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x + 3, y + 3, 2, 2);
    } else if (this.kind === 'power') {
      var p = POWER_DEFS[this.data.power];
      ctx.fillStyle = '#101018';
      ctx.fillRect(x, y, 10, 10);
      ctx.fillStyle = p.color;
      ctx.fillRect(x + 1, y + 1, 8, 8);
      drawText(ctx, p.label, x + 4, y + 3, 1, '#101018');
    } else {
      /* EXTEND letter in a shining bubble */
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + 5, y + 5, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      drawText(ctx, EXTEND_LETTERS[this.data.letter], x + 4, y + 3, 1, '#ffe14a');
    }
  }
}

/* ==================================================================
   ELEMENTAL EFFECTS
   ================================================================== */

/* Water: pours down, then runs along the floor away from the popper. */
class WaterDrop {
  constructor(x, y, dir) {
    this.x = x;
    this.y = y;
    this.w = 8;
    this.h = 8;
    this.dir = dir;
    this.vx = 0;
    this.vy = 1;
    this.onGround = false;
    this.dead = false;
    this.life = 420;
    this.trail = [];
  }
  update(game) {
    if (this.onGround) {
      this.vx = this.dir * 1.7;
      this.vy = 0.6;
    } else {
      this.vx = this.dir * 0.5;
      this.vy = Math.min(4, this.vy + 0.25);
    }
    moveAndCollide(this, game.level);
    if (this.hitWall) this.dir *= -1;
    this.trail.push({ x: this.x, y: this.y, t: 16 });
    if (this.trail.length > 22) this.trail.shift();
    for (var i = 0; i < this.trail.length; i++) this.trail[i].t--;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    for (var i = 0; i < this.trail.length; i++) {
      var t = this.trail[i];
      ctx.globalAlpha = Math.max(0.15, t.t / 16) * 0.7;
      ctx.fillStyle = '#3aa8ff';
      ctx.fillRect(Math.round(t.x), Math.round(t.y + 2), 8, 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#7fd0ff';
    ctx.fillRect(Math.round(this.x), Math.round(this.y), 8, 8);
    ctx.fillStyle = '#e0f4ff';
    ctx.fillRect(Math.round(this.x + 1), Math.round(this.y + 1), 3, 2);
  }
}

/* Fire: droplets fall, then spread into a burning patch along the ground. */
class FireDrop {
  constructor(x, y, dir, spread) {
    this.x = x;
    this.y = y;
    this.w = 8;
    this.h = 8;
    this.dir = dir;
    this.vx = dir * 0.6;
    this.vy = 0.5;
    this.onGround = false;
    this.dead = false;
    this.spread = spread === undefined ? 5 : spread;
    this.life = 150;
    this.anim = 0;
  }
  update(game) {
    this.anim += 0.4;
    if (!this.onGround) {
      this.vy = Math.min(4.5, this.vy + 0.28);
      this.vx = this.dir * 0.6;
      moveAndCollide(this, game.level);
      if (this.onGround && this.spread > 0) {
        var next = this.spread - 1;
        this.spread = 0;                 /* each drop only ever seeds one more */
        if (game.effects.length < 40) {
          game.effects.push(new FireDrop(this.x + this.dir * 10, this.y - 6, this.dir, next));
          Sound.play('fire');
        }
      }
    } else {
      this.vx = 0;
      this.vy = 0.5;
      moveAndCollide(this, game.level);
      if (--this.life <= 0) this.dead = true;
    }
  }
  draw(ctx) {
    var f = Math.floor(this.anim) % 2;
    var x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = '#ff4a10';
    ctx.fillRect(x, y + 2, 8, 6);
    ctx.fillStyle = '#ffa020';
    ctx.fillRect(x + 1, y + f, 6, 6);
    ctx.fillStyle = '#ffe880';
    ctx.fillRect(x + 3, y + 3 + f, 2, 3);
  }
}

/* Lightning: a bolt that rips straight through walls. */
class Bolt {
  constructor(x, y, dir) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 6;
    this.dir = dir;
    this.dead = false;
    this.anim = 0;
  }
  update() {
    this.x += this.dir * 5.2;
    this.anim += 0.5;
    if (this.x < -20 || this.x > WORLD_W + 20) this.dead = true;
  }
  draw(ctx) {
    var x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = Math.floor(this.anim) % 2 ? '#ffffff' : '#ffe14a';
    for (var i = 0; i < 4; i++) {
      ctx.fillRect(x + i * 4, y + (i % 2 ? 0 : 3), 4, 3);
    }
  }
}

/* ==================================================================
   PARTICLES & FLOATING SCORE POPS
   ================================================================== */
class Particle {
  constructor(x, y, vx, vy, color, life, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.color = color; this.life = life; this.max = life;
    this.size = size || 2;
    this.dead = false;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.12;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life / this.max);
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

class ScorePop {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = String(text);
    this.color = color || '#ffffff';
    this.life = 60;
    this.dead = false;
  }
  update() {
    this.y -= 0.45;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.min(1, this.life / 22);
    drawTextCenteredShadow(ctx, this.text, this.x, this.y, 1, this.color);
    ctx.globalAlpha = 1;
  }
}
