/* ------------------------------------------------------------------
   game.js - modes, rounds, rules, scoring, HUD and screens
   ------------------------------------------------------------------ */

var MODES = [
  { id: '1p', label: 'SOLO', blurb: 'MOCHI TAKES ON THE CAVERN ALONE' },
  { id: 'coop', label: 'TEAM UP', blurb: 'MOCHI AND PUFF CLEAR ROUNDS TOGETHER' },
  { id: 'versus', label: 'VERSUS', blurb: 'BUBBLE YOUR RIVAL - TOP SCORE WINS' }
];

var ROUND_TIME = 2700;       // 45s before HURRY UP!
var HUNTER_DELAY = 600;      // 10s later the hunter arrives
var VERSUS_TIME = 120 * 60;

var Game = {
  state: 'title',
  menuIndex: 0,
  mode: '1p',
  round: 1,
  paused: false,
  hiScore: 30000,
  clock: 0,

  level: null,
  players: [],
  bubbles: [],
  enemies: [],
  rocks: [],
  items: [],
  effects: [],
  parts: [],
  pops: [],
  hunters: [],

  roundTimer: ROUND_TIME,
  hurry: false,
  hurryFlash: 0,
  hunterTimer: 0,
  killIndex: 0,
  specialTimer: 540,
  clearTimer: 0,
  readyTimer: 0,
  matchTimer: 0,
  versusSpawnTimer: 0,
  banner: '',
  bannerSub: '',
  endTimer: 0,
  shake: 0,

  /* ---------------------------------------------------------------- */
  init: function () {
    try {
      var hs = localStorage.getItem('bubblebobble.hiscore');
      if (hs) this.hiScore = Math.max(this.hiScore, parseInt(hs, 10) || 0);
    } catch (e) { /* storage may be unavailable */ }
  },

  saveHi: function () {
    try { localStorage.setItem('bubblebobble.hiscore', String(this.hiScore)); }
    catch (e) { /* ignore */ }
  },

  /* ---------------------------------------------------------------- */
  startGame: function (modeId) {
    this.mode = modeId;
    this.round = 1;
    this.players = [];
    var n = (modeId === '1p') ? 1 : 2;
    for (var i = 0; i < n; i++) this.players.push(new Player(i));
    Sound.play('start');
    Sound.startMusic();
    this.loadRound();
  },

  get difficulty() { return Math.floor((this.round - 1) / LEVELS.length); },

  loadRound: function () {
    var def = (this.mode === 'versus') ? VERSUS_LEVEL : LEVELS[(this.round - 1) % LEVELS.length];
    this.level = {
      tiles: def.tiles,
      theme: def.theme,
      drift: def.drift,
      spawn: def.spawn,
      _blocks: null
    };

    this.bubbles = [];
    this.enemies = [];
    this.rocks = [];
    this.items = [];
    this.effects = [];
    this.parts = [];
    this.pops = [];
    this.hunters = [];
    this.killIndex = 0;
    this.hurry = false;
    this.hurryFlash = 0;
    this.hunterTimer = 0;
    this.clearTimer = 0;
    this.specialTimer = 420;
    this.shake = 0;
    this.roundTimer = Math.max(1500, ROUND_TIME - this.difficulty * 300);

    var d = this.difficulty;
    if (this.mode === 'versus') {
      this.matchTimer = VERSUS_TIME;
      this.versusSpawnTimer = 60;
      for (var s = 0; s < 3; s++) this.spawnVersusMonster();
    } else {
      for (var i = 0; i < def.enemies.length; i++) {
        var e = def.enemies[i];
        this.enemies.push(new Enemy(e[0], e[1], e[2], d));
      }
      for (var k = 0; k < d && k < 4; k++) {
        this.enemies.push(new Enemy('chick', 4 + k * 5, 1, d));
      }
    }

    for (var p = 0; p < this.players.length; p++) {
      var pl = this.players[p];
      var sp = this.level.spawn[p] || this.level.spawn[0];
      pl.reset(sp[0] * TILE + 2, sp[1] * TILE - 3);
      pl.clearPowers();
      if (this.mode === 'versus') pl.lives = 0;
    }

    this.state = 'ready';
    this.readyTimer = 105;
    this.banner = this.mode === 'versus' ? 'VERSUS' : 'ROUND ' + this.round;
    this.bannerSub = this.mode === 'versus' ? 'BUBBLE YOUR RIVAL' : 'READY';
  },

  /* ---------------------------------------------------------------- */
  update: function (inputs, ui) {
    this.clock++;
    if (this.shake > 0) this.shake--;

    if (this.state === 'title') { this.updateTitle(ui); return; }

    if (ui.pausePressed && (this.state === 'play' || this.state === 'ready')) {
      this.paused = !this.paused;
      Sound.play('select');
    }
    if (ui.escapePressed) { this.toTitle(); return; }
    if (this.paused) return;

    Sound.tickMusic(this.hurry);

    if (this.state === 'ready') {
      if (--this.readyTimer <= 0) this.state = 'play';
      this.updateWorld(inputs, true);
      return;
    }
    if (this.state === 'play') {
      this.updateWorld(inputs, false);
      return;
    }
    if (this.state === 'clear') {
      this.updateWorld(inputs, true);
      if (--this.clearTimer <= 0) { this.round++; this.loadRound(); }
      return;
    }
    if (this.state === 'gameover' || this.state === 'versusover') {
      this.updateWorld(inputs, true);
      if (this.endTimer > 0) this.endTimer--;
      if (this.endTimer <= 0 && ui.confirmPressed) this.toTitle();
    }
  },

  toTitle: function () {
    this.state = 'title';
    this.paused = false;
    Sound.stopMusic();
    Sound.play('select');
  },

  updateTitle: function (ui) {
    if (ui.upPressed) { this.menuIndex = (this.menuIndex + MODES.length - 1) % MODES.length; Sound.play('select'); }
    if (ui.downPressed) { this.menuIndex = (this.menuIndex + 1) % MODES.length; Sound.play('select'); }
    if (ui.confirmPressed) this.startGame(MODES[this.menuIndex].id);
  },

  /* ---------------------------------------------------------------- */
  updateWorld: function (inputs, frozen) {
    var i;

    if (!frozen) {
      for (i = 0; i < this.players.length; i++) {
        var p = this.players[i];
        if (p.active) p.update(inputs[i] || EMPTY_INPUT, this);
      }
      for (i = 0; i < this.enemies.length; i++) this.enemies[i].update(this);
      for (i = 0; i < this.rocks.length; i++) this.rocks[i].update(this);
      for (i = 0; i < this.hunters.length; i++) this.hunters[i].update(this);
    }

    for (i = 0; i < this.bubbles.length; i++) this.bubbles[i].update(this);
    for (i = 0; i < this.items.length; i++) this.items[i].update(this);
    var nEffects = this.effects.length;
    for (i = 0; i < nEffects; i++) this.effects[i].update(this);
    for (i = 0; i < this.parts.length; i++) this.parts[i].update();
    for (i = 0; i < this.pops.length; i++) this.pops[i].update();

    this.separateBubbles();

    if (!frozen) { this.collide(); this.timers(); }
    if (this.state === 'clear') this.vacuumItems();

    this.bubbles = this.bubbles.filter(notDead);
    this.enemies = this.enemies.filter(notDead);
    this.rocks = this.rocks.filter(notDead);
    this.items = this.items.filter(notDead);
    this.effects = this.effects.filter(notDead);
    this.parts = this.parts.filter(notDead);
    this.pops = this.pops.filter(notDead);
  },

  timers: function () {
    if (--this.specialTimer <= 0) {
      this.specialTimer = 500 + Math.floor(Math.random() * 300);
      this.spawnSpecialBubble();
    }

    if (this.mode === 'versus') {
      if (--this.versusSpawnTimer <= 0) {
        this.versusSpawnTimer = 170;
        if (this.enemies.length < 6) this.spawnVersusMonster();
      }
      if (--this.matchTimer <= 0) this.endVersus();
      return;
    }

    if (!this.hurry) {
      if (--this.roundTimer <= 0) {
        this.hurry = true;
        this.hurryFlash = 200;
        this.hunterTimer = HUNTER_DELAY;
        this.shake = 20;
        Sound.play('hurry');
        for (var i = 0; i < this.enemies.length; i++) this.enemies[i].enrage();
      }
    } else {
      if (this.hurryFlash > 0) this.hurryFlash--;
      if (--this.hunterTimer <= 0) {
        this.hunterTimer = 900;
        if (this.hunters.length < 2) {
          this.hunters.push(new Hunter(this.hunters.length === 0 ? 20 : WORLD_W - 36, 30));
          Sound.play('death');
        }
      }
    }

    if (this.state === 'play' && this.enemies.length === 0) {
      this.state = 'clear';
      this.clearTimer = 180;
      this.banner = 'ROUND CLEAR';
      this.bannerSub = '';
      Sound.play('clear');
      this.hunters = [];
    }
  },

  /* ---------------------------------------------------------------- */
  separateBubbles: function () {
    for (var i = 0; i < this.bubbles.length; i++) {
      var a = this.bubbles[i];
      if (a.phase !== 'float') continue;
      for (var j = i + 1; j < this.bubbles.length; j++) {
        var b = this.bubbles[j];
        if (b.phase !== 'float') continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.hypot(dx, dy);
        var min = a.r + b.r - 1;
        if (d > 0.01 && d < min) {
          var push = (min - d) * 0.25;
          dx /= d; dy /= d;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }
  },

  collide: function () {
    var i, j, p, b, e;

    /* --- bubbles catch monsters --- */
    for (i = 0; i < this.bubbles.length; i++) {
      b = this.bubbles[i];
      if (b.dead || b.trapped || b.content || !b.canTrap) continue;
      var box = bubbleBox(b);
      for (j = 0; j < this.enemies.length; j++) {
        e = this.enemies[j];
        if (e.bubbled || e.dead) continue;
        if (rectsOverlap(box, e)) {
          e.bubbled = true;
          b.trap(e);
          b.x = e.x + e.w / 2;
          b.y = e.y + e.h / 2;
          Sound.play('trap');
          break;
        }
      }
    }

    /* --- players vs bubbles (ride the empty ones, burst the rest) --- */
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (!p.active || !p.alive || p.dying > 0 || p.respawn > 0 || p.trapBubble) continue;
      for (j = 0; j < this.bubbles.length; j++) {
        b = this.bubbles[j];
        if (b.dead) continue;
        if (b.owner === p && b.age < 14) continue;
        if (b.player === p) continue;

        var top = b.y - b.r;
        var pb = p.y + p.h;
        var horizontally = (p.x + p.w > b.x - b.r + 1) && (p.x < b.x + b.r - 1);

        /* a generous landing window makes bubble-riding easy to pull off */
        if (!b.trapped && !b.content && p.vy >= 0 && horizontally &&
            pb - p.vy <= top + 6 && pb >= top - 1 && pb <= top + 13) {
          p.y = top - p.h;
          p.vy = 0;
          p.onGround = true;
          p.coyote = COYOTE_FRAMES;
          p.riding = b;
          b.y += 0.10;             /* your weight barely slows the rise */
          continue;
        }

        if (rectsOverlap(p, bubbleBox(b))) this.popBubble(b, p);
      }
    }

    /* --- monsters hurt players --- */
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (!this.playerVulnerable(p)) continue;
      for (j = 0; j < this.enemies.length; j++) {
        e = this.enemies[j];
        if (e.bubbled || e.dead) continue;
        if (rectsOverlap(p, e)) { this.killPlayer(p); break; }
      }
    }

    /* --- stars --- */
    for (i = 0; i < this.rocks.length; i++) {
      var r = this.rocks[i];
      if (r.dead) continue;
      for (j = 0; j < this.players.length; j++) {
        p = this.players[j];
        if (!this.playerVulnerable(p)) continue;
        if (rectsOverlap(p, r)) { this.killPlayer(p); r.dead = true; break; }
      }
    }

    /* --- the hunter --- */
    for (i = 0; i < this.hunters.length; i++) {
      var s = this.hunters[i];
      for (j = 0; j < this.players.length; j++) {
        p = this.players[j];
        if (!this.playerVulnerable(p)) continue;
        if (rectsOverlap(p, s)) this.killPlayer(p);
      }
    }

    /* --- elemental effects wipe out monsters --- */
    for (i = 0; i < this.effects.length; i++) {
      var fx = this.effects[i];
      if (fx.dead) continue;
      var gem = fx instanceof Bolt ? { color: '#ffe14a', value: 8000 }
              : fx instanceof WaterDrop ? { color: '#4ab8ff', value: 7000 }
              : { color: '#ff5a3c', value: 5000 };
      for (j = 0; j < this.enemies.length; j++) {
        e = this.enemies[j];
        if (e.dead || e.bubbled) continue;
        if (rectsOverlap(fx, e)) {
          e.dead = true;
          this.burst(e.x + e.w / 2, e.y + e.h / 2, gem.color);
          this.items.push(new Item('gem', e.x + 1, e.y + 2, gem, true));
          Sound.play('kill');
        }
      }
    }

    /* --- picking things up (loot needs a moment in the air first) --- */
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.dead || it.pickupT > 0) continue;
      for (j = 0; j < this.players.length; j++) {
        p = this.players[j];
        if (!p.active || !p.alive || p.dying > 0 || p.respawn > 0 || p.trapBubble) continue;
        if (rectsOverlap(p, it)) { this.collectItem(it, p); break; }
      }
    }
  },

  playerVulnerable: function (p) {
    return p.active && p.alive && p.dying === 0 && p.respawn === 0 &&
           p.invuln === 0 && !p.trapBubble;
  },

  /* ---------------------------------------------------------------- */
  spawnPlayerBubble: function (p) {
    var dir = p.facing;
    var b = new Bubble(
      p.x + p.w / 2 + dir * 12,
      p.y + 5,
      dir, p,
      { speed: p.fastBubble ? 4.6 : 3.4, range: p.longBubble ? 44 : 28 }
    );
    this.bubbles.push(b);

    for (var i = 0; i < this.players.length; i++) {
      var o = this.players[i];
      if (o === p || !o.active || !o.alive || o.trapBubble || o.dying > 0 || o.respawn > 0) continue;
      if (rectsOverlap(o, bubbleBox(b))) {
        b.trapPlayer(o);
        b.x = o.x + o.w / 2;
        b.y = o.y + o.h / 2;
        Sound.play('trap');
      }
    }
  },

  spawnSpecialBubble: function () {
    var kinds = ['water', 'fire', 'lightning'];
    var kind = kinds[Math.floor(Math.random() * kinds.length)];
    var fromLeft = Math.random() < 0.5;
    var b = new Bubble(fromLeft ? TILE * 2 : WORLD_W - TILE * 2, WORLD_H - TILE * 2,
                       fromLeft ? 1 : -1, null, {});
    b.phase = 'float';
    b.vx = 0;
    b.content = kind;
    b.canTrap = false;
    b.life = 640;
    this.bubbles.push(b);
  },

  spawnVersusMonster: function () {
    var pt = VERSUS_SPAWN_POINTS[Math.floor(Math.random() * VERSUS_SPAWN_POINTS.length)];
    var t = VERSUS_TYPES[Math.floor(Math.random() * VERSUS_TYPES.length)];
    this.enemies.push(new Enemy(t, pt[0], pt[1], 1));
  },

  /* ---------------------------------------------------------------- */
  popBubble: function (b, popper) {
    if (b.dead) return;

    if (b.enemy) { this.popTrappedCluster(b, popper); return; }

    if (b.player) {
      b.dead = true;
      var victim = b.player;
      victim.trapBubble = null;
      b.player = null;
      victim.x = b.x - victim.w / 2;
      victim.y = b.y - victim.h / 2;
      victim.vy = 0;
      if (this.mode === 'versus' && popper !== victim) {
        popper.addScore(2000);
        this.pops.push(new ScorePop(b.x, b.y - 10, '2000', popper.color));
        victim.score = Math.max(0, victim.score - 500);
        this.burst(b.x, b.y, victim.color);
        victim.invuln = 120;
        Sound.play('kill');
      } else {
        victim.invuln = 60;
        Sound.play('pop');
      }
      return;
    }

    if (b.content) { b.dead = true; this.triggerElement(b, popper); return; }

    b.dead = true;
    popper.addScore(10);
    this.burst(b.x, b.y, '#cfe8ff');
    Sound.play('pop');
  },

  /* Popping several trapped monsters together: 1000 * 2^(n-1) */
  popTrappedCluster: function (start, popper) {
    var cluster = [];
    var queue = [start];
    while (queue.length) {
      var b = queue.pop();
      if (b.dead || !b.enemy || cluster.indexOf(b) >= 0) continue;
      cluster.push(b);
      for (var i = 0; i < this.bubbles.length; i++) {
        var o = this.bubbles[i];
        if (o === b || o.dead || !o.enemy || cluster.indexOf(o) >= 0) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) <= b.r + o.r + 8) queue.push(o);
      }
    }

    var n = cluster.length;
    var bonus = 1000 * Math.pow(2, n - 1);
    popper.addScore(bonus);
    if (n > 1) this.shake = 12;

    var cx = 0, cy = 0;
    for (var k = 0; k < n; k++) {
      var bb = cluster[k];
      cx += bb.x; cy += bb.y;
      bb.dead = true;
      var e = bb.enemy;
      bb.enemy = null;
      e.dead = true;
      this.burst(bb.x, bb.y, '#ffffff');
      this.dropLoot(e, bb.x, bb.y);
    }
    cx /= n; cy /= n;

    this.pops.push(new ScorePop(cx, cy - 14, String(bonus), n > 1 ? '#ffe14a' : '#ffffff'));
    Sound.play(n > 1 ? 'chain' : 'kill');

    if (n >= 2) {
      for (var m = 0; m < n - 1; m++) {
        var idx = this.pickLetter(popper);
        if (idx < 0) break;
        this.items.push(new Item('letter', cx - 6 + m * 14, cy - 16, { letter: idx }));
      }
    }
  },

  pickLetter: function (p) {
    var missing = [];
    for (var i = 0; i < 6; i++) if (!p.letters[i]) missing.push(i);
    if (!missing.length) return -1;
    return missing[Math.floor(Math.random() * missing.length)];
  },

  dropLoot: function (enemy, x, y) {
    var f = FRUIT_TABLE[Math.min(this.killIndex, FRUIT_TABLE.length - 1)];
    this.killIndex++;
    this.items.push(new Item('fruit', x - 6, y - 6, f, true));
    if (Math.random() < 0.18) {
      var keys = Object.keys(POWER_DEFS);
      var key = keys[Math.floor(Math.random() * keys.length)];
      this.items.push(new Item('power', x - 6, y - 10, {
        power: key, value: POWER_DEFS[key].value
      }, true));
    }
  },

  triggerElement: function (b, popper) {
    var dir = popper ? -popper.facing : (Math.random() < 0.5 ? -1 : 1);
    if (b.content === 'water') {
      this.effects.push(new WaterDrop(b.x - 5, b.y - 5, dir));
      Sound.play('water');
    } else if (b.content === 'fire') {
      for (var i = 0; i < 2; i++) {
        this.effects.push(new FireDrop(b.x - 5 + i * dir * 9, b.y - 5, dir, 4));
      }
      Sound.play('fire');
    } else {
      this.effects.push(new Bolt(b.x - 9, b.y - 4, dir));
      Sound.play('thunder');
      this.shake = 10;
    }
    this.burst(b.x, b.y, b.content === 'water' ? '#5cc8ff'
                       : b.content === 'fire' ? '#ff9040' : '#ffe14a');
  },

  collectItem: function (it, p) {
    it.dead = true;
    if (it.kind === 'letter') {
      var full = p.takeLetter(it.data.letter);
      if (full) {
        Sound.play('extend');
        this.pops.push(new ScorePop(it.x + 6, it.y - 8, 'EXTEND!', '#ffe14a'));
      } else {
        Sound.play('letter');
      }
      return;
    }
    if (it.kind === 'power') {
      this.applyPower(p, it.data.power);
      p.addScore(it.data.value || 100);
      this.pops.push(new ScorePop(it.x + 6, it.y - 8, POWER_DEFS[it.data.power].hint, p.color));
      Sound.play('item');
      return;
    }
    var v = it.data.value || 0;
    p.addScore(v);
    this.pops.push(new ScorePop(it.x + 6, it.y - 8, String(v), '#ffffff'));
    Sound.play('item');
  },

  applyPower: function (p, key) {
    if (key === 'shoes') p.shoes = true;
    else if (key === 'candyY') p.rapid = true;
    else if (key === 'candyB') p.fastBubble = true;
    else if (key === 'candyP') p.longBubble = true;
    else if (key === 'ring') p.ringBonus = 100;
  },

  /* ---------------------------------------------------------------- */
  releaseEnemy: function (b) {
    var e = b.enemy;
    b.enemy = null;
    b.dead = true;
    if (!e || e.dead) return;
    e.bubbled = false;
    e.x = b.x - e.w / 2;
    e.y = b.y - e.h / 2;
    e.vy = 0;
    e.enrage();
    this.burst(b.x, b.y, '#ff6b5e');
    Sound.play('pop');
  },

  freePlayer: function (b) {
    var p = b.player;
    b.player = null;
    b.dead = true;
    if (!p) return;
    p.trapBubble = null;
    p.x = b.x - p.w / 2;
    p.y = b.y - p.h / 2;
    p.vy = 0;
    p.invuln = 60;
    Sound.play('pop');
  },

  killPlayer: function (p) {
    if (!this.playerVulnerable(p)) return;
    p.dying = 60;
    p.vy = -3.2;
    this.shake = 14;
    Sound.play('death');
    this.burst(p.x + p.w / 2, p.y + p.h / 2, p.color);
    if (this.mode === 'versus') p.score = Math.max(0, p.score - 1000);
  },

  finishDeath: function (p) {
    p.clearPowers();
    if (this.mode === 'versus') { p.respawn = 60; return; }
    p.lives--;
    if (p.lives < 0) {
      p.active = false;
      p.alive = false;
      var anyone = false;
      for (var i = 0; i < this.players.length; i++) if (this.players[i].active) anyone = true;
      if (!anyone) this.gameOver();
      return;
    }
    p.respawn = 60;
  },

  respawnPlayer: function (p) {
    var idx = this.players.indexOf(p);
    var sp = this.level.spawn[idx] || this.level.spawn[0];
    p.reset(sp[0] * TILE + 2, sp[1] * TILE - 3);
    p.clearPowers();
  },

  gameOver: function () {
    this.state = 'gameover';
    this.endTimer = 90;
    this.banner = 'GAME OVER';
    Sound.stopMusic();
    Sound.play('gameover');
    this.updateHi();
  },

  endVersus: function () {
    this.state = 'versusover';
    this.endTimer = 90;
    var a = this.players[0], b = this.players[1];
    this.banner = a.score === b.score ? 'DRAW GAME'
                : (a.score > b.score ? a.name + ' WINS!' : b.name + ' WINS!');
    Sound.stopMusic();
    Sound.play('extend');
    this.updateHi();
  },

  updateHi: function () {
    for (var i = 0; i < this.players.length; i++) {
      if (this.players[i].score > this.hiScore) this.hiScore = this.players[i].score;
    }
    this.saveHi();
  },

  vacuumItems: function () {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      var p = this.nearestPlayer(it);
      if (!p) continue;
      it.pickupT = 0;
      var dx = (p.x + p.w / 2) - (it.x + 6);
      var dy = (p.y + p.h / 2) - (it.y + 6);
      var d = Math.hypot(dx, dy) || 1;
      it.floaty = true;
      it.x += dx / d * 3.6;
      it.y += dy / d * 3.6;
      if (d < 9) this.collectItem(it, p);
    }
  },

  burst: function (x, y, color) {
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2;
      this.parts.push(new Particle(
        x, y, Math.cos(a) * 1.8, Math.sin(a) * 1.8 - 0.5, color, 26, 2.6
      ));
    }
  },

  nearestPlayer: function (e) {
    var best = null, bd = 1e9;
    var ex = e.x + (e.w || 10) / 2, ey = e.y + (e.h || 10) / 2;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (!p.active || !p.alive || p.dying > 0 || p.respawn > 0) continue;
      var d = Math.hypot(p.x - ex, p.y - ey);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  },

  /* ================================================================
     DRAWING - everything below is in world units
     ================================================================ */
  draw: function (ctx) {
    ctx.setTransform(View.scale, 0, 0, View.scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.state === 'title') { this.drawTitle(ctx); return; }

    var sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake * 0.35;
      sy = (Math.random() - 0.5) * this.shake * 0.35;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_H, WORLD_W, WORLD_H);
    ctx.clip();
    ctx.translate(sx, HUD_H + sy);

    drawBackdrop(ctx, this.level.theme, this.clock);
    drawBlocks(ctx, this.level);

    var i;
    for (i = 0; i < this.items.length; i++) this.items[i].draw(ctx, this.clock);
    for (i = 0; i < this.effects.length; i++) this.effects[i].draw(ctx);
    for (i = 0; i < this.enemies.length; i++) this.enemies[i].draw(ctx);
    for (i = 0; i < this.rocks.length; i++) this.rocks[i].draw(ctx);
    for (i = 0; i < this.players.length; i++) if (this.players[i].active) this.players[i].draw(ctx);
    for (i = 0; i < this.bubbles.length; i++) this.bubbles[i].draw(ctx, this.clock);
    for (i = 0; i < this.hunters.length; i++) this.hunters[i].draw(ctx);
    for (i = 0; i < this.parts.length; i++) this.parts[i].draw(ctx);
    for (i = 0; i < this.pops.length; i++) this.pops[i].draw(ctx);

    this.drawOverlays(ctx);
    ctx.restore();

    this.drawHud(ctx);

    if (this.paused) {
      ctx.fillStyle = 'rgba(5,6,15,0.78)';
      ctx.fillRect(0, HUD_H, WORLD_W, WORLD_H);
      txtGlow(ctx, 'PAUSED', WORLD_W / 2, HUD_H + 118, 30, '#ffffff', 'center');
      txtGlow(ctx, 'PRESS P TO RESUME', WORLD_W / 2, HUD_H + 146, 11, '#9aa8d0', 'center');
    }
  },

  drawOverlays: function (ctx) {
    var cx = WORLD_W / 2;
    if (this.state === 'ready') {
      txtGlow(ctx, this.banner, cx, 108, 30, '#ffe14a', 'center');
      if (this.bannerSub) txtGlow(ctx, this.bannerSub, cx, 136, 13, '#ffffff', 'center');
    } else if (this.state === 'clear') {
      txtGlow(ctx, this.banner, cx, 118, 28, '#7cffb0', 'center');
    } else if (this.state === 'gameover' || this.state === 'versusover') {
      ctx.fillStyle = 'rgba(5,6,15,0.72)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      var top = this.state === 'gameover' ? '#ff6b6b' : '#ffe14a';
      txtGlow(ctx, this.banner, cx, 92, 32, top, 'center');
      for (var i = 0; i < this.players.length; i++) {
        var p = this.players[i];
        drawCritter(ctx, p.kind, cx - 62, 132 + i * 26, 1, this.clock, { scale: 0.62 });
        txtGlow(ctx, p.name, cx - 40, 124 + i * 26, 13, p.color, 'left');
        txtGlow(ctx, pad(p.score, 6), cx + 76, 124 + i * 26, 15, '#ffffff', 'right');
      }
      if (this.endTimer <= 0 && Math.floor(this.clock / 22) % 2 === 0) {
        txtGlow(ctx, 'PRESS ENTER', cx, 202, 13, '#ffffff', 'center');
      }
    }

    if (this.hurry && this.hurryFlash > 0 && Math.floor(this.hurryFlash / 9) % 2 === 0) {
      txtGlow(ctx, 'HURRY UP!', cx, 70, 30, '#ff5544', 'center');
    }
  },

  /* ---- HUD ---- */
  drawHud: function (ctx) {
    var g = ctx.createLinearGradient(0, 0, 0, HUD_H);
    g.addColorStop(0, '#141830');
    g.addColorStop(1, '#0a0c1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, HUD_H - 1, VIEW_W, 1);

    var p1 = this.players[0];
    var p2 = this.players[1];
    var solo = this.mode === '1p';

    /* player 1 block */
    drawCritter(ctx, p1.kind, 13, 15, 1, this.clock, { scale: 0.38 });
    if (!solo || this.mode !== 'versus') {
      if (this.mode !== 'versus') txt(ctx, 'x' + Math.max(0, p1.lives), 22, 13, 9, p1.color, 'left');
    }
    txt(ctx, pad(p1.score, 6), 40, 9, 13, '#ffffff', 'left');
    this.drawExtend(ctx, p1, 40, 19, false);

    /* centre: round or match clock */
    var mid, midColor;
    if (this.mode === 'versus') {
      var secs = Math.max(0, Math.ceil(this.matchTimer / 60));
      mid = Math.floor(secs / 60) + ':' + pad(secs % 60, 2);
      midColor = secs <= 15 ? '#ff5544' : '#ffd54a';
    } else {
      mid = 'ROUND ' + this.round;
      midColor = this.hurry ? '#ff5544' : '#ffd54a';
    }
    txt(ctx, mid, WORLD_W / 2, 9, 12, midColor, 'center');

    /* round timer bar */
    if (this.mode !== 'versus') {
      var frac = this.hurry ? 0 : Math.max(0, this.roundTimer / ROUND_TIME);
      var bw = 96, bx = WORLD_W / 2 - bw / 2, by = 17;
      roundRect(ctx, bx, by, bw, 3.4, 1.7);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill();
      if (frac > 0) {
        roundRect(ctx, bx, by, bw * frac, 3.4, 1.7);
        ctx.fillStyle = frac < 0.25 ? '#ff5544' : '#5fd0ff';
        ctx.fill();
      } else {
        txt(ctx, 'HURRY!', WORLD_W / 2, 19, 8, '#ff5544', 'center');
      }
    }

    /* player 2 block */
    if (p2) {
      drawCritter(ctx, p2.kind, WORLD_W - 13, 15, -1, this.clock, { scale: 0.38 });
      if (this.mode !== 'versus') {
        txt(ctx, 'x' + Math.max(0, p2.lives), WORLD_W - 22, 13, 9, p2.color, 'right');
      }
      txt(ctx, pad(p2.score, 6), WORLD_W - 40, 9, 13, '#ffffff', 'right');
      this.drawExtend(ctx, p2, WORLD_W - 40, 19, true);
    } else {
      txt(ctx, 'HI ' + pad(this.hiScore, 6), WORLD_W - 12, 9, 11, '#ff8fd0', 'right');
    }
  },

  drawExtend: function (ctx, p, x, y, rightAlign) {
    var pipW = 9, n = 6;
    var startX = rightAlign ? x - n * pipW : x;
    for (var i = 0; i < n; i++) {
      var px = startX + i * pipW;
      var on = p.letters[i];
      roundRect(ctx, px, y - 4, pipW - 1.6, 8, 2);
      ctx.fillStyle = on ? 'rgba(255,225,74,0.92)' : 'rgba(255,255,255,0.09)';
      ctx.fill();
      txt(ctx, EXTEND_LETTERS[i], px + (pipW - 1.6) / 2, y,
          6.5, on ? '#3a2b00' : 'rgba(255,255,255,0.34)', 'center');
    }
  },

  /* ---- title ---- */
  drawTitle: function (ctx) {
    var t = this.clock;
    ctx.save();
    ctx.translate(0, HUD_H);
    drawBackdrop(ctx, 0, t);
    ctx.restore();

    ctx.save();
    ctx.translate(0, HUD_H);
    var cx = WORLD_W / 2;

    txtGlow(ctx, 'BUBBLE', cx, 32 + Math.sin(t * 0.04) * 2.5, 40, '#57e0a5', 'center');
    txtGlow(ctx, 'BOBBLE', cx, 68 + Math.sin(t * 0.04 + 0.7) * 2.5, 40, '#7fa8ff', 'center');
    txt(ctx, 'O N L I N E', cx, 92, 11, '#ff8fd0', 'center');

    drawCritter(ctx, 'cat', cx - 148, 176 + Math.sin(t * 0.06) * 3, 1, t, { scale: 1.5 });
    drawCritter(ctx, 'bunny', cx + 148, 176 + Math.sin(t * 0.06 + 2) * 3, -1, t, { scale: 1.5 });

    for (var m = 0; m < MODES.length; m++) {
      var sel = m === this.menuIndex;
      var y = 122 + m * 27;
      var w = sel ? 176 : 160;
      roundRect(ctx, cx - w / 2, y - 11, w, 22, 11);
      ctx.fillStyle = sel ? 'rgba(255,225,74,0.16)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = sel ? '#ffe14a' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = sel ? 1.6 : 1;
      ctx.stroke();
      txt(ctx, MODES[m].label, cx, y, sel ? 15 : 13,
          sel ? '#ffe14a' : 'rgba(255,255,255,0.55)', 'center');
    }

    txt(ctx, MODES[this.menuIndex].blurb, cx, 209, 10, '#9aa8d0', 'center');
    txt(ctx, 'HIGH SCORE  ' + pad(this.hiScore, 6), cx, 228, 12, '#ffffff', 'center');
    if (Math.floor(t / 26) % 2 === 0) {
      txt(ctx, 'PRESS ENTER TO START', cx, 246, 12, '#ffe14a', 'center');
    }
    ctx.restore();

    /* slim top bar so the title screen matches the in-game frame */
    var g = ctx.createLinearGradient(0, 0, 0, HUD_H);
    g.addColorStop(0, '#141830');
    g.addColorStop(1, '#0a0c1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    txt(ctx, 'P1  ARROWS + SPACE', 12, HUD_H / 2, 10, '#57e0a5', 'left');
    txt(ctx, 'P2  A D W S', WORLD_W - 12, HUD_H / 2, 10, '#7fa8ff', 'right');
  }
};

function notDead(o) { return !o.dead; }

function pad(n, len) {
  var s = String(Math.max(0, Math.floor(n)));
  while (s.length < len) s = '0' + s;
  return s;
}

var EMPTY_INPUT = {
  left: false, right: false, jump: false, fire: false,
  jumpPressed: false, firePressed: false
};
