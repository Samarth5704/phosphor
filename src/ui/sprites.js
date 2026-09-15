// 1-bit sprite bitmaps as arrays of strings, one character per pixel: '#' is
// lit, anything else is dark. Every bitmap here is original artwork; none
// reproduces a Taito sprite. No asset files (spec 2).
//
// Each alien type's bitmap is exactly as wide and as tall as that type's
// hitbox in TUNING, and tests/sprites.test.js pins the equality, so the
// picture and the collision box cannot drift apart. That drift produces
// phantom hits (a shot visibly missing yet killing, or visibly touching yet
// passing) that get debugged in the wrong file.
//
// Two frames per alien so the rack animates as it marches; the renderer picks
// the frame from the alien's x (the rack moves 2 px per pass, so the frame
// toggles on every move).

function compile(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`sprite row ${y} is ${rows[y].length} wide, expected ${w}`);
    for (let x = 0; x < w; x++) pixels[y * w + x] = rows[y][x] === '#' ? 1 : 0;
  }
  return Object.freeze({ w, h, pixels, rows: Object.freeze(rows) });
}

const frames = (...rowSets) => Object.freeze(rowSets.map(compile));

// ---- aliens, by type (rows 0-1 bottom, 2-3 middle, 4 top) --------------------------

// Top type: 8 wide, the narrow one.
export const ALIEN_TOP = frames(
  [
    '   ##   ',
    '  ####  ',
    ' ###### ',
    '## ## ##',
    '########',
    '  #  #  ',
    ' # ## # ',
    '#      #',
  ],
  [
    '   ##   ',
    '  ####  ',
    ' ###### ',
    '## ## ##',
    '########',
    ' # ## # ',
    '#      #',
    ' #    # ',
  ],
);

// Middle type: 11 wide.
export const ALIEN_MIDDLE = frames(
  [
    '  #     #  ',
    '   #   #   ',
    '  #######  ',
    ' ## ### ## ',
    '###########',
    '# ####### #',
    '# #     # #',
    '   ## ##   ',
  ],
  [
    '  #     #  ',
    '#  #   #  #',
    '# ####### #',
    '### ### ###',
    '###########',
    ' ######### ',
    '  #     #  ',
    ' #       # ',
  ],
);

// Bottom type: 12 wide, the widest, which also sets the cell width.
export const ALIEN_BOTTOM = frames(
  [
    '    ####    ',
    ' ########## ',
    '############',
    '###  ##  ###',
    '############',
    '   ##  ##   ',
    '  ## ## ##  ',
    '##        ##',
  ],
  [
    '    ####    ',
    ' ########## ',
    '############',
    '###  ##  ###',
    '############',
    '  ###  ###  ',
    ' ##  ##  ## ',
    '  ##    ##  ',
  ],
);

// Indexed by rack row, matching alienWidth() in src/core/rack.js.
export function alienSpriteForRow(row) {
  if (row >= 4) return ALIEN_TOP;
  if (row >= 2) return ALIEN_MIDDLE;
  return ALIEN_BOTTOM;
}

// The burst left where an alien died, for the freeze's 16 steps.
export const ALIEN_EXPLOSION = frames(
  [
    '#    #    # ',
    ' #  # #  #  ',
    '  #      #  ',
    '#   #  #   #',
    '  #      #  ',
    ' #   ##   # ',
    '#  #    #  #',
    '  #      #  ',
  ],
  [
    ' #        # ',
    '   #    #   ',
    '#  #    #  #',
    '     ##     ',
    '     ##     ',
    '#  #    #  #',
    '   #    #   ',
    ' #        # ',
  ],
);

// ---- cannon --------------------------------------------------------------------------

export const CANNON = compile([
  '      #      ',
  '     ###     ',
  '     ###     ',
  ' ########### ',
  '#############',
  '#############',
  '#############',
  '#############',
]);

// Two alternating frames while the cannon is dying.
export const CANNON_EXPLOSION = frames(
  [
    '   #    #    ',
    '      #   #  ',
    ' #   # #     ',
    '   ##  #  #  ',
    ' # ### #### #',
    '#### ###### #',
    '## ######## #',
    '#############',
  ],
  [
    '  #   #     #',
    '     #   #   ',
    '  #     #  # ',
    '    ## #    #',
    '  ## ## ###  ',
    ' ### ####### ',
    '# ######### #',
    '#############',
  ],
);

// ---- shots ---------------------------------------------------------------------------

export const PLAYER_SHOT = compile([
  '#',
  '#',
  '#',
  '#',
]);

// Invader missiles, 3x6, two frames each so they writhe as they fall. Keyed
// by the type names in src/core/shots.js.
export const INVADER_SHOTS = Object.freeze({
  rolling: frames(
    ['#  ', ' # ', '  #', ' # ', '#  ', ' # '],
    ['  #', ' # ', '#  ', ' # ', '  #', ' # '],
  ),
  plunger: frames(
    ['###', ' # ', ' # ', ' # ', ' # ', '###'],
    [' # ', '###', ' # ', ' # ', '###', ' # '],
  ),
  squiggly: frames(
    [' # ', '  #', ' # ', '#  ', ' # ', '  #'],
    [' # ', '#  ', ' # ', '  #', ' # ', '#  '],
  ),
});

// ---- UFO -----------------------------------------------------------------------------

export const UFO = compile([
  '      ####      ',
  '    ########    ',
  '   ##########   ',
  '  ###  ##  ###  ',
  '################',
  '   ###    ###   ',
  '    #      #    ',
]);

// ---- digits for the UFO award, 3x5 -----------------------------------------------------

export const DIGITS = Object.freeze([
  ['###', '# #', '# #', '# #', '###'],
  [' # ', '## ', ' # ', ' # ', '###'],
  ['###', '  #', '###', '#  ', '###'],
  ['###', '  #', '###', '  #', '###'],
  ['# #', '# #', '###', '  #', '  #'],
  ['###', '#  ', '###', '  #', '###'],
  ['###', '#  ', '###', '# #', '###'],
  ['###', '  #', '  #', '  #', '  #'],
  ['###', '# #', '###', '# #', '###'],
  ['###', '# #', '###', '  #', '###'],
].map(compile));

export const DIGIT_ADVANCE = 4; // 3 px glyph + 1 px gap

// Every exported sprite, for tests that check them all.
export const ALL_SPRITES = Object.freeze({
  ALIEN_TOP, ALIEN_MIDDLE, ALIEN_BOTTOM, ALIEN_EXPLOSION, CANNON, CANNON_EXPLOSION,
  PLAYER_SHOT, INVADER_SHOTS, UFO, DIGITS,
});
