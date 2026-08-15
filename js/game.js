/* ------------------------------------------------------------------
   game.js - modes, rounds, rules, scoring, HUD and screens
   ------------------------------------------------------------------ */

var MODES = [
  { id: '1p', label: '1 PLAYER', blurb: 'BUB ALONE AGAINST THE CAVE' },
  { id: 'coop', label: '2 PLAYER TEAM', blurb: 'BUB AND BOB CLEAR ROUNDS TOGETHER' },
  { id: 'versus', label: '2 PLAYER VERSUS', blurb: 'BUBBLE YOUR RIVAL - TOP SCORE WINS' }
];

var ROUND_TIME = 2400;       // 40s before HURRY UP!
var SKEL_DELAY = 600;        // 10s after HURRY UP! before the hunter arrives
var VERSUS_TIME = 120 * 60;  // 2 minute match

var Game = {
  state: 'title',
  menuIndex: 0,
  mode: '1p',
  round: 1,
  paused: false,
  hiScore: 30000,
  titleT: 0,
  titleBubbles: [],

  level: null,
  players: [],
  bubbles: [],
  enemies: [],
  rocks: [],
  items: [],
  effects: [],
  parts: [],
  pops: [],
  skels: [],

  roundTimer: ROUND_TIME,
  hurry: false,
  hurryFlash: 0,
  skelTimer: 0,
  killIndex: 0,
  specialTimer: 540,
  clearTimer: 0,
  readyTimer: 0,
  matchTimer: 0,
  versusSpawnTimer: 0,
  banner: '',
  bannerSub: '',
  endTimer: 0,

  /* ---------------------------------------------------------------- */
  init: function () {
    try {
      var hs = localStorage.getItem('bubblebobble.hiscore');
      if (hs) this.hiScore = Math.max(this.hiScore, parseInt(hs, 10) || 0);
    } catch (e) { /* storage may be unavailable */ }
    for (var i = 0; i < 14; i++) {
      this.titleBubbles.push({
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
        r: 4 + Math.random() * 6,
        s: 0.2 + Math.random() * 0.5,
        w: Math.random() * 6
      });
    }
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
      spawn: def.spawn
    };

    this.bubbles = [];
    this.enemies = [];
    this.rocks = [];
    this.items = [];
    this.effects = [];
    this.parts = [];
    this.pops = [];
    this.skels = [];
    this.killIndex = 0;
    this.hurry = false;
    this.hurryFlash = 0;
    this.skelTimer = 0;
    this.clearTimer = 0;
    this.specialTimer = 420;
    this.roundTimer = Math.max(1200, ROUND_TIME - this.difficulty * 300);

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
      /* each loop through the 12 rounds adds an extra angry-fast walker */
      for (var k = 0; k < d && k < 4; k++) {
        this.enemies.push(new Enemy('zen', 3 + k * 4, 1, d));
      }
    }

    for (var p = 0; p < this.players.length; p++) {
      var pl = this.players[p];
      var sp = this.level.spawn[p] || this.level.spawn[0];
      pl.reset(sp[0] * TILE + 2, sp[1] * TILE + 2);
      pl.clearPowers();
      if (this.mode === 'versus') { pl.lives = 0; }
    }

    this.state = 'ready';
    this.readyTimer = 100;
    this.banner = this.mode === 'versus' ? 'VERSUS' : 'ROUND ' + pad(this.round, 2);
    this.bannerSub = this.mode === 'versus' ? 'BUBBLE YOUR RIVAL' : 'READY';
  },

  /* ---------------------------------------------------------------- */
  update: function (inputs, ui) {
    this.titleT++;

    if (this.state === 'title') {
      this.updateTitle(ui);
      return;
    }

    if (ui.pausePressed && (this.state === 'play' || this.state === 'ready')) {
      this.paused = !this.paused;
      Sound.play('select');
    }
    if (ui.escapePressed) {
      this.toTitle();
      return;
    }
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
      if (--this.clearTimer <= 0) {
        this.round++;
        this.loadRound();
      }
      return;
    }

    if (this.state === 'gameover' || this.state === 'versusover') {
      this.updateWorld(inputs, true);
      if (this.endTimer > 0) this.endTimer--;
      if (this.endTimer <= 0 && ui.confirmPressed) this.toTitle();
      return;
    }
  },

  toTitle: function () {
    this.state = 'title';
    this.paused = false;
    Sound.stopMusic();
    Sound.play('select');
  },

  updateTitle: function (ui) {
    for (var i = 0; i < this.titleBubbles.length; i++) {
      var b = this.titleBubbles[i];
      b.y -= b.s;
      b.w += 0.05;
      b.x += Math.sin(b.w) * 0.4;
      if (b.y < -10) { b.y = WORLD_H + 10; b.x = Math.random() * WORLD_W; }
    }
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
      for (i = 0; i < this.skels.length; i++) this.skels[i].update(this);
    }

    for (i = 0; i < this.bubbles.length; i++) this.bubbles[i].update(this);
    for (i = 0; i < this.items.length; i++) this.items[i].update(this);
    /* snapshot: fire drops seed new drops, which start next frame */
    var nEffects = this.effects.length;
    for (i = 0; i < nEffects; i++) this.effects[i].update(this);
    for (i = 0; i < this.parts.length; i++) this.parts[i].update();
    for (i = 0; i < this.pops.length; i++) this.pops[i].update();

    this.separateBubbles();

    if (!frozen) {
      this.collide();
      this.timers();
    }

    /* level-clear vacuum: leftover goodies fly into the players */
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
    /* element bubbles drift in from the sides now and then */
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
        this.hurryFlash = 180;
        this.skelTimer = SKEL_DELAY;
        Sound.play('hurry');
        for (var i = 0; i < this.enemies.length; i++) this.enemies[i].enrage();
      }
    } else {
      if (this.hurryFlash > 0) this.hurryFlash--;
      if (--this.skelTimer <= 0) {
        this.skelTimer = 900;
        if (this.skels.length < 2) {
          this.skels.push(new Skel(this.skels.length === 0 ? 16 : WORLD_W - 32, 24));
          Sound.play('death');
        }
      }
    }

    if (this.state === 'play' && this.enemies.length === 0) {
      this.state = 'clear';
      this.clearTimer = 170;
      this.banner = 'ROUND CLEAR';
      this.bannerSub = '';
      Sound.play('clear');
      this.skels = [];
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

    /* --- players vs bubbles --- */
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

        /* land on top of a plain bubble and ride it */
        if (!b.trapped && !b.content && p.vy >= 0 && horizontally &&
            pb - p.vy <= top + 4 && pb >= top && pb <= top + 9) {
          p.y = top - p.h;
          p.vy = 0;
          p.onGround = true;
          b.y += 0.15;      /* your weight slows the bubble, but it still lifts you */
          continue;
        }

        if (rectsOverlap(p, bubbleBox(b))) this.popBubble(b, p);
      }
    }

    /* --- monsters can bump a bubble a player is trapped in? no; but
           monsters do hurt players --- */
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (!this.playerVulnerable(p)) continue;
      for (j = 0; j < this.enemies.length; j++) {
        e = this.enemies[j];
        if (e.bubbled || e.dead) continue;
        if (rectsOverlap(p, e)) { this.killPlayer(p); break; }
      }
    }

    /* --- rocks --- */
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
    for (i = 0; i < this.skels.length; i++) {
      var s = this.skels[i];
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
          this.items.push(new Item('gem', e.x + 1, e.y + 2, gem));
          Sound.play('kill');
        }
      }
    }

    /* --- picking things up --- */
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.dead) continue;
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
      p.x + p.w / 2 + dir * 11,
      p.y + 5,
      dir, p,
      { speed: p.fastBubble ? 4.4 : 3.2, range: p.longBubble ? 42 : 26 }
    );
    this.bubbles.push(b);

    /* a shot can also catch the other dragon - they float free after a while */
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
    var b = new Bubble(fromLeft ? TILE * 1.5 : WORLD_W - TILE * 1.5, WORLD_H - TILE * 2,
                       fromLeft ? 1 : -1, null, {});
    b.phase = 'float';
    b.vx = 0;
    b.content = kind;
    b.canTrap = false;
    b.life = 600;
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
        this.pops.push(new ScorePop(b.x, b.y - 8, '2000', popper.color));
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

    if (b.content) {
      b.dead = true;
      this.triggerElement(b, popper);
      return;
    }

    b.dead = true;
    popper.addScore(10);
    this.burst(b.x, b.y, '#cfe8ff');
    Sound.play('pop');
  },

  /* Popping several trapped monsters together is the heart of the scoring:
     1000, 2000, 4000, 8000 ... = 1000 * 2^(n-1) */
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
        if (Math.hypot(o.x - b.x, o.y - b.y) <= b.r + o.r + 6) queue.push(o);
      }
    }

    var n = cluster.length;
    var bonus = 1000 * Math.pow(2, n - 1);
    popper.addScore(bonus);

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

    this.pops.push(new ScorePop(cx, cy - 10, String(bonus), n > 1 ? '#ffe14a' : '#ffffff'));
    Sound.play(n > 1 ? 'chain' : 'kill');

    /* multi-pops are what shake EXTEND letters loose */
    if (n >= 2) {
      for (var m = 0; m < n - 1; m++) {
        var idx = this.pickLetter(popper);
        if (idx < 0) break;
        this.items.push(new Item('letter', cx - 5 + m * 12, cy - 12, { letter: idx }));
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
    this.items.push(new Item('fruit', x - 5, y - 5, f));
    if (Math.random() < 0.16) {
      var keys = Object.keys(POWER_DEFS);
      var key = keys[Math.floor(Math.random() * keys.length)];
      this.items.push(new Item('power', x - 5 + 12, y - 8, {
        power: key, value: POWER_DEFS[key].value
      }));
    }
  },

  triggerElement: function (b, popper) {
    /* the element always shoots AWAY from the way the popper is facing */
    var dir = popper ? -popper.facing : (Math.random() < 0.5 ? -1 : 1);
    if (b.content === 'water') {
      this.effects.push(new WaterDrop(b.x - 4, b.y - 4, dir));
      Sound.play('water');
    } else if (b.content === 'fire') {
      for (var i = 0; i < 2; i++) {
        this.effects.push(new FireDrop(b.x - 4 + i * dir * 8, b.y - 4, dir, 4));
      }
      Sound.play('fire');
    } else {
      this.effects.push(new Bolt(b.x - 8, b.y - 3, dir));
      Sound.play('thunder');
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
        this.pops.push(new ScorePop(it.x + 5, it.y - 6, 'EXTEND', '#ffe14a'));
      } else {
        Sound.play('letter');
      }
      return;
    }
    if (it.kind === 'power') {
      this.applyPower(p, it.data.power);
      p.addScore(it.data.value || 100);
      this.pops.push(new ScorePop(it.x + 5, it.y - 6, String(it.data.value || 100), p.color));
      Sound.play('item');
      return;
    }
    var v = it.data.value || 0;
    p.addScore(v);
    this.pops.push(new ScorePop(it.x + 5, it.y - 6, String(v), '#ffffff'));
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
    this.burst(b.x, b.y, '#ff6060');
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
    p.vy = -3;
    Sound.play('death');
    this.burst(p.x + p.w / 2, p.y + p.h / 2, p.color);
    if (this.mode === 'versus') p.score = Math.max(0, p.score - 1000);
  },

  finishDeath: function (p) {
    p.clearPowers();
    if (this.mode === 'versus') {
      p.respawn = 60;
      return;
    }
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
    p.reset(sp[0] * TILE + 2, sp[1] * TILE + 2);
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
                : (a.score > b.score ? 'BUB WINS!' : 'BOB WINS!');
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
      var dx = (p.x + p.w / 2) - (it.x + 5);
      var dy = (p.y + p.h / 2) - (it.y + 5);
      var d = Math.hypot(dx, dy) || 1;
      it.floaty = true;
      it.x += dx / d * 3.2;
      it.y += dy / d * 3.2;
      if (d < 8) this.collectItem(it, p);
    }
  },

  burst: function (x, y, color) {
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      this.parts.push(new Particle(
        x, y, Math.cos(a) * 1.6, Math.sin(a) * 1.6 - 0.5, color, 22, 2
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
     DRAWING
     ================================================================ */
  draw: function (ctx) {
    ctx.imageSmoothingEnabled = false;
    if (this.state === 'title') { this.drawTitle(ctx); return; }

    var theme = THEMES[this.level.theme];
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, HUD_H, WORLD_W, WORLD_H);

    ctx.save();
    ctx.translate(0, HUD_H);
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();

    this.drawTiles(ctx);

    var i;
    for (i = 0; i < this.items.length; i++) this.items[i].draw(ctx);
    for (i = 0; i < this.effects.length; i++) this.effects[i].draw(ctx);
    for (i = 0; i < this.enemies.length; i++) this.enemies[i].draw(ctx);
    for (i = 0; i < this.rocks.length; i++) this.rocks[i].draw(ctx);
    for (i = 0; i < this.bubbles.length; i++) this.bubbles[i].draw(ctx);
    for (i = 0; i < this.players.length; i++) if (this.players[i].active) this.players[i].draw(ctx);
    for (i = 0; i < this.skels.length; i++) this.skels[i].draw(ctx);
    for (i = 0; i < this.parts.length; i++) this.parts[i].draw(ctx);
    for (i = 0; i < this.pops.length; i++) this.pops[i].draw(ctx);

    this.drawOverlays(ctx);
    ctx.restore();

    this.drawHud(ctx);

    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, HUD_H, WORLD_W, WORLD_H);
      drawTextCenteredShadow(ctx, 'PAUSED', WORLD_W / 2, HUD_H + 100, 2, '#ffffff');
      drawTextCenteredShadow(ctx, 'PRESS P TO RESUME', WORLD_W / 2, HUD_H + 120, 1, '#9aa0c0');
    }
  },

  drawTiles: function (ctx) {
    var img = TILE_CACHE[this.level.theme];
    for (var r = 0; r < ROWS; r++) {
      var row = this.level.tiles[r];
      for (var c = 0; c < COLS; c++) {
        var t = row[c];
        if (t === 'X' || t === '#') ctx.drawImage(img, c * TILE, r * TILE);
      }
    }
  },

  drawOverlays: function (ctx) {
    if (this.state === 'ready') {
      drawTextCenteredShadow(ctx, this.banner, WORLD_W / 2, 88, 2, '#ffe14a');
      if (this.bannerSub) {
        drawTextCenteredShadow(ctx, this.bannerSub, WORLD_W / 2, 112, 1, '#ffffff');
      }
    } else if (this.state === 'clear') {
      drawTextCenteredShadow(ctx, this.banner, WORLD_W / 2, 96, 2, '#7cff9c');
    } else if (this.state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      drawTextCenteredShadow(ctx, 'GAME OVER', WORLD_W / 2, 80, 2, '#ff5a5a');
      for (var i = 0; i < this.players.length; i++) {
        var p = this.players[i];
        drawTextCenteredShadow(ctx, p.name + '  ' + pad(p.score, 6),
          WORLD_W / 2, 108 + i * 14, 1, p.color);
      }
      if (this.endTimer <= 0 && Math.floor(this.titleT / 20) % 2 === 0) {
        drawTextCenteredShadow(ctx, 'PRESS ENTER', WORLD_W / 2, 150, 1, '#ffffff');
      }
    } else if (this.state === 'versusover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      drawTextCenteredShadow(ctx, this.banner, WORLD_W / 2, 78, 2, '#ffe14a');
      for (var j = 0; j < this.players.length; j++) {
        var q = this.players[j];
        drawTextCenteredShadow(ctx, q.name + '  ' + pad(q.score, 6),
          WORLD_W / 2, 108 + j * 14, 1, q.color);
      }
      if (this.endTimer <= 0 && Math.floor(this.titleT / 20) % 2 === 0) {
        drawTextCenteredShadow(ctx, 'PRESS ENTER', WORLD_W / 2, 150, 1, '#ffffff');
      }
    }

    if (this.hurry && this.hurryFlash > 0 && Math.floor(this.hurryFlash / 8) % 2 === 0) {
      drawTextCenteredShadow(ctx, 'HURRY UP!', WORLD_W / 2, 60, 2, '#ff4040');
    }
  },

  drawHud: function (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, VIEW_W, HUD_H);

    var p1 = this.players[0];
    var p2 = this.players[1];

    drawText(ctx, '1UP', 4, 2, 1, '#4cf05c');
    drawText(ctx, pad(p1.score, 6), 4, 9, 1, '#ffffff');

    drawTextCentered(ctx, 'HIGH SCORE', WORLD_W / 2, 2, 1, '#ff6ec7');
    drawTextCentered(ctx, pad(this.hiScore, 6), WORLD_W / 2, 9, 1, '#ffffff');

    if (p2) {
      var w2 = textWidth('2UP', 1);
      drawText(ctx, '2UP', WORLD_W - 4 - w2, 2, 1, '#5c9cff');
      drawText(ctx, pad(p2.score, 6), WORLD_W - 4 - textWidth('000000', 1), 9, 1, '#ffffff');
    }

    /* bottom HUD row: lives, EXTEND progress, round / match clock */
    var y3 = 18;
    if (this.mode === 'versus') {
      drawText(ctx, 'BUB', 4, y3, 1, '#4cf05c');
    } else {
      drawText(ctx, 'BUB X' + Math.max(0, p1.lives), 4, y3, 1, '#4cf05c');
    }
    this.drawExtend(ctx, p1, 36, y3);

    var mid;
    if (this.mode === 'versus') {
      var secs = Math.max(0, Math.ceil(this.matchTimer / 60));
      mid = 'TIME ' + pad(secs, 3);
    } else {
      mid = 'ROUND ' + pad(this.round, 2);
    }
    drawTextCentered(ctx, mid, WORLD_W / 2, y3, 1, this.hurry ? '#ff5a5a' : '#ffd54a');

    if (p2) {
      var lv = this.mode === 'versus' ? 'BOB' : 'BOB X' + Math.max(0, p2.lives);
      drawText(ctx, lv, WORLD_W - 4 - textWidth(lv, 1), y3, 1, '#5c9cff');
      this.drawExtend(ctx, p2, WORLD_W - 8 - textWidth(lv, 1) - 24, y3);
    }

    /* thin timer bar under the HUD */
    if (this.mode !== 'versus' && this.state !== 'title') {
      var frac = this.hurry ? 0 : Math.max(0, this.roundTimer / ROUND_TIME);
      ctx.fillStyle = '#20203a';
      ctx.fillRect(0, HUD_H - 2, WORLD_W, 2);
      ctx.fillStyle = frac < 0.25 ? '#ff5a5a' : '#4cc0ff';
      ctx.fillRect(0, HUD_H - 2, Math.round(WORLD_W * frac), 2);
    }
  },

  drawExtend: function (ctx, p, x, y) {
    for (var i = 0; i < 6; i++) {
      drawText(ctx, EXTEND_LETTERS[i], x + i * CHAR_W, y, 1,
        p.letters[i] ? '#ffe14a' : '#3a3a58');
    }
  },

  drawTitle: function (ctx) {
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    /* drifting bubbles behind the logo */
    for (var i = 0; i < this.titleBubbles.length; i++) {
      var b = this.titleBubbles[i];
      ctx.strokeStyle = 'rgba(150,200,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,180,255,0.10)';
      ctx.fill();
    }

    var t = this.titleT;
    drawTextCenteredShadow(ctx, 'BUBBLE', WORLD_W / 2, 30 + Math.sin(t * 0.05) * 2, 4, '#4cf05c');
    drawTextCenteredShadow(ctx, 'BOBBLE', WORLD_W / 2, 58 + Math.sin(t * 0.05 + 1) * 2, 4, '#5c9cff');
    drawTextCentered(ctx, 'ONLINE', WORLD_W / 2, 84, 1, '#ff6ec7');

    drawSprite(ctx, SPR.bub, 60, 92 + Math.sin(t * 0.08) * 3, false);
    drawSprite(ctx, SPR.bob, WORLD_W - 76, 92 + Math.sin(t * 0.08 + 2) * 3, true);

    for (var m = 0; m < MODES.length; m++) {
      var sel = m === this.menuIndex;
      var y = 122 + m * 16;
      if (sel) {
        ctx.fillStyle = 'rgba(255,225,74,0.14)';
        ctx.fillRect(50, y - 4, WORLD_W - 100, 13);
        drawTextCentered(ctx, MODES[m].label, WORLD_W / 2, y, 1, '#ffe14a');
        if (Math.floor(t / 15) % 2 === 0) {
          drawText(ctx, '*', 54, y, 1, '#ffe14a');
          drawText(ctx, '*', WORLD_W - 58, y, 1, '#ffe14a');
        }
      } else {
        drawTextCentered(ctx, MODES[m].label, WORLD_W / 2, y, 1, '#8890b8');
      }
    }

    drawTextCentered(ctx, MODES[this.menuIndex].blurb, WORLD_W / 2, 178, 1, '#6a72a0');
    drawTextCentered(ctx, 'UP DOWN TO CHOOSE - ENTER TO START', WORLD_W / 2, 196, 1, '#8890b8');
    drawTextCentered(ctx, 'HIGH SCORE ' + pad(this.hiScore, 6), WORLD_W / 2, 212, 1, '#ffffff');
    drawTextCentered(ctx, 'P1 ARROWS SPACE   P2 A D W S', WORLD_W / 2, 228, 1, '#4a5078');
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
