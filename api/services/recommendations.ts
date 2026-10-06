// A transparent baseline: rank a bounded page, retain every candidate and diversify authors.
// It is not a trained model, and never changes the authorization-filtered candidate set.
export function rankPosts<
  T extends { id: number; userId: number; createdAt: Date },
>(
  rows: T[],
  following: Set<number>,
  affinity: Map<number, number>,
  now = Date.now()
): T[] {
  const remaining = [...rows],
    ranked: T[] = [],
    used = new Map<number, number>();
  const score = (p: T) => {
    const age = Math.max(0, (now - p.createdAt.getTime()) / 3600000);
    return (
      2 ** (-age / 72) +
      (following.has(p.userId) ? 0.3 : 0) +
      Math.min(affinity.get(p.userId) || 0, 3) * 0.1 -
      (used.get(p.userId) || 0) * 0.25
    );
  };
  while (remaining.length) {
    remaining.sort((a, b) => score(b) - score(a) || b.id - a.id);
    const row = remaining.shift()!;
    ranked.push(row);
    used.set(row.userId, (used.get(row.userId) || 0) + 1);
  }
  return ranked;
}
