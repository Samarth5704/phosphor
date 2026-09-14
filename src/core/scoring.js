import { RULES } from './rules.js';

// Adds points and awards the single extra cannon the first time the score
// reaches EXTRA_CANNON_SCORE. Crossing it in one jump still awards it.
export function addScore(state, points) {
  state.score += points;
  if (!state.extraCannonAwarded && state.score >= RULES.EXTRA_CANNON_SCORE) {
    state.extraCannonAwarded = true;
    state.lives += 1;
  }
}

export function rowScore(row) {
  return RULES.ROW_SCORES[row];
}
