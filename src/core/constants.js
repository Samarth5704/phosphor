// Spec §4.2 — our tuning. Nothing in this file is claimed as authentic and the
// README must not present any of it as a reproduction. One exported object so a
// reviewer can find every chosen number in one place. Nothing else is exported.
//
// Coordinates: 224×256 logical space, y grows downward, all integers.
// Audio frequencies, envelopes and durations are added here in Phase 4.

export const TUNING = Object.freeze({
  // --- rack geometry ------------------------------------------------------
  RACK_COL_SPACING: 16,
  RACK_ROW_SPACING: 16,
  // Per-type hitbox widths, centred inside the widest cell. Rows 0-1 are the
  // bottom type, 2-3 the middle type, 4 the top type.
  ALIEN_W_BOTTOM: 12,
  ALIEN_W_MIDDLE: 11,
  ALIEN_W_TOP: 8,
  ALIEN_H: 8,
  RACK_START_X: 24, // origin = bottom-left alien's top-left corner
  RACK_MARGIN_LEFT: 8, // rack reverses when its leftmost living alien would cross this
  RACK_MARGIN_RIGHT: 216, // ... or its rightmost living alien would cross this
  ROW_DROP: 8, // pixels dropped on each reversal
  RACK_START_Y: 120, // origin y on wave 1
  RACK_DESCENT_PER_WAVE: 8, // each wave in the 9-wave cycle (RULES.WAVE_HEIGHT_CYCLE) starts this much lower

  // --- cannon -------------------------------------------------------------
  CANNON_Y: 216,
  CANNON_W: 13,
  CANNON_H: 8,
  CANNON_SPEED: 1,
  CANNON_START_X: 8,
  CANNON_MIN_X: 8,
  CANNON_MAX_X: 203, // 224 - 8 - 13
  CANNON_DEATH_STEPS: 60, // everything pauses while the cannon explodes

  // --- shots --------------------------------------------------------------
  PLAYER_SHOT_W: 1,
  PLAYER_SHOT_H: 4,
  PLAYER_SHOT_SPEED: 4, // px per step, upward; swept 1px at a time
  INVADER_SHOT_W: 3,
  INVADER_SHOT_H: 6,
  INVADER_SHOT_SPEED: 2, // px per step, downward; swept 1px at a time
  INVADER_RELOAD_STEPS: 48, // minimum steps between invader shots
  INVADER_RELOAD_JITTER: 32, // + rng in [0, jitter]
  GROUND_Y: 240, // invader shots vanish when their bottom edge reaches this
  // When the player's shot meets an invader missile the player's shot always
  // dies; the missile survives with this percentage chance, drawn from the
  // seeded rng. The sources describe this only qualitatively (squiggly almost
  // always survives, the others usually do not); the numbers are ours.
  MISSILE_SURVIVAL_PERCENT: Object.freeze({ rolling: 20, plunger: 20, squiggly: 95 }),

  // --- UFO ----------------------------------------------------------------
  UFO_Y: 40,
  UFO_W: 16,
  UFO_H: 7,
  UFO_SPEED: 1,
  // Minimum steps between appearances. The UFO award is indexed by the fired
  // shot count, and index 7 (300 points) first comes up on the 8th shot; the
  // documented "23rd shot" framing holds only because no UFO is on screen that
  // early in a wave. Lowering this interval makes the 8th-shot award
  // reachable and changes documented behaviour.
  UFO_INTERVAL_STEPS: 1500,
  UFO_INTERVAL_JITTER: 300, // + rng in [0, jitter]
  UFO_MIN_ALIENS: 8, // no UFO while fewer aliens remain
  UFO_SCORE_DISPLAY_STEPS: 60,

  // --- shields ------------------------------------------------------------
  // SHIELD_Y is coupled to the wave-height cycle: the wave-9 rack starts at
  // RACK_START_Y + 8 * RACK_DESCENT_PER_WAVE = 184, so its bottom row's lower
  // edge (184 + ALIEN_H) is exactly 192, touching the shield top without
  // overlapping it. Raising RACK_START_Y or RACK_DESCENT_PER_WAVE, or lowering
  // SHIELD_Y, makes a fresh wave-9 rack erase shield cells on its first pass.
  // tests/rack.test.js pins the inequality; spec §4.2 records it.
  SHIELD_Y: 192,
  SHIELD_XS: Object.freeze([32, 77, 122, 167]),
  SHIELD_BITMAP: Object.freeze([
    '    ##############    ',
    '   ################   ',
    '  ##################  ',
    ' #################### ',
    '######################',
    '######################',
    '######################',
    '######################',
    '######################',
    '######################',
    '######################',
    '######################',
    '########      ########',
    '#######        #######',
    '######          ######',
    '######          ######',
  ]),
  // Erosion masks: '#' cells are cleared, positioned so (anchorX, anchorY) in
  // the mask lands on the impact pixel. The anchor cell must itself be '#'
  // or the impact pixel survives and the next shot hits it again. The player
  // mask bites upward from the impact, the invader mask bites downward.
  PLAYER_SHOT_EROSION: Object.freeze({
    rows: Object.freeze([
      ' # # ',
      '#####',
      ' ### ',
    ]),
    anchorX: 2,
    anchorY: 2,
  }),
  INVADER_SHOT_EROSION: Object.freeze({
    rows: Object.freeze([
      ' ### ',
      '#####',
      ' # # ',
    ]),
    anchorX: 2,
    anchorY: 0,
  }),

  // --- waves --------------------------------------------------------------
  WAVE_CLEAR_DELAY_STEPS: 60,

  // --- phosphor decay: aliens alive -> per-step intensity multiplier -------
  // Linear between the two endpoints; Phase 3b consumes it.
  DECAY_AT_55: 0.96,
  DECAY_AT_1: 0.55,
  DECAY_REDUCED_MOTION: 0.55,
});
