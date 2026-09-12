import { benchStreakWarning, initConsecutiveBench } from "./benchStreak";
import { applyBenchStreakUpdate } from "./keeperRotation";
import { canPlayGoalkeeper, canPlayPosition, positionFit } from "./positions";
import { lineupViolations, subsViolations } from "./subRules";
import {
  addSegmentMinutes,
  applyHalfTimeKeeperSwap,
  applySubs,
  getBench,
  pickSubsForRotation,
} from "./substitutionEngine";
import { normalizeSegmentSubs } from "./subDisplay";
import {
  FORMATION_231,
  type GamePlan,
  type Player,
  type SegmentAssignment,
  type Substitution,
  type SubstitutionRule,
} from "../types";

/** Other sub index that already brings this player IN this rotation, if any. */
export function findOtherSubUsingInPlayer(
  segment: SegmentAssignment,
  subIndex: number,
  inPlayerId: string
): number {
  return segment.substitutions.findIndex(
    (s, i) => i !== subIndex && s.inPlayerId === inPlayerId
  );
}

/** Who can be picked to come IN for this sub edit (full previous bench). */
export function getSubInCandidates(
  plan: GamePlan,
  segmentIndex: number,
  subIndex: number,
  players: Player[]
): Player[] {
  if (segmentIndex === 0) return [];
  const segment = plan.segments[segmentIndex];
  const sub = segment.substitutions[subIndex];
  if (!sub) return [];

  const prevLineup = plan.segments[segmentIndex - 1].lineup;
  const bench = getBench(plan.activePlayerIds, prevLineup);
  const slot = FORMATION_231.find((s) => s.id === sub.slotId);
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // All previous-bench players are eligible. Picking someone already assigned
  // as IN on another sub in this rotation exchanges those two IN slots.
  const candidates = bench
    .filter((id) => id !== sub.outPlayerId)
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => !!p);

  if (slot?.id === "gk") {
    return candidates
      .filter((p) => canPlayGoalkeeper(p) || p.id === sub.inPlayerId)
      .sort((a, b) => a.number - b.number);
  }

  const sorted = [...candidates].sort((a, b) => {
    if (!slot) return a.number - b.number;
    const fitDiff = positionFit(b, slot.position) - positionFit(a, slot.position);
    if (fitDiff !== 0) return fitDiff;
    return a.number - b.number;
  });

  const current = playerMap.get(sub.inPlayerId);
  if (current && !sorted.some((p) => p.id === current.id)) {
    sorted.unshift(current);
  }

  return sorted;
}

export function subInCandidateLabel(
  player: Player,
  slotId: string,
  exchangeSlotLabel?: string | null
): string {
  const slot = FORMATION_231.find((s) => s.id === slotId);
  const base = `#${player.number} ${player.name}`;
  if (exchangeSlotLabel) return `${base} (exchange with ${exchangeSlotLabel})`;
  if (!slot) return base;
  const fit = positionFit(player, slot.position);
  if (fit === 0) return `${base} (out of position)`;
  if (fit === 1) return `${base} (secondary ${slot.label})`;
  return base;
}

export function getSubInCandidateHint(
  plan: GamePlan,
  segmentIndex: number,
  subIndex: number
): string | null {
  if (segmentIndex === 0) return null;
  const segment = plan.segments[segmentIndex];
  const otherIns = segment.substitutions.filter((_, i) => i !== subIndex).length;
  if (otherIns === 0) return null;
  return `All ${otherIns + 1} bench players listed. Picking someone already coming in elsewhere exchanges those two slots.`;
}

function cloneSegments(segments: SegmentAssignment[]): SegmentAssignment[] {
  return segments.map((s) => ({
    ...s,
    lineup: { ...s.lineup },
    bench: [...s.bench],
    substitutions: s.substitutions.map((sub) => ({ ...sub })),
  }));
}

/** Who can be assigned to a starting lineup slot. */
export function getLineupSlotCandidates(
  plan: GamePlan,
  slotId: string,
  draftLineup: Record<string, string | null>,
  players: Player[]
): Player[] {
  const slot = FORMATION_231.find((s) => s.id === slotId);
  if (!slot) return [];

  const currentId = draftLineup[slotId];
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const eligible = players.filter((p) => {
    if (!plan.activePlayerIds.includes(p.id)) return false;
    if (slotId === "gk") return canPlayGoalkeeper(p);
    return canPlayPosition(p, slot.position);
  });

  const ids = new Set<string>();
  const result: Player[] = [];

  const add = (p: Player | undefined) => {
    if (!p || ids.has(p.id)) return;
    ids.add(p.id);
    result.push(p);
  };

  if (currentId) add(playerMap.get(currentId));

  for (const p of eligible) {
    const inOtherSlot = Object.entries(draftLineup).some(
      ([id, pid]) => id !== slotId && pid === p.id
    );
    if (!inOtherSlot) add(p);
    else add(p);
  }

  return result.sort((a, b) => a.number - b.number);
}

export function setLineupSlotPlayer(
  lineup: Record<string, string | null>,
  slotId: string,
  playerId: string
): Record<string, string | null> {
  const next = { ...lineup };
  const displaced = next[slotId];

  const otherSlot = Object.entries(next).find(
    ([id, pid]) => id !== slotId && pid === playerId
  )?.[0];

  if (otherSlot) {
    next[otherSlot] = displaced;
  }

  next[slotId] = playerId;
  return next;
}

export function validateStartingLineup(
  lineup: Record<string, string | null>,
  activePlayerIds: string[],
  _players: Player[]
): string[] {
  const warnings: string[] = [];
  const onField = Object.values(lineup).filter(Boolean) as string[];

  if (onField.length !== FORMATION_231.length) {
    warnings.push(`Need ${FORMATION_231.length} players on field (${onField.length} set).`);
  }
  if (new Set(onField).size !== onField.length) {
    warnings.push("Duplicate players on field.");
  }

  for (const slot of FORMATION_231) {
    if (!lineup[slot.id]) {
      warnings.push(`${slot.label} is empty.`);
    }
  }

  const bench = activePlayerIds.filter((id) => !onField.includes(id));
  if (bench.length !== activePlayerIds.length - FORMATION_231.length) {
    warnings.push("Lineup must include exactly 7 available players.");
  }

  return warnings;
}

export function checkLineupWarnings(
  lineup: Record<string, string | null>,
  activePlayerIds: string[],
  players: Player[],
  subRules: SubstitutionRule[]
): string[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const positionWarnings: string[] = [];

  for (const slot of FORMATION_231) {
    const playerId = lineup[slot.id];
    if (!playerId) continue;
    const player = playerMap.get(playerId);
    if (!player) continue;
    if (slot.id === "gk" && !canPlayGoalkeeper(player)) {
      positionWarnings.push(`#${player.number} is out of position at GK.`);
    } else if (slot.id !== "gk" && !canPlayPosition(player, slot.position)) {
      positionWarnings.push(`#${player.number} is out of position at ${slot.label}.`);
    }
  }

  const ruleWarnings = lineupViolations(lineup, subRules).map(
    (rule) => rule.label ?? "Breaks a field rule."
  );

  return [
    ...validateStartingLineup(lineup, activePlayerIds, players),
    ...positionWarnings,
    ...ruleWarnings,
  ];
}

export function canSaveStartingLineup(
  lineup: Record<string, string | null>,
  activePlayerIds: string[],
  players: Player[]
): boolean {
  return validateStartingLineup(lineup, activePlayerIds, players).length === 0;
}

export function applyStartingLineupChange(
  plan: GamePlan,
  lineup: Record<string, string | null>,
  players: Player[],
  subRules: SubstitutionRule[]
): GamePlan {
  return applySegmentLineupChange(plan, 0, lineup, players, subRules);
}

/** Set the on-field XI for any rotation; later rotations rebuild automatically. */
export function applySegmentLineupChange(
  plan: GamePlan,
  segmentIndex: number,
  lineup: Record<string, string | null>,
  players: Player[],
  subRules: SubstitutionRule[]
): GamePlan {
  if (segmentIndex < 0 || segmentIndex >= plan.segments.length) return plan;

  const segments = cloneSegments(plan.segments);
  const segmentBench = getBench(plan.activePlayerIds, lineup);
  const prevLineup =
    segmentIndex === 0 ? lineup : segments[segmentIndex - 1].lineup;
  const substitutions =
    segmentIndex === 0
      ? []
      : normalizeSegmentSubs(prevLineup, lineup, plan.activePlayerIds, []);

  segments[segmentIndex] = {
    ...segments[segmentIndex],
    lineup: { ...lineup },
    bench: segmentBench,
    substitutions,
  };

  // Editing kickoff clears later manual locks; mid-game edits keep prior locks.
  const manualSegments =
    segmentIndex === 0
      ? [0]
      : [...new Set([...(plan.manualSegments ?? []), segmentIndex])];

  return rebuildPlanFromSegment(
    { ...plan, segments, manualSegments },
    segmentIndex === 0 ? 1 : segmentIndex,
    players,
    subRules
  );
}

export function applyManualSubChange(
  plan: GamePlan,
  segmentIndex: number,
  subIndex: number,
  inPlayerId: string,
  players: Player[],
  subRules: SubstitutionRule[]
): GamePlan {
  const segments = cloneSegments(plan.segments);
  const segment = segments[segmentIndex];
  const sub = segment.substitutions[subIndex];
  if (!sub || segmentIndex === 0 || !inPlayerId) return plan;

  const prevLineup = segments[segmentIndex - 1].lineup;
  const previousIn = sub.inPlayerId;

  // If this player is already coming IN on another sub, exchange IN assignments
  // so we don't put the same player on the field twice.
  const otherIdx = findOtherSubUsingInPlayer(segment, subIndex, inPlayerId);
  if (otherIdx >= 0) {
    segment.substitutions[otherIdx] = {
      ...segment.substitutions[otherIdx],
      inPlayerId: previousIn,
    };
  }

  sub.inPlayerId = inPlayerId;
  sub.outPlayerId = prevLineup[sub.slotId] ?? sub.outPlayerId;

  const lineup = applySubs(prevLineup, segment.substitutions);
  segment.lineup = lineup;
  segment.bench = getBench(plan.activePlayerIds, lineup);

  const manualSegments = new Set(plan.manualSegments ?? []);
  manualSegments.add(segmentIndex);

  return rebuildPlanFromSegment(
    { ...plan, segments, manualSegments: [...manualSegments] },
    segmentIndex,
    players,
    subRules
  );
}

export function rebuildPlanFromSegment(
  plan: GamePlan,
  fromSegmentIndex: number,
  players: Player[],
  subRules: SubstitutionRule[]
): GamePlan {
  const segments = cloneSegments(plan.segments);
  const { settings, activePlayerIds, playerTargets } = plan;
  const manualSegments = new Set(plan.manualSegments ?? []);
  const totalMinutes = settings.halfMinutes * 2;
  const segmentDuration = totalMinutes / segments.length;
  const active = players.filter((p) => activePlayerIds.includes(p.id));
  const maxBench = settings.maxConsecutiveBenchRotations ?? 1;

  let minutesPlayed: Record<string, number> = {};
  let consecutiveBench = initConsecutiveBench(activePlayerIds);

  for (let i = 0; i < fromSegmentIndex; i++) {
    minutesPlayed = addSegmentMinutes(minutesPlayed, segments[i].lineup, segmentDuration);
    consecutiveBench = applyBenchStreakUpdate(
      consecutiveBench,
      activePlayerIds,
      segments[i].bench,
      i,
      settings.segmentsPerHalf,
      settings
    );
  }

  for (let i = fromSegmentIndex; i < segments.length; i++) {
    const prevLineup = i === 0 ? { ...segments[0].lineup } : { ...segments[i - 1].lineup };
    let subs: Substitution[] = [];
    let workingLineup = { ...prevLineup };

    if (manualSegments.has(i)) {
      // Trust the stored XI (set by lineup editor or sub swap); refresh display subs.
      const lineup = { ...segments[i].lineup };
      const segmentBench = getBench(activePlayerIds, lineup);
      const storedSubs =
        i > 0
          ? normalizeSegmentSubs(
              prevLineup,
              lineup,
              activePlayerIds,
              segments[i].substitutions
            )
          : [];

      segments[i] = {
        ...segments[i],
        substitutions: storedSubs,
        lineup,
        bench: segmentBench,
      };

      minutesPlayed = addSegmentMinutes(minutesPlayed, lineup, segmentDuration);
      consecutiveBench = applyBenchStreakUpdate(
        consecutiveBench,
        activePlayerIds,
        segmentBench,
        i,
        settings.segmentsPerHalf,
        settings
      );
      continue;
    }

    if (i === settings.segmentsPerHalf && settings.secondHalfKeeperId) {
      const keeperSwap = applyHalfTimeKeeperSwap(
        workingLineup,
        settings.secondHalfKeeperId,
        active
      );
      workingLineup = keeperSwap.lineup;
      if (keeperSwap.substitution) {
        subs.push(keeperSwap.substitution);
      }
    }

    if (i > 0) {
      subs.push(
        ...pickSubsForRotation(
          workingLineup,
          getBench(activePlayerIds, workingLineup),
          active,
          settings.subsPerRotation,
          minutesPlayed,
          playerTargets,
          subRules,
          consecutiveBench,
          maxBench,
          i,
          settings.segmentsPerHalf,
          settings,
          segments.length,
          segmentDuration
        )
      );
    }

    const lineup = subs.length > 0 ? applySubs(prevLineup, subs) : workingLineup;
    const segmentBench = getBench(activePlayerIds, lineup);
    const storedSubs =
      i > 0 ? normalizeSegmentSubs(prevLineup, lineup, activePlayerIds, subs) : [];

    segments[i] = {
      ...segments[i],
      substitutions: storedSubs,
      lineup,
      bench: segmentBench,
    };

    minutesPlayed = addSegmentMinutes(minutesPlayed, lineup, segmentDuration);
    consecutiveBench = applyBenchStreakUpdate(
      consecutiveBench,
      activePlayerIds,
      segmentBench,
      i,
      settings.segmentsPerHalf,
      settings
    );
  }

  return {
    ...plan,
    segments,
    playerMinutes: minutesPlayed,
    manualSegments: [...manualSegments],
  };
}

export function checkSubWarnings(
  plan: GamePlan,
  segmentIndex: number,
  subRules: SubstitutionRule[],
  playerName?: (id: string) => string
): string[] {
  const segment = plan.segments[segmentIndex];
  const warnings: string[] = [];

  if (subsViolations(segment.substitutions, subRules).length > 0) {
    warnings.push("Breaks a substitution rule for this rotation.");
  }
  if (lineupViolations(segment.lineup, subRules).length > 0) {
    warnings.push("Resulting lineup breaks a field rule.");
  }

  const maxBench = plan.settings.maxConsecutiveBenchRotations ?? 1;
  if (playerName) {
    const streakWarn = benchStreakWarning(plan, maxBench, playerName);
    if (streakWarn) warnings.push(streakWarn);
  }

  return warnings;
}

export function slotLabel(slotId: string): string {
  return FORMATION_231.find((s) => s.id === slotId)?.label ?? slotId;
}
