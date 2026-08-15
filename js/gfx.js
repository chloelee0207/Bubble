/* ------------------------------------------------------------------
   gfx.js - world metrics, responsive scaling, modern vector rendering
   ------------------------------------------------------------------

   Everything is drawn in WORLD UNITS. One transform scales the whole
   scene to whatever size the window allows, so the art stays crisp at
   any resolution instead of being an upscaled pixel grid.
   ------------------------------------------------------------------ */

var TILE = 16;
var COLS = 24;
var ROWS = 16;
var WORLD_W = COLS * TILE;      // 384
var WORLD_H = ROWS * TILE;      // 256
var HUD_H = 26;                 // world units, above the play area
var VIEW_W = WORLD_W;
var VIEW_H = WORLD_H + HUD_H;   // 282

/* physics, in world units per 1/60s step */
var GRAVITY = 0.30;
var MAX_FALL = 6.4;
var JUMP_V = -6.0;              // apex 57 units = 3.5 tiles, clears a 3-row gap
var RUN_SPEED = 1.35;
var RUN_SPEED_FAST = 2.05;
var COYOTE_FRAMES = 7;          // grace period after walking off a ledge
var JUMP_BUFFER_FRAMES = 8;     // early jump press still counts on landing
var LAND_TOLERANCE = 4;         // forgiveness when you *just* clear a platform

/* ------------------------------------------------------------------
   view / scaling
   ------------------------------------------------------------------ */
var View = { scale: 3, dpr: 1, cssW: 0, cssH: 0 };

function layoutCanvas(canvas, cssW, cssH) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var s = Math.min(cssW / VIEW_W, cssH / VIEW_H);
  View.scale = s * dpr;
  View.dpr = dpr;
  View.cssW = Math.round(VIEW_W * s);
  View.cssH = Math.round(VIEW_H * s);
  canvas.width = Math.round(VIEW_W * View.scale);
  canvas.height = Math.round(VIEW_H * View.scale);
  canvas.style.width = View.cssW + 'px';
  canvas.style.height = View.cssH + 'px';
}

/* ------------------------------------------------------------------
   text
   ------------------------------------------------------------------ */
var FONT_STACK = '"Baloo 2","Segoe UI Rounded",ui-rounded,"SF Pro Rounded",' +
                 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

function txt(ctx, str, x, y, size, color, align, weight) {
  ctx.font = (weight || '800') + ' ' + size + 'px ' + FONT_STACK;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

/* Text with a soft dark halo so it survives any background. */
function txtGlow(ctx, str, x, y, size, color, align, weight) {
  ctx.save();
  ctx.font = (weight || '800') + ' ' + size + 'px ' + FONT_STACK;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.min(4.5, size * 0.16);
  ctx.strokeStyle = 'rgba(2,4,14,0.85)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/* ------------------------------------------------------------------
   shapes
   ------------------------------------------------------------------ */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function oval(ctx, cx, cy, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ------------------------------------------------------------------
   themes - modern, low-contrast backgrounds with luminous blocks
   ------------------------------------------------------------------ */
var THEMES = [
  { bg: '#0d1030', glowA: '#3a2a8c', glowB: '#0f5a7a',
    b1: '#7b6bff', b2: '#4632c4', hi: '#c3b9ff', edge: '#a99bff' },
  { bg: '#0b1a2b', glowA: '#0e4f7a', glowB: '#116b6b',
    b1: '#48c8f0', b2: '#1d6ba8', hi: '#c4f0ff', edge: '#8fdcf5' },
  { bg: '#2a1024', glowA: '#7a1f52', glowB: '#8c3a1f',
    b1: '#ff7aa8', b2: '#c2356b', hi: '#ffd0e0', edge: '#ffa3c2' },
  { bg: '#0e2018', glowA: '#1d6b3f', glowB: '#5a7a12',
    b1: '#5fd98a', b2: '#25874f', hi: '#c8ffdb', edge: '#93ecb4' },
  { bg: '#26160b', glowA: '#8c4a12', glowB: '#7a2f1f',
    b1: '#ffb057', b2: '#c96a1c', hi: '#ffe2bd', edge: '#ffcb8c' },
  { bg: '#141430', glowA: '#3f3f8c', glowB: '#5a2a7a',
    b1: '#b39aff', b2: '#6b4fc9', hi: '#e6dcff', edge: '#cbbaff' },
  { bg: '#0a1420', glowA: '#2a4a6b', glowB: '#3a3a5a',
    b1: '#9fb6d4', b2: '#5a6f8f', hi: '#e2ecf7', edge: '#c2d4e8' },
  { bg: '#04201f', glowA: '#0f5c58', glowB: '#0a3a5c',
    b1: '#4fe0d2', b2: '#1a8f88', hi: '#c8fff8', edge: '#8ef0e4' }
];

/* ------------------------------------------------------------------
   level geometry -> merged rectangles (so walls read as slabs, not tiles)
   ------------------------------------------------------------------ */
function decomposeBlocks(level) {
  var filled = [];
  var r, c;
  for (r = 0; r < ROWS; r++) {
    filled[r] = [];
    for (c = 0; c < COLS; c++) {
      var t = level.tiles[r][c];
      filled[r][c] = (t === 'X' || t === '#') ? 1 : 0;
    }
  }
  var out = [];
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      if (!filled[r][c]) continue;
      var w = 1;
      while (c + w < COLS && filled[r][c + w]) w++;
      var h = 1;
      for (;;) {
        var rr = r + h;
        if (rr >= ROWS) break;
        var ok = true;
        for (var k = 0; k < w; k++) if (!filled[rr][c + k]) { ok = false; break; }
        if (!ok) break;
        h++;
      }
      for (var y = r; y < r + h; y++) for (var x = c; x < c + w; x++) filled[y][x] = 0;
      out.push({ c: c, r: r, w: w, h: h });
    }
  }
  return out;
}

function drawBlocks(ctx, level) {
  if (!level._blocks) level._blocks = decomposeBlocks(level);
  var th = THEMES[level.theme];
  var blocks = level._blocks;

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var x = b.c * TILE, y = b.r * TILE, w = b.w * TILE, h = b.h * TILE;

    /* Border slabs bleed OUTWARD only - never over the surface you stand
       on - so the frame reads as one piece without sinking the critters.
       Free-standing rungs keep their rounded capsule ends. */
    var onBorder = false;
    if (b.r === 0) { y -= 2; h += 2; onBorder = true; }
    if (b.r + b.h === ROWS) { h += 2; onBorder = true; }
    if (b.c === 0) { x -= 2; w += 2; onBorder = true; }
    if (b.c + b.w === COLS) { w += 2; onBorder = true; }
    var rad = onBorder ? 3 : Math.min(7, w / 2, h / 2);

    /* drop shadow grounds the slab against the background */
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundRect(ctx, x + 1, y + 3.5, w, h, rad);
    ctx.fill();

    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, th.b1);
    g.addColorStop(1, th.b2);
    roundRect(ctx, x, y, w, h, rad);
    ctx.fillStyle = g;
    ctx.fill();

    /* glossy top lip */
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    roundRect(ctx, x + 2, y + 1.5, w - 4, Math.min(5, h * 0.45), 2.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + h - 3, w, 3);
    ctx.restore();

    ctx.strokeStyle = th.edge;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, rad);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------
   background - soft drifting light, no tiling
   ------------------------------------------------------------------ */
var BG_DOTS = [];
function initBackdrop() {
  BG_DOTS = [];
  for (var i = 0; i < 34; i++) {
    BG_DOTS.push({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: 0.6 + Math.random() * 1.8,
      s: 0.05 + Math.random() * 0.18,
      a: 0.06 + Math.random() * 0.18
    });
  }
}

function drawBackdrop(ctx, theme, t) {
  var th = THEMES[theme];
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  var gx = WORLD_W * 0.28 + Math.sin(t * 0.004) * 30;
  var gy = WORLD_H * 0.30 + Math.cos(t * 0.003) * 22;
  var g1 = ctx.createRadialGradient(gx, gy, 8, gx, gy, WORLD_W * 0.55);
  g1.addColorStop(0, th.glowA);
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  var hx = WORLD_W * 0.74 + Math.cos(t * 0.0035) * 34;
  var hy = WORLD_H * 0.72 + Math.sin(t * 0.0045) * 24;
  var g2 = ctx.createRadialGradient(hx, hy, 8, hx, hy, WORLD_W * 0.5);
  g2.addColorStop(0, th.glowB);
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.globalAlpha = 1;

  for (var i = 0; i < BG_DOTS.length; i++) {
    var d = BG_DOTS[i];
    d.y -= d.s;
    if (d.y < -4) { d.y = WORLD_H + 4; d.x = Math.random() * WORLD_W; }
    ctx.globalAlpha = d.a;
    oval(ctx, d.x, d.y, d.r, d.r, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------
   CRITTERS
   Every critter draws with (0,0) at the centre of its feet and grows
   upward, so callers just translate to the entity's foot position.
   ------------------------------------------------------------------ */
var SKIN = {
  cat:    { body: '#57e0a5', dark: '#2eab77', belly: '#d6fff0', ear: '#ff9ec4', accent: '#1d7a55' },
  bunny:  { body: '#7fa8ff', dark: '#4f76d6', belly: '#e2ecff', ear: '#ffb0d0', accent: '#33509e' },
  chick:  { body: '#ffd45e', dark: '#e0a726', belly: '#fff0bd', ear: '#ff8a3d', accent: '#b57c12' },
  ghost:  { body: '#dcd6ff', dark: '#a99ce8', belly: '#ffffff', ear: '#b9a8ff', accent: '#7d6cc4' },
  bat:    { body: '#b07aff', dark: '#7a4fd1', belly: '#ecdcff', ear: '#ff9ec4', accent: '#5a2f9e' },
  frog:   { body: '#7fe06b', dark: '#48ac3a', belly: '#e6ffd9', ear: '#ff9ec4', accent: '#2f7a26' },
  hunter: { body: '#f2f6ff', dark: '#b9c6e0', belly: '#ffffff', ear: '#ff7a7a', accent: '#8fa2c4' }
};

var MAD = { body: '#ff6b5e', dark: '#c93b32', belly: '#ffd9d2', ear: '#ffd24a', accent: '#8f221c' };

function skinFor(kind, angry) {
  return angry ? MAD : SKIN[kind];
}

/* soft contact shadow under a critter */
function critterShadow(ctx, w) {
  ctx.globalAlpha = 0.28;
  oval(ctx, 0, 0.6, w * 0.46, w * 0.15, '#000000');
  ctx.globalAlpha = 1;
}

/* big friendly eyes; `look` shifts the pupils, `blink` squashes them */
function critterEyes(ctx, y, spread, rx, ry, look, blink, pupil) {
  pupil = pupil || '#1b1b2e';
  var e = [-spread, spread];
  for (var i = 0; i < 2; i++) {
    var x = e[i];
    if (blink) {
      ctx.strokeStyle = pupil;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x - rx, y);
      ctx.lineTo(x + rx, y);
      ctx.stroke();
      continue;
    }
    oval(ctx, x, y, rx, ry, '#ffffff');
    oval(ctx, x + look * 0.7, y + 0.3, rx * 0.56, ry * 0.62, pupil);
    oval(ctx, x + look * 0.7 - rx * 0.22, y - ry * 0.34, rx * 0.20, ry * 0.22, '#ffffff');
  }
}

function critterBlush(ctx, y, spread, c) {
  ctx.globalAlpha = 0.5;
  oval(ctx, -spread, y, 1.9, 1.2, c || '#ff8fb0');
  oval(ctx, spread, y, 1.9, 1.2, c || '#ff8fb0');
  ctx.globalAlpha = 1;
}

/* angry eyebrows, used when a monster escapes a bubble */
function critterBrows(ctx, y, spread) {
  ctx.strokeStyle = '#7a1410';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-spread - 2.2, y - 1.4);
  ctx.lineTo(-spread + 1.6, y + 0.4);
  ctx.moveTo(spread + 2.2, y - 1.4);
  ctx.lineTo(spread - 1.6, y + 0.4);
  ctx.stroke();
}

var BLINK_PERIOD = 190;
function isBlinking(t) { return (t % BLINK_PERIOD) < 7; }

/* ---- player: cat ---- */
function drawCat(ctx, pal, t, squash) {
  var s = squash || 0;
  var bh = 8 + s, bw = 7.6 - s * 0.5;
  critterShadow(ctx, 15);

  /* tail */
  ctx.strokeStyle = pal.dark;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5.5, -4);
  ctx.quadraticCurveTo(-11.5, -5 + Math.sin(t * 0.09) * 1.6, -10, -11 + Math.sin(t * 0.09) * 1.6);
  ctx.stroke();

  /* feet */
  oval(ctx, -3.8, -1.4, 3.2, 2.1, pal.dark);
  oval(ctx, 3.8, -1.4, 3.2, 2.1, pal.dark);

  /* ears */
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.moveTo(-6.6, -12.4); ctx.lineTo(-4.4, -17.6); ctx.lineTo(-1.4, -13.6); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6.6, -12.4); ctx.lineTo(4.4, -17.6); ctx.lineTo(1.4, -13.6); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.ear;
  ctx.beginPath();
  ctx.moveTo(-5.6, -13.0); ctx.lineTo(-4.5, -16.0); ctx.lineTo(-3.0, -13.6); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5.6, -13.0); ctx.lineTo(4.5, -16.0); ctx.lineTo(3.0, -13.6); ctx.closePath();
  ctx.fill();

  /* body */
  oval(ctx, 0, -bh, bw, bh, pal.body);
  oval(ctx, 0, -bh + 2.4, bw * 0.66, bh * 0.62, pal.belly);
  ctx.globalAlpha = 0.22;
  oval(ctx, -bw * 0.38, -bh - 2.6, bw * 0.34, bh * 0.26, '#ffffff');
  ctx.globalAlpha = 1;

  var blink = isBlinking(t);
  critterEyes(ctx, -bh - 1.4, 3.1, 2.3, 2.7, 0.7, blink);
  critterBlush(ctx, -bh + 1.6, 5.6);

  /* muzzle */
  oval(ctx, 0.4, -bh + 3.2, 1.0, 0.8, pal.ear);
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0.4, -bh + 3.9);
  ctx.quadraticCurveTo(-1.3, -bh + 5.1, -2.3, -bh + 3.9);
  ctx.moveTo(0.4, -bh + 3.9);
  ctx.quadraticCurveTo(2.1, -bh + 5.1, 3.1, -bh + 3.9);
  ctx.stroke();

  /* whiskers */
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(4.2, -bh + 2.6); ctx.lineTo(7.8, -bh + 1.8);
  ctx.moveTo(4.2, -bh + 3.8); ctx.lineTo(7.8, -bh + 4.0);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ---- player: bunny ---- */
function drawBunny(ctx, pal, t, squash) {
  var s = squash || 0;
  var bh = 8 + s, bw = 7.6 - s * 0.5;
  critterShadow(ctx, 15);

  /* ears */
  var wob = Math.sin(t * 0.08) * 1.2;
  ctx.fillStyle = pal.body;
  ctx.save();
  ctx.translate(-3.4, -13.5); ctx.rotate(-0.18 + wob * 0.02);
  roundRect(ctx, -1.9, -8.5, 3.8, 10, 1.9); ctx.fill();
  ctx.fillStyle = pal.ear;
  roundRect(ctx, -1.0, -7.2, 2.0, 7.2, 1.0); ctx.fill();
  ctx.restore();
  ctx.fillStyle = pal.body;
  ctx.save();
  ctx.translate(3.4, -13.5); ctx.rotate(0.18 - wob * 0.02);
  roundRect(ctx, -1.9, -8.5, 3.8, 10, 1.9); ctx.fill();
  ctx.fillStyle = pal.ear;
  roundRect(ctx, -1.0, -7.2, 2.0, 7.2, 1.0); ctx.fill();
  ctx.restore();

  /* tail */
  oval(ctx, -6.8, -5.2, 2.4, 2.4, pal.belly);

  /* feet */
  oval(ctx, -3.9, -1.4, 3.4, 2.2, pal.dark);
  oval(ctx, 3.9, -1.4, 3.4, 2.2, pal.dark);

  /* body */
  oval(ctx, 0, -bh, bw, bh, pal.body);
  oval(ctx, 0, -bh + 2.4, bw * 0.66, bh * 0.62, pal.belly);
  ctx.globalAlpha = 0.22;
  oval(ctx, -bw * 0.38, -bh - 2.6, bw * 0.34, bh * 0.26, '#ffffff');
  ctx.globalAlpha = 1;

  var blink = isBlinking(t + 60);
  critterEyes(ctx, -bh - 1.4, 3.1, 2.3, 2.7, 0.7, blink);
  critterBlush(ctx, -bh + 1.6, 5.6);

  /* nose + buck teeth */
  oval(ctx, 0.4, -bh + 3.0, 1.0, 0.8, pal.ear);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -0.7, -bh + 3.8, 2.2, 2.0, 0.6);
  ctx.fill();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0.4, -bh + 3.8); ctx.lineTo(0.4, -bh + 5.8);
  ctx.stroke();
}

/* ---- monster: chick (walks and hops) ---- */
function drawChick(ctx, pal, t, angry) {
  critterShadow(ctx, 14);
  var bob = Math.sin(t * 0.16) * 0.5;

  /* head tuft */
  ctx.strokeStyle = pal.dark;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -13.4 + bob);
  ctx.quadraticCurveTo(1.4, -16.6 + bob, 3.0, -15.2 + bob);
  ctx.stroke();

  /* feet */
  ctx.strokeStyle = pal.ear;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2.6, -2.4); ctx.lineTo(-2.6, -0.4);
  ctx.moveTo(2.6, -2.4); ctx.lineTo(2.6, -0.4);
  ctx.moveTo(-4.2, -0.4); ctx.lineTo(-1.0, -0.4);
  ctx.moveTo(1.0, -0.4); ctx.lineTo(4.2, -0.4);
  ctx.stroke();

  /* body */
  oval(ctx, 0, -7.4 + bob, 7.0, 7.0, pal.body);
  oval(ctx, 0, -5.4 + bob, 4.6, 4.4, pal.belly);

  /* wing */
  ctx.save();
  ctx.rotate(Math.sin(t * 0.22) * 0.16);
  oval(ctx, -5.4, -6.6 + bob, 2.3, 3.4, pal.dark);
  ctx.restore();

  ctx.globalAlpha = 0.2;
  oval(ctx, -2.6, -10.4 + bob, 2.6, 1.7, '#ffffff');
  ctx.globalAlpha = 1;

  critterEyes(ctx, -9.0 + bob, 2.6, 1.9, 2.2, 0.6, isBlinking(t + 30));
  if (angry) critterBrows(ctx, -11.6 + bob, 2.6);

  /* beak */
  ctx.fillStyle = pal.ear;
  ctx.beginPath();
  ctx.moveTo(1.6, -7.6 + bob);
  ctx.lineTo(5.4, -6.6 + bob);
  ctx.lineTo(1.6, -5.4 + bob);
  ctx.closePath();
  ctx.fill();
}

/* ---- monster: ghost (throws stars) ---- */
function drawGhost(ctx, pal, t, angry) {
  var float = Math.sin(t * 0.1) * 1.1;
  ctx.globalAlpha = 0.94;

  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.moveTo(-7, -6 + float);
  ctx.quadraticCurveTo(-7, -15.5 + float, 0, -15.5 + float);
  ctx.quadraticCurveTo(7, -15.5 + float, 7, -6 + float);
  /* wavy hem */
  ctx.lineTo(7, -2.2 + float);
  ctx.quadraticCurveTo(5.2, -0.2 + float, 3.5, -2.2 + float);
  ctx.quadraticCurveTo(1.7, -0.2 + float, 0, -2.2 + float);
  ctx.quadraticCurveTo(-1.7, -0.2 + float, -3.5, -2.2 + float);
  ctx.quadraticCurveTo(-5.2, -0.2 + float, -7, -2.2 + float);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.28;
  oval(ctx, -2.6, -11.6 + float, 2.7, 1.8, '#ffffff');
  ctx.globalAlpha = 1;

  critterEyes(ctx, -10.4 + float, 2.7, 2.0, 2.4, 0.6, isBlinking(t + 90));
  if (angry) critterBrows(ctx, -13.2 + float, 2.7);
  oval(ctx, 0.6, -6.2 + float, 1.4, 1.7, pal.accent);
  critterBlush(ctx, -7.6 + float, 5.2, '#ffb4cc');
}

/* ---- monster: bat (flies) ---- */
function drawBat(ctx, pal, t, angry) {
  var flap = Math.sin(t * 0.34);

  /* wings */
  ctx.fillStyle = pal.dark;
  for (var side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(flap * 0.22);
    ctx.beginPath();
    ctx.moveTo(4.6, -7.6);
    ctx.quadraticCurveTo(12.6, -11.4, 13.4, -5.6);
    ctx.quadraticCurveTo(10.4, -6.6, 9.4, -4.2);
    ctx.quadraticCurveTo(8.0, -6.0, 6.2, -4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ears */
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.moveTo(-5.2, -11.4); ctx.lineTo(-4.0, -16.4); ctx.lineTo(-1.4, -12.6); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5.2, -11.4); ctx.lineTo(4.0, -16.4); ctx.lineTo(1.4, -12.6); ctx.closePath();
  ctx.fill();

  oval(ctx, 0, -7.4, 6.6, 6.8, pal.body);
  oval(ctx, 0, -5.6, 4.0, 4.2, pal.belly);
  ctx.globalAlpha = 0.2;
  oval(ctx, -2.4, -10.4, 2.4, 1.6, '#ffffff');
  ctx.globalAlpha = 1;

  critterEyes(ctx, -8.8, 2.7, 2.1, 2.4, 0.6, isBlinking(t + 120));
  if (angry) critterBrows(ctx, -11.6, 2.7);

  /* fangs */
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-1.6, -4.6); ctx.lineTo(-0.6, -2.8); ctx.lineTo(0.0, -4.6); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.8, -4.6); ctx.lineTo(1.8, -2.8); ctx.lineTo(2.4, -4.6); ctx.closePath();
  ctx.fill();
}

/* ---- monster: frog (hops) ---- */
function drawFrog(ctx, pal, t, angry) {
  critterShadow(ctx, 15);

  /* back legs */
  oval(ctx, -6.0, -2.4, 3.2, 2.4, pal.dark);
  oval(ctx, 6.0, -2.4, 3.2, 2.4, pal.dark);

  oval(ctx, 0, -6.0, 7.4, 6.2, pal.body);
  oval(ctx, 0, -4.2, 4.8, 3.8, pal.belly);

  /* eye bumps sit on top of the head */
  oval(ctx, -3.4, -11.4, 3.1, 3.1, pal.body);
  oval(ctx, 3.4, -11.4, 3.1, 3.1, pal.body);
  critterEyes(ctx, -11.8, 3.4, 2.0, 2.2, 0.5, isBlinking(t + 150));
  if (angry) critterBrows(ctx, -14.6, 3.4);

  /* wide smile */
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -6.6, 4.2, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  critterBlush(ctx, -6.0, 5.6);
}

/* ---- the HURRY UP! hunter ---- */
function drawHunter(ctx, pal, t) {
  var float = Math.sin(t * 0.14) * 1.4;
  ctx.save();
  ctx.globalAlpha = 0.55;
  oval(ctx, 0, -8 + float, 11, 11.5, '#8fb4ff');
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.moveTo(-7, -6 + float);
  ctx.quadraticCurveTo(-7, -16 + float, 0, -16 + float);
  ctx.quadraticCurveTo(7, -16 + float, 7, -6 + float);
  ctx.lineTo(7, -1.6 + float);
  ctx.quadraticCurveTo(4.6, -4.2 + float, 2.4, -1.6 + float);
  ctx.quadraticCurveTo(0, -4.2 + float, -2.4, -1.6 + float);
  ctx.quadraticCurveTo(-4.6, -4.2 + float, -7, -1.6 + float);
  ctx.closePath();
  ctx.fill();

  /* X eyes */
  ctx.strokeStyle = '#2b2b45';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  var ey = -10.6 + float;
  ctx.beginPath();
  ctx.moveTo(-4.4, ey - 1.8); ctx.lineTo(-1.6, ey + 1.4);
  ctx.moveTo(-1.6, ey - 1.8); ctx.lineTo(-4.4, ey + 1.4);
  ctx.moveTo(1.6, ey - 1.8); ctx.lineTo(4.4, ey + 1.4);
  ctx.moveTo(4.4, ey - 1.8); ctx.lineTo(1.6, ey + 1.4);
  ctx.stroke();

  /* jagged grin */
  ctx.fillStyle = '#2b2b45';
  ctx.beginPath();
  ctx.moveTo(-3.6, -6.0 + float);
  for (var i = 0; i < 4; i++) {
    ctx.lineTo(-3.6 + i * 1.8 + 0.9, -4.0 + float);
    ctx.lineTo(-3.6 + (i + 1) * 1.8, -6.0 + float);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

var CRITTER_DRAW = {
  cat: drawCat, bunny: drawBunny, chick: drawChick,
  ghost: drawGhost, bat: drawBat, frog: drawFrog, hunter: drawHunter
};

/* Every critter is drawn this much larger than its base art. */
var CRITTER_SCALE = 1.32;

/* Draw a critter with its feet at (fx, fy), mirrored by `facing`. */
function drawCritter(ctx, kind, fx, fy, facing, t, opts) {
  opts = opts || {};
  var fn = CRITTER_DRAW[kind];
  if (!fn) return;
  var scale = (opts.scale || 1) * CRITTER_SCALE;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(scale * (facing < 0 ? -1 : 1), scale);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  fn(ctx, opts.pal || skinFor(kind, opts.angry), t, opts.squash || 0, opts.angry);
  ctx.restore();
}

function initGfx() {
  initBackdrop();
}
