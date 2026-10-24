// Small pure calculations the page shows as text. Kept apart from app.js so
// the tests can import them.

/** Points each signal adds to the index: score × effective weight. */
export function contributions(index) {
  return (index?.signals ?? [])
    .filter((s) => s.score != null && s.effectiveWeight)
    .map((s) => ({ id: s.id, name: s.name, points: (s.score * s.effectiveWeight) / 100 }))
    .sort((a, b) => b.points - a.points);
}

/** "Deaths in organised violence (15.5 of 37.6 points)", or null. */
export function biggestContribution(index) {
  const top = contributions(index)[0];
  if (!top || index?.value == null) return null;
  const one = (n) => (Math.round(n * 10) / 10).toFixed(1);
  return `${top.name} (${one(top.points)} of ${one(index.value)} points)`;
}
