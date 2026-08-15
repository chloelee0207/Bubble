/* ------------------------------------------------------------------
   audio.js - tiny WebAudio chiptune engine (square/triangle/noise)
   ------------------------------------------------------------------ */

var Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  muted: false,
  musicTimer: 0,
  musicStep: 0,
  musicOn: false,

  init: function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.24;
    this.musicGain.connect(this.master);
  },

  resume: function () {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted: function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  },

  /* one blip: type, start freq, end freq, duration, volume */
  blip: function (type, f0, f1, dur, vol, dest) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise: function (dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    var len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = this.ctx.createBufferSource();
    src.buffer = buf;
    var f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq || 1200;
    var g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  },

  play: function (name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump':      this.blip('square', 300, 720, 0.11, 0.18); break;
      case 'bubble':    this.blip('sine', 900, 380, 0.13, 0.16); break;
      case 'pop':       this.blip('square', 620, 180, 0.07, 0.16); this.noise(0.06, 0.10, 1800); break;
      case 'trap':      this.blip('sine', 400, 1100, 0.14, 0.18); break;
      case 'kill':      this.blip('square', 880, 220, 0.18, 0.20); this.noise(0.12, 0.12, 900); break;
      case 'chain':     this.blip('square', 520, 1600, 0.28, 0.22); break;
      case 'item':      this.blip('square', 700, 1400, 0.10, 0.18); break;
      case 'letter':    this.blip('triangle', 500, 1500, 0.20, 0.22); break;
      case 'extend':    this.blip('square', 400, 1800, 0.45, 0.25); break;
      case 'death':     this.blip('sawtooth', 500, 60, 0.60, 0.22); break;
      case 'hurry':     this.blip('square', 180, 900, 0.30, 0.22); break;
      case 'clear':     this.blip('square', 500, 1000, 0.10, 0.20); break;
      case 'select':    this.blip('square', 900, 900, 0.05, 0.16); break;
      case 'start':     this.blip('square', 300, 1200, 0.30, 0.22); break;
      case 'thunder':   this.blip('sawtooth', 1400, 300, 0.25, 0.20); this.noise(0.2, 0.14, 2600); break;
      case 'water':     this.noise(0.35, 0.10, 500); break;
      case 'fire':      this.noise(0.30, 0.12, 2200); break;
      case 'gameover':  this.blip('square', 400, 80, 0.9, 0.22); break;
    }
  },

  /* ---- background loop: an original 16-step bouncy bassline + lead ---- */
  BASS: [55, 0, 82, 0, 65, 0, 98, 0, 73, 0, 110, 0, 65, 0, 98, 0],
  LEAD: [440, 523, 659, 523, 587, 494, 440, 392, 440, 523, 659, 784, 659, 587, 523, 494],

  startMusic: function () { this.musicOn = true; this.musicStep = 0; this.musicTimer = 0; },
  stopMusic: function () { this.musicOn = false; },

  /* called once per frame from the game loop */
  tickMusic: function (fast) {
    if (!this.musicOn || !this.ctx || this.muted) return;
    var period = fast ? 6 : 9;              // frames per 1/16 note
    if (--this.musicTimer > 0) return;
    this.musicTimer = period;
    var s = this.musicStep % 16;
    var b = this.BASS[s];
    if (b) this.blip('triangle', b, b, 0.16, 0.30, this.musicGain);
    if (s % 2 === 0) {
      var l = this.LEAD[s];
      this.blip('square', l, l, 0.10, 0.10, this.musicGain);
    }
    if (s % 4 === 0) this.noise(0.05, 0.05, 5000);
    this.musicStep++;
  }
};
