import { benchStreakWarning, initConsecutiveBench } from "./benchStreak";
import { applyBenchStreakUpdate } from "./keeperRotation";
import { canPlayGoalkeeper, canPlayPosition, positionFit } from "./positions";
import { lineupViolations, subsViolations } from "./subRules";
import {
  addSegmentMinutes,
  applyHalfTimeKeeperSwap,
  applySubs,
  calculatePlayerMinutesFromPlan,
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

  // Manual edits can put anyone from the previous bench into any seat
  // (including GK / out of natural position). Sort preferred fits first.
  const sorted = [...candidates].sort((a, b) => {
    if (!slot) return a.number - b.number;
    const fitA =
      slot.id === "gk" ? (canPlayGoalkeeper(a) ? 2 : 0) : positionFit(a, slot.position);
    const fitB =
      slot.id === "gk" ? (canPlayGoalkeeper(b) ? 2 : 0) : positionFit(b, slot.position);
    if (fitB !== fitA) return fitB - fitA;
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
  if (slot.id === "gk") {
    return canPlayGoalkeeper(player) ? base : `${base} (out of position)`;
  }
  const fit = positionFit(player, slot.position);
  if (fit === 0) return `${base} (out of position)`;
  if (fit === 1) return `${base} (secondary / cover)`;
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
  return `All ${otherIns + 1} bench players listed (any position). Picking someone already coming in elsewhere exchanges those two slots.`;
}

function cloneSegments(segments: SegmentAssignment[]): SegmentAssignment[] {
  return segments.map((s) => ({
    ...s,
    lineup: { ...s.lineup },
    bench: [...s.bench],
    substitutions: s.substitutions.map((sub) => ({ ...sub })),
  }));
}

/** Live minutes preview while editing a rotation (does not lock/save). */
export function previewPlanWithLineup(
  plan: GamePlan,
  segmentIndex: number,
  lineup: Record<string, string | null>
): GamePlan {
  if (segmentIndex < 0 || segmentIndex >= plan.segments.length) return plan;
  const segments = cloneSegments(plan.segments);
  segments[segmentIndex] = {
    ...segments[segmentIndex],
    lineup: { ...lineup },
    bench: getBench(plan.activePlayerIds, lineup),
  };
  const next: GamePlan = { ...plan, segments };
  return {
    ...next,
    playerMinutes: calculatePlayerMinutesFromPlan(next),
  };
}

/** Who can be assigned to a lineup slot — any active player (coach override). */
export function getLineupSlotCandidates(
  plan: GamePlan,
  slotId: string,
  _draftLineup: Record<string, string | null>,
  players: Player[]
): Player[] {
  const slot = FORMATION_231.find((s) => s.id === slotId);
  if (!slot) return [];

  const fitOf = (p: Player) =>
    slot.id === "gk"
      ? canPlayGoalkeeper(p)
        ? 2
        : 0
      : positionFit(p, slot.position);

  return players
    .filter((p) => plan.activePlayerIds.includes(p.id))
    .sort((a, b) => {
      const fitDiff = fitOf(b) - fitOf(a);
      if (fitDiff !== 0) return fitDiff;
      return a.number - b.number;
    });
}

export function lineupSlotCandidateTag(
  player: Player,
  slotId: string,
  draftLineup: Record<string, string | null>,
  draftBench: string[],
  displacedLabel: string | null
): string {
  const onFieldElsewhere = Object.entries(draftLineup).some(
    ([id, pid]) => id !== slotId && pid === player.id
  );
  if (onFieldElsewhere) return " (swap positions — minutes unchanged)";

  const slot = FORMATION_231.find((s) => s.id === slotId);
  const outOfPosition =
    slot &&
    (slot.id === "gk"
      ? !canPlayGoalkeeper(player)
      : positionFit(player, slot.position) === 0);

  if (draftBench.includes(player.id) && displacedLabel) {
    return outOfPosition
      ? ` (from bench, replaces ${displacedLabel}, out of position)`
      : ` (from bench, replaces ${displacedLabel})`;
  }
  if (draftBench.includes(player.id)) {
    return outOfPosition ? " (from bench, out of position)" : " (from bench)";
  }
  if (outOfPosition) return " (out of position)";
  return "";
}

export function setLineupSlotPlayer(
  lineup: Record<string, string | null>,
  slotId: string,
  playerId: string
): Record<string, string | null> {
  const next: Record<string, string | null> = { ...lineup };
  const displaced = next[slotId];

  const otherSlot = Object.entries(next).find(
    ([id, pid]) => id !== slotId && pid === playerId
  )?.[0];

  if (otherSlot) {
    // Already on the field → swap positions (both stay on; minutes unchanged).
    next[otherSlot] = displaced ?? null;
    next[slotId] = playerId;
    return next;
  }

  // Coming from the bench → take this seat; displaced player goes to the bench.
  next[slotId] = playerId;
  for (const [id, pid] of Object.entries(next)) {
    if (id !== slotId && pid === playerId) next[id] = null;
  }
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

  // Keep sub labels on the following rotation in sync with the new previous XI.
  if (segmentIndex + 1 < segments.length) {
    const next = segments[segmentIndex + 1];
    segments[segmentIndex + 1] = {
      ...next,
      substitutions: normalizeSegmentSubs(
        lineup,
        next.lineup,
        plan.activePlayerIds,
        next.substitutions
      ),
    };
  }

  const manualSegments = [
    ...new Set([...(plan.manualSegments ?? []), segmentIndex]),
  ];
  const nextPlan: GamePlan = {
    ...plan,
    segments,
    manualSegments,
  };

  // Kickoff edit: rebuild unlocked later rotations; keep other edited segments.
  if (segmentIndex === 0) {
    const rebuilt = rebuildPlanFromSegment(nextPlan, 1, players, subRules);
    return {
      ...rebuilt,
      playerMinutes: calculatePlayerMinutesFromPlan(rebuilt),
    };
  }

  // Mid-plan edit: do not auto-rewrite later rotations (that often re-inserts the
  // swapped-out player and cancels the minute change). Only recount play time.
  return {
    ...nextPlan,
    playerMinutes: calculatePlayerMinutesFromPlan(nextPlan),
  };
}

export function applyManualSubChange(
  plan: GamePlan,
  segmentIndex: number,
  subIndex: number,
  inPlayerId: string,
  _players: Player[],
  _subRules: SubstitutionRule[]
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

  if (segmentIndex + 1 < segments.length) {
    const next = segments[segmentIndex + 1];
    segments[segmentIndex + 1] = {
      ...next,
      substitutions: normalizeSegmentSubs(
        lineup,
        next.lineup,
        plan.activePlayerIds,
        next.substitutions
      ),
    };
  }

  const manualSegments = [...new Set([...(plan.manualSegments ?? []), segmentIndex])];
  const nextPlan: GamePlan = {
    ...plan,
    segments,
    manualSegments,
  };

  // Keep later edited/auto rotations as-is; only recount minutes from lineups.
  return {
    ...nextPlan,
    playerMinutes: calculatePlayerMinutesFromPlan(nextPlan),
  };
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

/**
 * Refresh targets / auto rotations while locking every manually edited segment.
 * Play times are recalculated from the resulting lineups.
 */
export function rebuildKeepingManualEdits(
  plan: GamePlan,
  players: Player[],
  subRules: SubstitutionRule[],
  updates: {
    playerTargets?: Record<string, number>;
    manualTargetOverrides?: Record<string, number>;
  } = {}
): GamePlan {
  const manualTargetOverrides =
    updates.manualTargetOverrides ?? plan.manualTargetOverrides ?? {};
  const playerTargets = updates.playerTargets ?? plan.playerTargets;

  return rebuildPlanFromSegment(
    {
      ...plan,
      playerTargets,
      manualTargetOverrides:
        Object.keys(manualTargetOverrides).length > 0
          ? manualTargetOverrides
          : undefined,
    },
    0,
    players,
    subRules
  );
}

/**
 * Copy each 1st-half rotation onto the matching 2nd-half slot.
 * Applies the 2nd-half keeper when configured, locks both halves as edited,
 * and recalculates play times.
 */
export function duplicateFirstHalfToSecondHalf(
  plan: GamePlan,
  players: Player[],
  subRules: SubstitutionRule[]
): GamePlan {
  const n = plan.settings.segmentsPerHalf;
  if (n < 1 || plan.segments.length < n * 2) return plan;

  const segments = cloneSegments(plan.segments);
  const active = players.filter((p) => plan.activePlayerIds.includes(p.id));
  const manual = new Set(plan.manualSegments ?? []);

  for (let i = 0; i < n; i++) {
    manual.add(i);
    let lineup = { ...segments[i].lineup };
    if (plan.settings.secondHalfKeeperId) {
      lineup = applyHalfTimeKeeperSwap(
        lineup,
        plan.settings.secondHalfKeeperId,
        active
      ).lineup;
    }
    const secondIdx = i + n;
    segments[secondIdx] = {
      ...segments[secondIdx],
      lineup,
      bench: getBench(plan.activePlayerIds, lineup),
      substitutions: [],
    };
    manual.add(secondIdx);
  }

  return rebuildPlanFromSegment(
    { ...plan, segments, manualSegments: [...manual] },
    n,
    players,
    subRules
  );
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
