// Spec §4.1 — authentic, cited, non-negotiable. These are documented
// properties of the 1978 machine (computerarcheology.com/Arcade/SpaceInvaders/,
// shmups.wiki/library/Space_Invaders). Changing one means changing the spec.
//
// Everything we chose ourselves lives in constants.js as TUNING.

export const RULES = Object.freeze({
  FIELD_W: 224,
  FIELD_H: 256,

  RACK_COLS: 11,
  RACK_ROWS: 5,
  RACK_STEP_X: 2, // reference alien moves 2px per rack cycle

  PLAYER_SHOTS_MAX: 1,
  INVADER_SHOT_SLOTS: 3, // cannon + player shot + 3 invader shots = five moving objects; a UFO takes one

  // 1-indexed columns, cycled. A dead column is skipped and the next entry used.
  PLUNGER_COLUMNS: Object.freeze([1, 7, 1, 1, 1, 4, 11, 1, 6, 3, 1, 1, 11, 9, 2, 8]),
  SQUIGGLY_COLUMNS: Object.freeze([11, 1, 6, 3, 1, 1, 11, 9, 2, 8, 2, 11, 4, 7, 10]),

  EXPLOSION_FREEZE_STEPS: 16,

  ROW_SCORES: Object.freeze([10, 10, 20, 20, 30]), // row 0 is the bottom row
  EXTRA_CANNON_SCORE: 1500, // awarded once

  // Indexed by the player's fired-shot count: award = cycle[(shotsFired - 1) % 15].
  UFO_AWARD_CYCLE: Object.freeze([50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100, 100]),

  SHIELD_COUNT: 4,
});
