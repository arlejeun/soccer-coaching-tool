import type { GameSettings } from "../types";

/** Keeper assigned to this half — should stay in goal, not be forced onto the field. */
export function isDesignatedKeeperThisHalf(
  playerId: string,
  segmentIndex: number,
  segmentsPerHalf: number,
  settings: GameSettings
): boolean {
  const firstHalf = segmentIndex < segmentsPerHalf;
  if (firstHalf) {
    return !!settings.firstHalfKeeperId && playerId === settings.firstHalfKeeperId;
  }
  const second = settings.secondHalfKeeperId ?? settings.firstHalfKeeperId;
  return !!second && playerId === second;
}

export function filterBenchStreakCandidates(
  bench: string[],
  consecutiveBench: Record<string, number>,
  maxConsecutive: number,
  segmentIndex: number,
  segmentsPerHalf: number,
  settings: GameSettings
): string[] {
  return bench.filter((id) => {
    if (isDesignatedKeeperThisHalf(id, segmentIndex, segmentsPerHalf, settings)) {
      return false;
    }
    return (consecutiveBench[id] ?? 0) >= maxConsecutive;
  });
}

export function applyBenchStreakUpdate(
  consecutiveBench: Record<string, number>,
  playerIds: string[],
  bench: string[],
  segmentIndex: number,
  segmentsPerHalf: number,
  settings: GameSettings
): Record<string, number> {
  const benchSet = new Set(bench);
  const next = { ...consecutiveBench };
  for (const id of playerIds) {
    if (isDesignatedKeeperThisHalf(id, segmentIndex, segmentsPerHalf, settings)) {
      next[id] = 0;
    } else if (benchSet.has(id)) {
      next[id] = (next[id] ?? 0) + 1;
    } else {
      next[id] = 0;
    }
  }
  return next;
}
