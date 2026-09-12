import type { GamePlan } from "../types";

/** Update streak counters after a segment completes. */
export function updateConsecutiveBench(
  consecutiveBench: Record<string, number>,
  playerIds: string[],
  bench: string[]
): Record<string, number> {
  const benchSet = new Set(bench);
  const next = { ...consecutiveBench };
  for (const id of playerIds) {
    next[id] = benchSet.has(id) ? (next[id] ?? 0) + 1 : 0;
  }
  return next;
}

export function initConsecutiveBench(playerIds: string[]): Record<string, number> {
  return Object.fromEntries(playerIds.map((id) => [id, 0]));
}

/** Players who must come in this rotation (already sat max consecutive segments). */
export function playersMustComeIn(
  bench: string[],
  consecutiveBench: Record<string, number>,
  maxConsecutive: number
): string[] {
  return bench
    .filter((id) => (consecutiveBench[id] ?? 0) >= maxConsecutive)
    .sort((a, b) => (consecutiveBench[b] ?? 0) - (consecutiveBench[a] ?? 0));
}

export function findBenchStreakViolations(
  plan: GamePlan,
  maxConsecutive: number
): { playerId: string; streak: number; afterSegment: number }[] {
  const violations: { playerId: string; streak: number; afterSegment: number }[] = [];
  let consecutiveBench = initConsecutiveBench(plan.activePlayerIds);

  for (const segment of plan.segments) {
    for (const id of plan.activePlayerIds) {
      if ((consecutiveBench[id] ?? 0) > maxConsecutive) {
        violations.push({
          playerId: id,
          streak: consecutiveBench[id],
          afterSegment: segment.segmentIndex,
        });
      }
    }
    consecutiveBench = updateConsecutiveBench(
      consecutiveBench,
      plan.activePlayerIds,
      segment.bench
    );
  }

  return violations;
}

export function benchStreakWarning(
  plan: GamePlan,
  maxConsecutive: number,
  playerName: (id: string) => string
): string | null {
  const violations = findBenchStreakViolations(plan, maxConsecutive);
  if (violations.length === 0) return null;
  const v = violations[0];
  return `${playerName(v.playerId)} sat out ${v.streak} rotations in a row (max ${maxConsecutive}).`;
}
