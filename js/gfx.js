/* ------------------------------------------------------------------
   gfx.js - constants, bitmap font, pixel-art sprites, tile rendering
   ------------------------------------------------------------------ */

var TILE = 16;
var COLS = 20;
var ROWS = 14;
var WORLD_W = COLS * TILE;   // 320
var WORLD_H = ROWS * TILE;   // 224
var HUD_H = 30;
var VIEW_W = WORLD_W;
var VIEW_H = WORLD_H + HUD_H;

/* physics (per 1/60s step) */
var GRAVITY = 0.30;
var MAX_FALL = 6.2;
var JUMP_V = -5.35;
var RUN_SPEED = 1.25;
var RUN_SPEED_FAST = 1.95;

/* ------------------------------------------------------------------
   3x5 bitmap font
   ------------------------------------------------------------------ */
var FONT = {
  'A': ['111', '101', '111', '101', '101'],
  'B': ['110', '101', '110', '101', '110'],
  'C': ['111', '100', '100', '100', '111'],
  'D': ['110', '101', '101', '101', '110'],
  'E': ['111', '100', '111', '100', '111'],
  'F': ['111', '100', '111', '100', '100'],
  'G': ['111', '100', '101', '101', '111'],
  'H': ['101', '101', '111', '101', '101'],
  'I': ['111', '010', '010', '010', '111'],
  'J': ['001', '001', '001', '101', '111'],
  'K': ['101', '101', '110', '101', '101'],
  'L': ['100', '100', '100', '100', '111'],
  'M': ['101', '111', '111', '101', '101'],
  'N': ['110', '101', '101', '101', '101'],
  'O': ['111', '101', '101', '101', '111'],
  'P': ['111', '101', '111', '100', '100'],
  'Q': ['111', '101', '101', '111', '001'],
  'R': ['111', '101', '111', '110', '101'],
  'S': ['111', '100', '111', '001', '111'],
  'T': ['111', '010', '010', '010', '010'],
  'U': ['101', '101', '101', '101', '111'],
  'V': ['101', '101', '101', '101', '010'],
  'W': ['101', '101', '111', '111', '101'],
  'X': ['101', '101', '010', '101', '101'],
  'Y': ['101', '101', '010', '010', '010'],
  'Z': ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ' ': ['000', '000', '000', '000', '000'],
  '-': ['000', '000', '111', '000', '000'],
  '!': ['010', '010', '010', '000', '010'],
  '.': ['000', '000', '000', '000', '010'],
  ',': ['000', '000', '000', '010', '100'],
  ':': ['000', '010', '000', '010', '000'],
  '/': ['001', '001', '010', '100', '100'],
  '?': ['111', '001', '011', '000', '010'],
  '*': ['101', '010', '111', '010', '101'],
  '(': ['010', '100', '100', '100', '010'],
  ')': ['010', '001', '001', '001', '010'],
  '+': ['000', '010', '111', '010', '000'],
  '=': ['000', '111', '000', '111', '000'],
  "'": ['010', '010', '000', '000', '000']
};

var CHAR_W = 4;   // 3px glyph + 1px gap
var CHAR_H = 5;

function textWidth(str, scale) {
  scale = scale || 1;
  return str.length * CHAR_W * scale - scale;
}

function drawText(ctx, str, x, y, scale, color) {
  scale = scale || 1;
  ctx.fillStyle = color || '#ffffff';
  str = String(str).toUpperCase();
  for (var i = 0; i < str.length; i++) {
    var g = FONT[str[i]];
    if (!g) continue;
    var gx = x + i * CHAR_W * scale;
    for (var r = 0; r < CHAR_H; r++) {
      var row = g[r];
      for (var c = 0; c < 3; c++) {
        if (row[c] === '1') ctx.fillRect(gx + c * scale, y + r * scale, scale, scale);
      }
    }
  }
}

function drawTextCentered(ctx, str, cx, y, scale, color) {
  drawText(ctx, str, Math.round(cx - textWidth(str, scale) / 2), y, scale, color);
}

/* Text with a 1px black outline - readable over busy backgrounds. */
function drawTextShadow(ctx, str, x, y, scale, color) {
  drawText(ctx, str, x + scale, y + scale, scale, '#000000');
  drawText(ctx, str, x, y, scale, color);
}

function drawTextCenteredShadow(ctx, str, cx, y, scale, color) {
  drawTextShadow(ctx, str, Math.round(cx - textWidth(str, scale) / 2), y, scale, color);
}

/* ------------------------------------------------------------------
   pixel-art sprite maps (16x16). Digits index into a palette.
   ------------------------------------------------------------------ */
var SPRITE_MAPS = {
  dragon: [
    '....111111......',
    '..111111111.....',
    '.11111111111....',
    '.111222211111...',
    '1112222221111...',
    '11222332211111..',
    '112223322111555.',
    '1112222211115555',
    '411111111111555.',
    '4411111111111...',
    '4442222222111...',
    '4422222222211...',
    '.222222222221...',
    '.22222222222....',
    '..111....111....',
    '..111....111....'
  ],
  /* Bub/Bob crouched into a ball while riding a bubble - reused for hurt frame */
  zen: [
    '....444444......',
    '..4444444444....',
    '..4444444444....',
    '.111111111111...',
    '.122222222211...',
    '.122322322211...',
    '.122322322211...',
    '.122222222211...',
    '.122211122211...',
    '.111111111111...',
    '.111111111111...',
    '.111111111111...',
    '..1111111111....',
    '..1111111111....',
    '..555....555....',
    '..555....555....'
  ],
  mighta: [
    '.....2222.......',
    '...22222222.....',
    '..2222222222....',
    '..2223223222....',
    '..2223223222....',
    '..2222222222....',
    '..2222222222....',
    '.222222222222...',
    '.222244442222...',
    '.222222222222...',
    '.222222222222...',
    '..2222222222....',
    '..2222222222....',
    '...22222222.....',
    '..444....444....',
    '..444....444....'
  ],
  monsta: [
    '......1111......',
    '....11111111....',
    '...1111111111...',
    '..111111111111..',
    '..122111111221..',
    '..123111111321..',
    '.11221111112211.',
    '.11111111111111.',
    '.11111111111111.',
    '4111111111111114',
    '4411111111111144',
    '..111111111111..',
    '...1111111111...',
    '....11111111....',
    '.....444444.....',
    '......4444......'
  ],
  banebou: [
    '.....111111.....',
    '...1111111111...',
    '..112211111221..',
    '.11122111112211.',
    '.11111111111111.',
    '.11111111111111.',
    '..222222222222..',
    '...2233223322...',
    '...2222222222...',
    '....22222222....',
    '.....444444.....',
    '....44....44....',
    '.....444444.....',
    '....44....44....',
    '.....444444.....',
    '....44444444....'
  ],
  skel: [
    '....111111......',
    '..1111111111....',
    '.111111111111...',
    '.113311331111...',
    '.113311331111...',
    '.111111111111...',
    '.111313131111...',
    '.111111111111...',
    '..1111111111....',
    '...11111111.....',
    '..1111111111....',
    '..1111111111....',
    '..1.111111.1....',
    '..1..1111..1....',
    '.....1111.......',
    '................'
  ]
};

/* palettes: index 1..5 */
var PALETTES = {
  bub:      [null, '#2ec32e', '#ffffff', '#101018', '#f4d020', '#ff7fb0'],
  bob:      [null, '#3a7bf0', '#ffffff', '#101018', '#f4d020', '#ff7fb0'],
  zen:      [null, '#3c6cf0', '#ffffff', '#101018', '#f0f0f0', '#ffb020'],
  zenMad:   [null, '#f03c3c', '#ffffff', '#101018', '#ffd0d0', '#ffb020'],
  mighta:   [null, '#c0c0d8', '#f0f0ff', '#101018', '#40c040', '#ffffff'],
  mightaMad:[null, '#ff9090', '#ffe0e0', '#101018', '#f04040', '#ffffff'],
  monsta:   [null, '#9b4bd8', '#ffffff', '#101018', '#5a1f8c', '#ffffff'],
  monstaMad:[null, '#e8407c', '#ffffff', '#101018', '#8c1f3c', '#ffffff'],
  banebou:  [null, '#f04040', '#f8f0d0', '#101018', '#40b0f0', '#ffffff'],
  banebouMad:[null,'#ff8000', '#fff0c0', '#101018', '#f04040', '#ffffff'],
  skel:     [null, '#f0f0f8', '#e0e0f0', '#202030', '#c0c0d0', '#ffffff']
};

var SPR = {};   // name -> {n: canvas, f: canvas}

function makeCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function bakeSprite(map, palette) {
  var w = map[0].length, h = map.length;
  var c = makeCanvas(w, h);
  var g = c.getContext('2d');
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var ch = map[y][x];
      if (ch === '.') continue;
      var col = palette[+ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  var f = makeCanvas(w, h);
  var fg = f.getContext('2d');
  fg.translate(w, 0);
  fg.scale(-1, 1);
  fg.drawImage(c, 0, 0);
  return { n: c, f: f, w: w, h: h };
}

function initSprites() {
  SPR.bub = bakeSprite(SPRITE_MAPS.dragon, PALETTES.bub);
  SPR.bob = bakeSprite(SPRITE_MAPS.dragon, PALETTES.bob);
  SPR.zen = bakeSprite(SPRITE_MAPS.zen, PALETTES.zen);
  SPR.zenMad = bakeSprite(SPRITE_MAPS.zen, PALETTES.zenMad);
  SPR.mighta = bakeSprite(SPRITE_MAPS.mighta, PALETTES.mighta);
  SPR.mightaMad = bakeSprite(SPRITE_MAPS.mighta, PALETTES.mightaMad);
  SPR.monsta = bakeSprite(SPRITE_MAPS.monsta, PALETTES.monsta);
  SPR.monstaMad = bakeSprite(SPRITE_MAPS.monsta, PALETTES.monstaMad);
  SPR.banebou = bakeSprite(SPRITE_MAPS.banebou, PALETTES.banebou);
  SPR.banebouMad = bakeSprite(SPRITE_MAPS.banebou, PALETTES.banebouMad);
  SPR.skel = bakeSprite(SPRITE_MAPS.skel, PALETTES.skel);
}

function drawSprite(ctx, spr, x, y, flip) {
  ctx.drawImage(flip ? spr.f : spr.n, Math.round(x), Math.round(y));
}

/* Draw a sprite shrunk to `size` px (used for monsters inside bubbles). */
function drawSpriteScaled(ctx, spr, x, y, size, flip) {
  ctx.drawImage(flip ? spr.f : spr.n, Math.round(x), Math.round(y), size, size);
}

/* ------------------------------------------------------------------
   level block tiles - diagonally striped, one baked tile per theme
   ------------------------------------------------------------------ */
var THEMES = [
  { a: '#ff86e0', b: '#c02090', bg: '#000000' },
  { a: '#7ce0ff', b: '#1060b0', bg: '#000410' },
  { a: '#ffd24a', b: '#c06010', bg: '#100800' },
  { a: '#7cff9c', b: '#108040', bg: '#001004' },
  { a: '#ff9c7c', b: '#a02020', bg: '#100000' },
  { a: '#c8a0ff', b: '#5028b0', bg: '#060010' },
  { a: '#ffffff', b: '#606080', bg: '#04040c' },
  { a: '#a0ffe8', b: '#108080', bg: '#001010' }
];

var TILE_CACHE = [];

function bakeTiles() {
  TILE_CACHE = THEMES.map(function (t) {
    var c = makeCanvas(TILE, TILE);
    var g = c.getContext('2d');
    g.fillStyle = t.b;
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = t.a;
    for (var y = 0; y < TILE; y++) {
      for (var x = 0; x < TILE; x++) {
        if ((x + y) % 8 < 4) g.fillRect(x, y, 1, 1);
      }
    }
    /* subtle bevel so blocks read as solid objects */
    g.fillStyle = 'rgba(255,255,255,0.30)';
    g.fillRect(0, 0, TILE, 1);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, TILE - 1, TILE, 1);
    return c;
  });
}

function initGfx() {
  initSprites();
  bakeTiles();
}
