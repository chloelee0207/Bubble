/* Regression suite for Bubble Bobble Online.
 *
 *   npx http-server . -p 8123 -c-1 &
 *   node tests/regression.js
 *
 * Drives the real game in headless Chromium and asserts the rules and the
 * physics invariants. Exits non-zero on any failure.
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8123/index.html');
  await page.waitForTimeout(400);
  let fails = 0;
  const check = (name, ok, detail) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  };

  // ---- 1. containment fuzz: nobody may leave the arena, in any mode/round ----
  const fuzz = await page.evaluate(() => {
    const bad = [];
    let seed = 987654321;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let round = 1; round <= 13; round++) {
      const mode = round % 3 === 0 ? 'versus' : (round % 2 ? '1p' : 'coop');
      Game.startGame(mode); Game.round = round; Game.loadRound(); Game.state = 'play';
      for (let f = 0; f < 1400; f++) {
        const mk = () => ({
          left: Math.random() < 0.5, right: Math.random() < 0.5,
          jump: Math.random() < 0.5, fire: Math.random() < 0.5,
          jumpPressed: Math.random() < 0.12, firePressed: Math.random() < 0.15
        });
        Game.update([mk(), mk()], {});
        for (const p of Game.players) {
          if (!p.active || p.dying > 0 || p.respawn > 0 || p.trapBubble) continue;
          if (p.x < -0.5 || p.x + p.w > WORLD_W + 0.5)
            bad.push(`r${round} ${mode} f${f} x=${p.x.toFixed(1)} OUT SIDEWAYS`);
          if (p.y + p.h <= 0 && p.onGround)
            bad.push(`r${round} ${mode} f${f} y=${p.y.toFixed(1)} PARKED ABOVE ARENA`);
          if (bad.length > 4) return bad;
        }
      }
    }
    return bad;
  });
  check('containment fuzz (13 rounds x 1400 frames, all modes)', fuzz.length === 0, fuzz.slice(0, 4));

  // ---- 2. a bubble can never lift a rider out of view ----
  const ride = await page.evaluate(() => {
    const res = [];
    for (const round of [4, 6, 9, 11, 1]) {          // pit levels + one solid-roof level
      Game.startGame('1p'); Game.round = round; Game.loadRound(); Game.state = 'play';
      Game.enemies = [new Enemy('bat', 12, 8, 0)]; Game.enemies[0].update = function () {};
      Game.bubbles = [];
      const p = Game.players[0];
      const gapCol = Game.level.tiles[0].indexOf('.');   // a roof gap if the level has one
      const col = gapCol >= 0 ? gapCol + 0.7 : 11;
      const b = new Bubble(col * 16, 200, 1, null, {});
      b.phase = 'float'; b.vx = 0; b.age = 100;
      Game.bubbles.push(b);
      p.x = b.x - p.w / 2; p.y = b.y - b.r - p.h; p.vy = 1;
      let minY = p.y, minTop = b.y - b.r;
      for (let f = 0; f < 700; f++) {
        b.x = col * 16; b.vx = 0; b.life = 999;
        p.invuln = 9e9;
        if (p.onGround) p.x = b.x - p.w / 2;
        Game.update([EMPTY_INPUT, EMPTY_INPUT], {});
        minY = Math.min(minY, p.y); minTop = Math.min(minTop, b.y - b.r);
      }
      res.push({ round, bubbleTop: Math.round(minTop), riderMinY: Math.round(minY),
                 visible: minY >= 0 });
    }
    return res;
  });
  check('bubble rider always stays on screen', ride.every(r => r.visible), ride);

  // ---- 3. the screen wrap must still work ----
  const wrap = await page.evaluate(() => {
    Game.startGame('1p'); Game.round = 4; Game.loadRound(); Game.state = 'play';
    Game.enemies = [new Enemy('bat', 12, 8, 0)]; Game.enemies[0].update = function () {};
    const p = Game.players[0];
    p.x = 4.5 * 16; p.y = 13 * 16; p.vy = 0;          // over the left-hand floor pit
    let maxY = p.y, wrapped = false;
    for (let f = 0; f < 200; f++) {
      p.invuln = 9e9;
      Game.update([EMPTY_INPUT, EMPTY_INPUT], {});
      maxY = Math.max(maxY, p.y);
      if (maxY > 200 && p.y < 60) wrapped = true;
    }
    return { wrapped, finalY: Math.round(p.y) };
  });
  check('fall through the floor, re-enter at the top', wrap.wrapped, wrap);

  // ---- 4. every rung still reachable by a plain jump ----
  const ladder = await page.evaluate(() => {
    const out = [];
    for (let round = 1; round <= 12; round++) {
      Game.startGame('1p'); Game.round = round; Game.loadRound(); Game.state = 'play';
      Game.enemies = [new Enemy('bat', 12, 8, 0)]; Game.enemies[0].update = function () {};
      Game.bubbles = [];
      const p = Game.players[0]; p.invuln = 9e9;
      const T = Game.level.tiles;
      const rows = []; T.forEach((r, i) => { if (i > 0 && i < 15 && r.indexOf('#') >= 0) rows.push(i); });
      let cur = 15, allOk = true;
      for (let k = rows.length - 1; k >= 0; k--) {
        const up = rows[k];
        let col = -1;
        for (let c = 1; c < 23; c++) {
          if (T[up][c] !== '#') continue;
          if (T[up - 1][c] !== '.' || T[up - 2][c] !== '.') continue;
          if (T[cur][c] === '.' || T[cur - 1][c] !== '.') continue;
          let clear = true;
          for (let rr = up + 1; rr < cur; rr++) if (T[rr][c] !== '.') clear = false;
          if (clear) { col = c; break; }
        }
        if (col < 0) { allOk = false; break; }
        p.x = col * 16 + 1; p.y = cur * 16 - p.h;
        p.vx = 0; p.vy = 0; p.onGround = true; p.coyote = 7; p.jumpBuffer = 0;
        let landed = null;
        for (let f = 0; f < 90; f++) {
          p.invuln = 9e9;
          Game.update([{ left: 0, right: 0, jump: 1, fire: 0, jumpPressed: f === 0, firePressed: 0 }, EMPTY_INPUT], {});
          if (f > 6 && p.onGround) { landed = Math.round((p.y + p.h) / 16); break; }
        }
        if (landed !== up) { allOk = false; break; }
        cur = up;
      }
      out.push({ round, ok: allOk });
    }
    return out;
  });
  check('all 12 rounds climbable rung by rung', ladder.every(r => r.ok), ladder.filter(r => !r.ok));

  // ---- 5. core mechanics ----
  const mech = await page.evaluate(() => {
    const r = {};
    // chain of 4 -> 8000 + 3 EXTEND letters
    Game.startGame('1p'); Game.state = 'play';
    let p = Game.players[0]; p.score = 0;
    Game.enemies = []; Game.bubbles = []; Game.items = [];
    for (let i = 0; i < 4; i++) {
      const e = new Enemy('chick', 5 + i, 8, 0);
      Game.enemies.push(e); e.bubbled = true;
      const b = new Bubble(0, 0, 1, p, {}); b.trap(e);
      b.x = 110 + i * 16; b.y = 110;
      Game.bubbles.push(b);
    }
    Game.popBubble(Game.bubbles[0], p);
    r.chain4 = { score: p.score, fruit: Game.items.filter(i => i.kind === 'fruit').length,
                 letters: Game.items.filter(i => i.kind === 'letter').length };

    // fruit stays visible after a burst instead of vanishing into the player
    Game.startGame('1p'); Game.round = 1; Game.loadRound(); Game.state = 'play';
    p = Game.players[0];
    Game.bubbles = []; Game.items = [];
    Game.enemies = [new Enemy('chick', 6, 13, 0), new Enemy('chick', 16, 13, 0)];
    const e0 = Game.enemies[0]; e0.bubbled = true;
    const bb = new Bubble(e0.x + 6, e0.y + 7, 1, p, {}); bb.trap(e0);
    Game.bubbles.push(bb);
    p.x = bb.x - p.w / 2; p.y = bb.y - p.h / 2; p.invuln = 0;
    Game.popBubble(bb, p);
    let visible = 0;
    for (let f = 0; f < 40; f++) { Game.update([EMPTY_INPUT, EMPTY_INPUT], {}); if (Game.items.some(i => i.kind === 'fruit')) visible++; }
    r.fruitVisibleFrames = visible;

    // EXTEND -> extra life
    Game.startGame('1p'); p = Game.players[0];
    const lives0 = p.lives;
    let done = false; for (let i = 0; i < 6; i++) done = p.takeLetter(i);
    r.extend = { gained: p.lives - lives0, completed: done };

    // trapped monster escapes angry
    Game.startGame('1p'); Game.state = 'play'; p = Game.players[0];
    Game.enemies = []; Game.bubbles = [];
    const e1 = new Enemy('chick', 8, 8, 0); Game.enemies.push(e1); e1.bubbled = true;
    const b1 = new Bubble(e1.x + 6, e1.y + 7, 1, p, {}); b1.trap(e1);
    Game.bubbles.push(b1);
    for (let f = 0; f < 420; f++) Game.update([EMPTY_INPUT, EMPTY_INPUT], {});
    r.escape = { angry: e1.angry, freed: !e1.bubbled, alive: !e1.dead };

    // riding an empty bubble carries you upward
    Game.startGame('1p'); Game.state = 'play'; p = Game.players[0];
    Game.enemies = [new Enemy('bat', 12, 8, 0)]; Game.enemies[0].update = function () {};
    Game.bubbles = [];
    p.x = 150; p.y = 120; p.vy = 1; p.invuln = 9e9;
    const rb = new Bubble(157, 155, 1, null, {}); rb.phase = 'float'; rb.vx = 0; rb.age = 100;
    Game.bubbles.push(rb);
    const y0 = p.y;
    for (let f = 0; f < 90; f++) { p.invuln = 9e9; Game.update([EMPTY_INPUT, EMPTY_INPUT], {}); }
    r.bubbleRide = { rose: p.y < y0 - 5, y0, y: Math.round(p.y) };
    return r;
  });
  check('chain of 4 = 8000 pts, 4 fruit, 3 EXTEND letters',
        mech.chain4.score === 8000 && mech.chain4.fruit === 4 && mech.chain4.letters === 3, mech.chain4);
  check('fruit visible after a burst', mech.fruitVisibleFrames >= 30, mech.fruitVisibleFrames);
  check('EXTEND grants a life', mech.extend.gained === 1 && mech.extend.completed, mech.extend);
  check('trapped monster escapes angry', mech.escape.angry && mech.escape.freed && mech.escape.alive, mech.escape);
  check('bubble riding still lifts you', mech.bubbleRide.rose, mech.bubbleRide);

  // ---- 7. nothing may end up wedged in geometry or outside the arena ----
  const out = await page.evaluate(() => {
    let seed = 20260923;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    // does a box overlap any SOLID ('X') tile?
    const inSolid = (e) => {
      const c0 = Math.floor(e.x / TILE), c1 = Math.floor((e.x + e.w - 1) / TILE);
      const r0 = Math.floor(e.y / TILE), r1 = Math.floor((e.y + e.h - 1) / TILE);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          if (isSolid(Game.level, c, r)) return true;
      return false;
    };

    window.__nextId = 0;
    const report = { embedded: [], outside: [], roundStalled: [], enemyLost: [] };
    const stuckCount = new Map();

    for (let round = 1; round <= 13; round++) {
      const mode = round % 3 === 0 ? 'versus' : (round % 2 ? '1p' : 'coop');
      Game.startGame(mode); Game.round = round; Game.loadRound(); Game.state = 'play';
      stuckCount.clear();

      for (let f = 0; f < 2000; f++) {
        const mk = () => ({
          left: Math.random() < 0.5, right: Math.random() < 0.5,
          jump: Math.random() < 0.5, fire: Math.random() < 0.5,
          jumpPressed: Math.random() < 0.12, firePressed: Math.random() < 0.18
        });
        Game.update([mk(), mk()], {});
        if (Game.state !== 'play') continue;

        const actors = [];
        for (const p of Game.players)
          if (p.active && p.alive && p.dying === 0 && p.respawn === 0 && !p.trapBubble)
            actors.push({ o: p, tag: 'player' + p.index });
        for (const e of Game.enemies) {
          if (e.bubbled || e.dead) continue;
          if (e.__id === undefined) e.__id = ++window.__nextId;
          actors.push({ o: e, tag: 'enemy:' + e.kind + '#' + e.__id });
        }

        for (const { o, tag } of actors) {
          // outside the arena at all?
          const parkedAbove = o.y + o.h <= 0 && o.onGround;   // the wrap frame itself is legal
          if (o.x < -0.5 || o.x + o.w > WORLD_W + 0.5 || parkedAbove || o.y > WORLD_H + 40) {
            if (report.outside.length < 5)
              report.outside.push(`r${round} ${mode} f${f} ${tag} x=${o.x.toFixed(1)} y=${o.y.toFixed(1)}`);
          }
          // embedded inside a solid block for a sustained stretch?
          const key = round + tag;
          if (inSolid(o)) {
            const n = (stuckCount.get(key) || 0) + 1;
            stuckCount.set(key, n);
            if (n === 45 && report.embedded.length < 5) {
              const cc = Math.floor(o.x / TILE), rr0 = Math.floor(o.y / TILE);
              const nb = [];
              for (let rr = Math.max(0, rr0 - 1); rr <= Math.min(ROWS - 1, rr0 + 2); rr++)
                nb.push(`r${rr}:"${Game.level.tiles[rr].slice(Math.max(0, cc - 1), cc + 3)}"`);
              report.embedded.push(`loop-r${round} ACTUAL-round=${Game.round} state=${Game.state} ${mode} f${f} ${tag}`
                + ` x=${o.x.toFixed(1)} y=${o.y.toFixed(1)} w=${o.w} h=${o.h}`
                + ` vy=${o.vy === undefined ? '-' : o.vy.toFixed(2)} ground=${o.onGround ? 1 : 0}`
                + ` | ${nb.join(' ')}`);
            }
          } else stuckCount.set(key, 0);
        }
      }
      // in a normal round, monsters must still exist or the round must have advanced
      if (mode !== 'versus' && Game.state === 'play' && Game.enemies.length === 0)
        report.roundStalled.push(`r${round}: no monsters left but round did not clear`);
    }
    return report;
  });
  check('nothing embedded in solid geometry', out.embedded.length === 0, out.embedded);
  check('nothing escapes the arena', out.outside.length === 0, out.outside);
  check('no round stalls with zero monsters', out.roundStalled.length === 0, out.roundStalled);

  check('no page errors', errors.length === 0, errors.slice(0, 3));
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
