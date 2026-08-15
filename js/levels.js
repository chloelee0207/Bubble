/* ------------------------------------------------------------------
   levels.js - round layouts, 24 x 16 tiles

     'X' solid block (blocks every direction)
     '#' platform  (land on top, jump up through it)
     '.' empty

   Every rung sits 3 rows (48 units) above the one below it, which a
   57-unit jump clears with room to spare - so the whole level can be
   climbed on foot, and bubbles are a shortcut rather than a necessity.
   Platforms stay inside columns 2..21 so nothing crowds the walls, and
   rows 1-2 are always clear so nothing crowds the ceiling.
   ------------------------------------------------------------------ */

var OPEN = 'X......................X';
var ROOF = 'XXXXXXXXXXXXXXXXXXXXXXXX';
var PITS = 'XXXX..XXXXXXXXXXXX..XXXX';   /* gaps let you fall through and wrap */

var LEVELS = [
  {
    theme: 0, drift: 0.10, spawn: [[3, 14], [20, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X..#################...X',
      OPEN, OPEN,
      'X...#################..X',
      OPEN, OPEN,
      'X..#################...X',
      OPEN, OPEN,
      'X...#################..X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['chick', 5, 1], ['chick', 18, 1], ['chick', 11, 7]]
  },
  {
    theme: 1, drift: -0.10, spawn: [[3, 14], [20, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X...#####......#####...X',
      OPEN, OPEN,
      'X.......########.......X',
      OPEN, OPEN,
      'X...#####......#####...X',
      OPEN, OPEN,
      'X.......########.......X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['chick', 5, 1], ['chick', 18, 1], ['chick', 11, 4], ['ghost', 11, 10]]
  },
  {
    theme: 2, drift: 0.12, spawn: [[3, 14], [20, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X.............######...X',
      OPEN, OPEN,
      'X........######........X',
      OPEN, OPEN,
      'X...######.............X',
      OPEN, OPEN,
      'X........######........X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['chick', 17, 1], ['ghost', 11, 4], ['chick', 5, 7], ['chick', 11, 10]]
  },
  {
    theme: 3, drift: -0.12, spawn: [[8, 14], [15, 14]],
    tiles: [
      PITS, OPEN, OPEN,
      'X..######......######..X',
      OPEN, OPEN,
      'X.......########.......X',
      OPEN, OPEN,
      'X..######......######..X',
      OPEN, OPEN,
      'X.......########.......X',
      OPEN, OPEN, PITS
    ],
    enemies: [['chick', 5, 1], ['chick', 18, 1], ['bat', 11, 5], ['chick', 11, 10]]
  },
  {
    theme: 4, drift: 0.08, spawn: [[3, 14], [20, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X..###############.....X',
      'X................X.....X',
      'X................X.....X',
      'X.....###########X.....X',
      'X.....X................X',
      'X.....X................X',
      'X.....X###########.....X',
      OPEN, OPEN,
      'X....##############....X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['ghost', 4, 1], ['chick', 20, 1], ['chick', 11, 4], ['ghost', 6, 10]]
  },
  {
    theme: 5, drift: -0.08, spawn: [[8, 14], [15, 14]],
    tiles: [
      PITS, OPEN, OPEN,
      'X..###..###..###..###..X',
      OPEN, OPEN,
      'X....###..###..###.....X',
      OPEN, OPEN,
      'X..###..###..###..###..X',
      OPEN, OPEN,
      'X....###..###..###.....X',
      OPEN, OPEN, PITS
    ],
    enemies: [['chick', 5, 1], ['chick', 18, 1], ['frog', 8, 4], ['frog', 15, 7], ['chick', 11, 10]]
  },
  {
    theme: 6, drift: 0.14, spawn: [[3, 14], [20, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X.....############.....X',
      'X.....X..........X.....X',
      'X.....X..........X.....X',
      'X.....############.....X',
      OPEN, OPEN,
      'X..##########..........X',
      OPEN, OPEN,
      'X........##########....X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['bat', 11, 4], ['chick', 5, 7], ['chick', 18, 7], ['bat', 11, 10], ['ghost', 11, 13]]
  },
  {
    theme: 7, drift: -0.14, spawn: [[3, 14], [20, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X..####..######..####..X',
      OPEN, OPEN,
      'X.####..####..####.....X',
      OPEN, OPEN,
      'X..####..######..####..X',
      OPEN, OPEN,
      'X.####..####..####.....X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['ghost', 5, 1], ['frog', 18, 1], ['chick', 11, 4], ['ghost', 8, 7], ['chick', 16, 10]]
  },
  {
    theme: 0, drift: 0.16, spawn: [[8, 14], [15, 14]],
    tiles: [
      PITS, OPEN, OPEN,
      'X..#####......#####....X',
      OPEN, OPEN,
      'X......##########......X',
      OPEN, OPEN,
      'X..#####......#####....X',
      OPEN, OPEN,
      'X......##########......X',
      OPEN, OPEN, PITS
    ],
    enemies: [['chick', 5, 1], ['chick', 18, 1], ['bat', 11, 4], ['chick', 8, 7], ['frog', 15, 10]]
  },
  {
    theme: 3, drift: -0.16, spawn: [[20, 14], [3, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X..################....X',
      OPEN, OPEN,
      'X....################..X',
      OPEN, OPEN,
      'X..################....X',
      OPEN, OPEN,
      'X....################..X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['ghost', 5, 1], ['ghost', 17, 1], ['chick', 11, 4], ['ghost', 8, 7], ['chick', 16, 10]]
  },
  {
    theme: 5, drift: 0.18, spawn: [[8, 14], [15, 14]],
    tiles: [
      PITS, OPEN, OPEN,
      'X..###..###..###..###..X',
      OPEN, OPEN,
      'X.###..######..###.....X',
      OPEN, OPEN,
      'X..###..###..###..###..X',
      OPEN, OPEN,
      'X.###..######..###.....X',
      OPEN, OPEN, PITS
    ],
    enemies: [['frog', 5, 1], ['frog', 18, 1], ['bat', 11, 4],
              ['bat', 7, 7], ['chick', 16, 10]]
  },
  {
    theme: 4, drift: 0.20, spawn: [[3, 14], [20, 14]],
    tiles: [
      ROOF, OPEN, OPEN,
      'X.....############.....X',
      OPEN, OPEN,
      'X..###..........###....X',
      OPEN, OPEN,
      'X.....############.....X',
      OPEN, OPEN,
      'X..###..........###....X',
      OPEN, OPEN, ROOF
    ],
    enemies: [['chick', 6, 1], ['chick', 17, 1], ['ghost', 9, 4], ['ghost', 14, 4],
              ['bat', 11, 7], ['frog', 6, 10]]
  }
];

/* Symmetric head-to-head arena used by VERSUS mode. */
var VERSUS_LEVEL = {
  theme: 6, drift: 0.10, spawn: [[3, 14], [20, 14]],
  tiles: [
    ROOF, OPEN, OPEN,
    'X...#####......#####...X',
    OPEN, OPEN,
    'X.......########.......X',
    OPEN, OPEN,
    'X...#####......#####...X',
    OPEN, OPEN,
    'X.......########.......X',
    OPEN, OPEN, ROOF
  ],
  enemies: []
};

/* Spots monsters drop into during a versus match. */
var VERSUS_SPAWN_POINTS = [[6, 1], [17, 1], [11, 4], [5, 7], [18, 7], [11, 10]];
var VERSUS_TYPES = ['chick', 'chick', 'ghost', 'bat', 'frog'];

function tileAt(level, col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return '.';
  return level.tiles[row][col];
}

function isSolid(level, col, row) {
  return tileAt(level, col, row) === 'X';
}

function isPlatform(level, col, row) {
  var t = tileAt(level, col, row);
  return t === '#' || t === 'X';
}
