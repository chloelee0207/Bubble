/* ------------------------------------------------------------------
   main.js - boot, input, fixed-timestep loop, responsive scaling
   ------------------------------------------------------------------ */

(function () {
  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d', { alpha: false });

  var keys = {};    /* currently held */
  var latch = {};   /* pressed since the last simulation step - never dropped,
                       even if the whole tap happens between two frames */
  var touchState = { left: false, right: false, jump: false, fire: false };
  var touchLatch = { jump: false, fire: false };
  var audioReady = false;

  var BLOCKED = {
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
    Space: 1, Enter: 1, KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1
  };

  function down(code) { return !!keys[code]; }
  function hit(code) { return !!latch[code]; }

  function wakeAudio() {
    if (audioReady) return;
    audioReady = true;
    Sound.resume();
  }

  window.addEventListener('keydown', function (e) {
    if (BLOCKED[e.code]) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    latch[e.code] = true;
    wakeAudio();
  });

  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });

  /* ---- touch pad ---- */
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tbtn'), function (btn) {
    var name = btn.getAttribute('data-btn');
    function set(on) {
      touchState[name] = on;
      if (on && (name === 'jump' || name === 'fire')) touchLatch[name] = true;
      btn.classList.toggle('held', on);
    }
    ['pointerdown', 'touchstart'].forEach(function (ev) {
      btn.addEventListener(ev, function (e) { e.preventDefault(); wakeAudio(); set(true); }, { passive: false });
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'touchcancel'].forEach(function (ev) {
      btn.addEventListener(ev, function (e) { e.preventDefault(); set(false); }, { passive: false });
    });
  });

  canvas.addEventListener('pointerdown', function () { wakeAudio(); });

  function clearLatches() {
    latch = {};
    touchLatch.jump = false;
    touchLatch.fire = false;
  }

  function buildInputs() {
    var p1 = {
      left: down('ArrowLeft') || touchState.left,
      right: down('ArrowRight') || touchState.right,
      jump: down('ArrowUp') || touchState.jump,
      fire: down('Space') || down('KeyZ') || touchState.fire,
      jumpPressed: hit('ArrowUp') || touchLatch.jump,
      firePressed: hit('Space') || hit('KeyZ') || touchLatch.fire
    };
    var p2 = {
      left: down('KeyA'),
      right: down('KeyD'),
      jump: down('KeyW'),
      fire: down('KeyS'),
      jumpPressed: hit('KeyW'),
      firePressed: hit('KeyS')
    };
    return [p1, p2];
  }

  function buildUi() {
    return {
      upPressed: hit('ArrowUp') || hit('KeyW'),
      downPressed: hit('ArrowDown') || hit('KeyS'),
      confirmPressed: hit('Enter') || hit('Space') || hit('NumpadEnter') || touchLatch.fire,
      pausePressed: hit('KeyP'),
      escapePressed: hit('Escape')
    };
  }

  /* ---- fill as much of the window as the aspect ratio allows ---- */
  function resize() {
    var chrome = document.body.classList.contains('touch') ? 148 : 96;
    var availW = window.innerWidth - 24;
    var availH = window.innerHeight - chrome;
    layoutCanvas(canvas, Math.max(280, availW), Math.max(220, availH));
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  /* ---- boot ---- */
  initGfx();
  Game.init();
  resize();

  var STEP = 1000 / 60;
  var acc = 0;
  var last = performance.now();

  function frame(now) {
    var dt = now - last;
    last = now;
    if (dt > 250) dt = 250;
    acc += dt;

    var guard = 0;
    while (acc >= STEP && guard < 5) {
      acc -= STEP;
      guard++;
      var ui = buildUi();
      if (hit('KeyM')) Sound.setMuted(!Sound.muted);
      Game.update(buildInputs(), ui);
      clearLatches();
    }

    Game.draw(ctx);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
