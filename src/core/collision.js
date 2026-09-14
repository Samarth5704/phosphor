// Axis-aligned overlap. Never containment: a 1px overlap at any edge is a hit,
// and boxes that merely share an edge are not overlapping. Spec §5.3.

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
