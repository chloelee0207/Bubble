/* ------------------------------------------------------------------
   main.js - boot, input, fixed-timestep loop, screen scaling
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

  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });

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

  /* ---- build the per-frame input snapshot ---- */
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

  function clearLatches() {
    latch = {};
    touchLatch.jump = false;
    touchLatch.fire = false;
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

  /* ---- responsive integer scaling ---- */
  function resize() {
    var availW = Math.min(window.innerWidth - 24, 1100);
    var availH = window.innerHeight - (document.body.classList.contains('touch') ? 190 : 250);
    var scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    scale = Math.max(1, Math.floor(scale * 2) / 2);   /* half-step scaling */
    canvas.style.width = Math.round(VIEW_W * scale) + 'px';
    canvas.style.height = Math.round(VIEW_H * scale) + 'px';
  }
  window.addEventListener('resize', resize);

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

      if (hit('KeyM')) {
        Sound.setMuted(!Sound.muted);
      }

      Game.update(buildInputs(), ui);
      clearLatches();
    }

    Game.draw(ctx);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
