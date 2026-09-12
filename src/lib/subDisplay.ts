import { FORMATION_231, type SegmentAssignment, type Substitution } from "../types";

/** Store only real bench swaps — drops same-rotation out-and-back-in shuffles. */
export function normalizeSegmentSubs(
  prevLineup: Record<string, string | null>,
  targetLineup: Record<string, string | null>,
  activePlayerIds: string[],
  rawSubs: Substitution[] = []
): Substitution[] {
  const onField = new Set(Object.values(targetLineup).filter(Boolean));
  const targetBench = new Set(activePlayerIds.filter((id) => !onField.has(id)));
  const normalized: Substitution[] = [];

  for (const slot of FORMATION_231) {
    const prevId = prevLineup[slot.id];
    const targetId = targetLineup[slot.id];
    if (!prevId || !targetId || prevId === targetId) continue;
    if (!targetBench.has(prevId)) continue;

    normalized.push({
      outPlayerId: prevId,
      inPlayerId: targetId,
      slotId: slot.id,
      position: slot.position,
    });
  }

  const keeperSwap = rawSubs.find((s) => s.slotId === "gk");
  if (
    keeperSwap &&
    targetLineup.gk === keeperSwap.inPlayerId &&
    !normalized.some((s) => s.slotId === "gk")
  ) {
    normalized.unshift(keeperSwap);
  }

  return normalized;
}

/** Subs where the outgoing player actually ends on the bench this segment. */
export function getBenchSubstitutions(segment: SegmentAssignment): Substitution[] {
  const bench = new Set(segment.bench);
  return segment.substitutions.filter((sub) => bench.has(sub.outPlayerId));
}

export interface FieldShuffle {
  playerId: string;
  fromSlotId: string;
  toSlotId: string;
}

/** Players who stayed on the field but changed positions (not via bench). */
export function getFieldShuffles(
  prevLineup: Record<string, string | null>,
  lineup: Record<string, string | null>
): FieldShuffle[] {
  const shuffles: FieldShuffle[] = [];

  for (const [toSlotId, playerId] of Object.entries(lineup)) {
    if (!playerId || toSlotId === "gk") continue;
    const fromSlotId = Object.entries(prevLineup).find(
      ([, id]) => id === playerId
    )?.[0];
    if (fromSlotId && fromSlotId !== toSlotId && fromSlotId !== "gk") {
      shuffles.push({ playerId, fromSlotId, toSlotId });
    }
  }

  return shuffles;
}

export function benchSubIndex(
  segment: SegmentAssignment,
  sub: Substitution
): number {
  const byRef = segment.substitutions.indexOf(sub);
  if (byRef >= 0) return byRef;
  return segment.substitutions.findIndex(
    (s) =>
      s.slotId === sub.slotId &&
      s.outPlayerId === sub.outPlayerId &&
      s.inPlayerId === sub.inPlayerId
  );
}
