import { computePlayerTargets, resolvePlayerTargets } from "./coachingScore";
import { getAvailablePlayers } from "./availability";
import {
  applyBenchStreakUpdate,
  filterBenchStreakCandidates,
} from "./keeperRotation";
import { initConsecutiveBench } from "./benchStreak";
import { normalizeSegmentSubs } from "./subDisplay";
import { canPlayGoalkeeper, canPlayPosition, positionFit } from "./positions";
import { lineupViolations, subsViolations } from "./subRules";
import {
  FORMATION_231,
  type FormationSlot,
  type GamePlan,
  type GameSettings,
  type Player,
  type PlayerCoachingInput,
  type PlayerAvailability,
  type Position,
  type SegmentAssignment,
  type Substitution,
  type SubstitutionRule,
} from "../types";

function positionScore(player: Player, position: Position): number {
  return positionFit(player, position);
}

function playingRatio(
  playerId: string,
  minutesPlayed: Record<string, number>,
  playerTargets: Record<string, number>,
  extraPlayed = 0
): number {
  const target = playerTargets[playerId] ?? 1;
  const played = (minutesPlayed[playerId] ?? 0) + extraPlayed;
  return played / target;
}

/** Minutes this player is still guaranteed in goal (don't also load them on the field). */
function upcomingKeeperMinutes(
  playerId: string,
  segmentIndex: number,
  settings: GameSettings,
  segmentsPerHalf: number,
  segmentDuration: number
): number {
  const secondHalfStart = segmentsPerHalf;
  if (settings.secondHalfKeeperId === playerId && segmentIndex < secondHalfStart) {
    return segmentsPerHalf * segmentDuration;
  }
  if (settings.firstHalfKeeperId === playerId && segmentIndex < secondHalfStart) {
    return (segmentsPerHalf - segmentIndex) * segmentDuration;
  }
  if (
    (settings.secondHalfKeeperId ?? settings.firstHalfKeeperId) === playerId &&
    segmentIndex >= secondHalfStart
  ) {
    return (segmentsPerHalf * 2 - segmentIndex) * segmentDuration;
  }
  return 0;
}

function expectedMinutesAtSegment(
  playerId: string,
  segmentIndex: number,
  totalSegments: number,
  playerTargets: Record<string, number>
): number {
  const target = playerTargets[playerId] ?? 0;
  return target * (segmentIndex / totalSegments);
}

/** Player has already exceeded a fair share of minutes for this point in the match. */
function isAheadOfSchedule(
  playerId: string,
  minutesPlayed: Record<string, number>,
  segmentIndex: number,
  totalSegments: number,
  playerTargets: Record<string, number>,
  segmentDuration: number,
  extraPlayed = 0
): boolean {
  const played = (minutesPlayed[playerId] ?? 0) + extraPlayed;
  const expected = expectedMinutesAtSegment(
    playerId,
    segmentIndex,
    totalSegments,
    playerTargets
  );
  return played > expected + segmentDuration * 0.4;
}

function ratedMinutesMap(
  players: Player[],
  minutesPlayed: Record<string, number>,
  segmentIndex: number,
  settings: GameSettings,
  segmentDuration: number
): Record<string, number> {
  const next = { ...minutesPlayed };
  for (const p of players) {
    next[p.id] =
      (next[p.id] ?? 0) +
      upcomingKeeperMinutes(
        p.id,
        segmentIndex,
        settings,
        settings.segmentsPerHalf,
        segmentDuration
      );
  }
  return next;
}

function strikerBenchCandidates(
  benchPool: string[],
  players: Player[]
): string[] {
  return benchPool.filter((id) => {
    const p = players.find((x) => x.id === id);
    return p && canPlayPosition(p, "ST");
  });
}

function pickBestForSlot(
  slot: FormationSlot,
  candidates: Player[],
  used: Set<string>,
  playerTargets: Record<string, number>
): Player | null {
  const available = candidates.filter((p) => !used.has(p.id));
  if (available.length === 0) return null;

  const sorted = [...available].sort((a, b) => {
    const scoreDiff = positionScore(b, slot.position) - positionScore(a, slot.position);
    if (scoreDiff !== 0) return scoreDiff;
    const targetDiff = (playerTargets[b.id] ?? 0) - (playerTargets[a.id] ?? 0);
    if (targetDiff !== 0) return targetDiff;
    return a.name.localeCompare(b.name);
  });

  return sorted[0];
}

function buildInitialLineup(
  players: Player[],
  playerTargets: Record<string, number>,
  settings: GameSettings
): Record<string, string | null> {
  const lineup: Record<string, string | null> = {};
  const used = new Set<string>();

  const designatedGk = settings.firstHalfKeeperId
    ? players.find((p) => p.id === settings.firstHalfKeeperId && canPlayGoalkeeper(p))
    : null;

  if (designatedGk) {
    lineup.gk = designatedGk.id;
    used.add(designatedGk.id);
  } else {
    const gkPool = (
      settings.secondHalfKeeperId
        ? players.filter((p) => p.id !== settings.secondHalfKeeperId)
        : players
    ).filter(canPlayGoalkeeper);
    const gkPick = pickBestForSlot(
      FORMATION_231[0],
      gkPool.length > 0 ? gkPool : players.filter(canPlayGoalkeeper),
      used,
      playerTargets
    );
    lineup.gk = gkPick?.id ?? null;
    if (gkPick) used.add(gkPick.id);
  }

  const fieldPool = players;

  for (const slot of FORMATION_231.slice(1)) {
    const pool =
      slot.id === "st"
        ? fieldPool.filter((p) => canPlayPosition(p, "ST"))
        : fieldPool;
    const pick = pickBestForSlot(
      slot,
      pool.length > 0 ? pool : fieldPool,
      used,
      playerTargets
    );
    lineup[slot.id] = pick?.id ?? null;
    if (pick) used.add(pick.id);
  }

  return lineup;
}

function applyHalfTimeKeeperSwap(
  lineup: Record<string, string | null>,
  secondHalfKeeperId: string | undefined,
  players: Player[]
): { lineup: Record<string, string | null>; substitution: Substitution | null } {
  if (!secondHalfKeeperId) {
    return { lineup, substitution: null };
  }

  const incoming = players.find((p) => p.id === secondHalfKeeperId);
  if (!incoming || !canPlayGoalkeeper(incoming)) {
    return { lineup, substitution: null };
  }

  const currentGk = lineup.gk;
  if (!currentGk || currentGk === secondHalfKeeperId) {
    return { lineup: { ...lineup, gk: secondHalfKeeperId }, substitution: null };
  }

  const newLineup: Record<string, string | null> = { ...lineup, gk: secondHalfKeeperId };

  let incomingFieldSlot: string | null = null;
  for (const [slotId, playerId] of Object.entries(newLineup)) {
    if (slotId !== "gk" && playerId === secondHalfKeeperId) {
      incomingFieldSlot = slotId;
      break;
    }
  }

  if (incomingFieldSlot) {
    newLineup[incomingFieldSlot] = currentGk;
  }

  return {
    lineup: newLineup,
    substitution: {
      outPlayerId: currentGk,
      inPlayerId: secondHalfKeeperId,
      slotId: "gk",
      position: "GK",
    },
  };
}

function getBench(playerIds: string[], lineup: Record<string, string | null>): string[] {
  const onField = new Set(Object.values(lineup).filter(Boolean));
  return playerIds.filter((id) => !onField.has(id));
}

function tryAddSub(
  subs: Substitution[],
  lineup: Record<string, string | null>,
  sub: Substitution,
  rules: SubstitutionRule[]
): boolean {
  const trialSubs = [...subs, sub];
  const trialLineup = applySubs(lineup, trialSubs);
  if (subsViolations(trialSubs, rules).length > 0) return false;
  if (lineupViolations(trialLineup, rules).length > 0) return false;
  subs.push(sub);
  return true;
}

function pickStrikerRotation(
  workingLineup: Record<string, string | null>,
  benchPool: string[],
  players: Player[],
  minutesPlayed: Record<string, number>,
  playerTargets: Record<string, number>,
  consecutiveBench: Record<string, number>,
  maxConsecutive: number,
  rules: SubstitutionRule[],
  subs: Substitution[],
  segmentIndex: number,
  totalSegments: number,
  segmentDuration: number,
  settings: GameSettings
): boolean {
  const rated = ratedMinutesMap(
    players,
    minutesPlayed,
    segmentIndex,
    settings,
    segmentDuration
  );
  const stOccupant = workingLineup.st;
  if (!stOccupant) return false;

  const stBench = strikerBenchCandidates(benchPool, players);
  if (stBench.length === 0) return false;

  const occupantRatio = playingRatio(stOccupant, rated, playerTargets);
  const occupantAhead = isAheadOfSchedule(
    stOccupant,
    rated,
    segmentIndex,
    totalSegments,
    playerTargets,
    segmentDuration
  );

  const incoming = [...stBench].sort((a, b) => {
    const streakDiff = (consecutiveBench[b] ?? 0) - (consecutiveBench[a] ?? 0);
    if (streakDiff !== 0) return streakDiff;
    return (
      playingRatio(a, rated, playerTargets) -
      playingRatio(b, rated, playerTargets)
    );
  })[0];

  const incomingRatio = playingRatio(incoming, rated, playerTargets);
  const incomingMustPlay = (consecutiveBench[incoming] ?? 0) >= maxConsecutive;

  const shouldSwap =
    incomingMustPlay ||
    occupantAhead ||
    occupantRatio > incomingRatio + 0.15;

  if (!shouldSwap) return false;

  const sub: Substitution = {
    outPlayerId: stOccupant,
    inPlayerId: incoming,
    slotId: "st",
    position: "ST",
  };
  if (!tryAddSub(subs, workingLineup, sub, rules)) return false;
  return true;
}

function pickMandatoryBenchIns(
  workingLineup: Record<string, string | null>,
  benchPool: string[],
  players: Player[],
  minutesPlayed: Record<string, number>,
  playerTargets: Record<string, number>,
  consecutiveBench: Record<string, number>,
  maxConsecutive: number,
  rules: SubstitutionRule[],
  segmentIndex: number,
  segmentsPerHalf: number,
  settings: GameSettings,
  maxSubs: number,
  totalSegments: number,
  segmentDuration: number
): { subs: Substitution[]; benchPool: string[]; workingLineup: Record<string, string | null> } {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const subs: Substitution[] = [];
  const pool = [...benchPool];
  const filledSlots = new Set<string>();
  const rated = ratedMinutesMap(
    players,
    minutesPlayed,
    segmentIndex,
    settings,
    segmentDuration
  );

  const mustPlay = filterBenchStreakCandidates(
    pool,
    consecutiveBench,
    maxConsecutive,
    segmentIndex,
    segmentsPerHalf,
    settings
  )
    .filter((id) => {
      if (
        isAheadOfSchedule(
          id,
          rated,
          segmentIndex,
          totalSegments,
          playerTargets,
          segmentDuration
        )
      ) {
        return (consecutiveBench[id] ?? 0) > maxConsecutive;
      }
      return true;
    })
    .sort((a, b) => {
      const streakDiff = (consecutiveBench[b] ?? 0) - (consecutiveBench[a] ?? 0);
      if (streakDiff !== 0) return streakDiff;
      return (
        playingRatio(a, rated, playerTargets) -
        playingRatio(b, rated, playerTargets)
      );
    });

  for (const playerId of mustPlay) {
    if (subs.length >= maxSubs) break;
    if (subs.some((s) => s.inPlayerId === playerId || s.outPlayerId === playerId)) continue;

    const player = playerMap.get(playerId);
    if (!player) continue;

    const stOccupant = workingLineup.st;
    if (
      stOccupant &&
      stOccupant !== playerId &&
      canPlayPosition(player, "ST") &&
      !canPlayPosition(player, "MID") &&
      !canPlayPosition(player, "DEF")
    ) {
      const stOnlyBench = !Object.entries(workingLineup).some(
        ([slotId, id]) =>
          slotId !== "gk" &&
          slotId !== "st" &&
          id === playerId &&
          slotId
      );
      if (stOnlyBench || player.primaryPosition === "ST") {
        const occupantRatio = playingRatio(stOccupant, rated, playerTargets);
        const incomingRatio = playingRatio(playerId, rated, playerTargets);
        const occupantAhead = isAheadOfSchedule(
          stOccupant,
          rated,
          segmentIndex,
          totalSegments,
          playerTargets,
          segmentDuration
        );
        if (
          incomingRatio >= occupantRatio &&
          !occupantAhead &&
          (consecutiveBench[playerId] ?? 0) <= maxConsecutive
        ) {
          continue;
        }
      }
    }

    const slotOptions = Object.entries(workingLineup)
      .filter(([slotId, id]) => id && slotId !== "gk")
      .map(([slotId, occupantId]) => ({
        slotId,
        occupantId: occupantId!,
        slot: FORMATION_231.find((s) => s.id === slotId)!,
        fit: positionScore(player, FORMATION_231.find((s) => s.id === slotId)!.position),
        ratio: playingRatio(occupantId!, rated, playerTargets),
      }))
      .filter((o) => o.fit > 0)
      .filter((o) => !filledSlots.has(o.slotId))
      .sort((a, b) => {
        const ratioDiff = b.ratio - a.ratio;
        if (Math.abs(ratioDiff) > 0.05) return ratioDiff;
        const fitDiff = b.fit - a.fit;
        if (fitDiff !== 0) return fitDiff;
        return a.occupantId.localeCompare(b.occupantId);
      });

    for (const slot of slotOptions) {
      const sub: Substitution = {
        outPlayerId: slot.occupantId,
        inPlayerId: playerId,
        slotId: slot.slotId,
        position: slot.slot.position,
      };
      if (!tryAddSub(subs, workingLineup, sub, rules)) continue;

      filledSlots.add(slot.slotId);
      pool.splice(pool.indexOf(playerId), 1);
      pool.push(slot.occupantId);
      break;
    }
  }

  return { subs, benchPool: pool, workingLineup: applySubs(workingLineup, subs) };
}

function pickSubsForRotation(
  lineup: Record<string, string | null>,
  bench: string[],
  players: Player[],
  subsCount: number,
  minutesPlayed: Record<string, number>,
  playerTargets: Record<string, number>,
  rules: SubstitutionRule[],
  consecutiveBench: Record<string, number>,
  maxConsecutiveBench: number,
  segmentIndex: number,
  segmentsPerHalf: number,
  settings: GameSettings,
  totalSegments: number,
  segmentDuration: number
): Substitution[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  let benchPool = bench.filter((id) => id !== lineup.gk);
  const subs: Substitution[] = [];
  let workingLineup = { ...lineup };
  const rated = ratedMinutesMap(
    players,
    minutesPlayed,
    segmentIndex,
    settings,
    segmentDuration
  );

  if (subs.length < subsCount) {
    if (
      pickStrikerRotation(
        workingLineup,
        benchPool,
        players,
        minutesPlayed,
        playerTargets,
        consecutiveBench,
        maxConsecutiveBench,
        rules,
        subs,
        segmentIndex,
        totalSegments,
        segmentDuration,
        settings
      )
    ) {
      const stSub = subs[subs.length - 1];
      workingLineup = applySubs(workingLineup, [stSub]);
      benchPool.splice(benchPool.indexOf(stSub.inPlayerId), 1);
      benchPool.push(stSub.outPlayerId);
    }
  }

  const mandatory = pickMandatoryBenchIns(
    workingLineup,
    benchPool,
    players,
    minutesPlayed,
    playerTargets,
    consecutiveBench,
    maxConsecutiveBench,
    rules,
    segmentIndex,
    segmentsPerHalf,
    settings,
    subsCount - subs.length,
    totalSegments,
    segmentDuration
  );
  subs.push(...mandatory.subs);
  benchPool = mandatory.benchPool;
  workingLineup = mandatory.workingLineup;

  const fieldEntries = Object.entries(workingLineup).filter(
    ([slotId, id]) => id && slotId !== "gk"
  ) as [string, string][];

  const candidatesOut = fieldEntries
    .map(([slotId, playerId]) => ({
      slotId,
      playerId,
      slot: FORMATION_231.find((s) => s.id === slotId)!,
      ratio: playingRatio(playerId, rated, playerTargets),
      ahead: isAheadOfSchedule(
        playerId,
        rated,
        segmentIndex,
        totalSegments,
        playerTargets,
        segmentDuration
      ),
    }))
    .sort((a, b) => {
      if (a.ahead !== b.ahead) return a.ahead ? -1 : 1;
      return b.ratio - a.ratio;
    });

  for (const out of candidatesOut) {
    if (subs.length >= subsCount) break;
    if (subs.some((s) => s.outPlayerId === out.playerId)) continue;
    if (subs.some((s) => s.slotId === out.slotId)) continue;

    const benchSorted = benchPool
      .map((id) => ({
        id,
        player: playerMap.get(id)!,
        ratio: playingRatio(id, rated, playerTargets),
        fit: positionScore(playerMap.get(id)!, out.slot.position),
      }))
      .filter((b) => b.fit > 0)
      .filter((b) => !subs.some((s) => s.inPlayerId === b.id))
      .sort((a, b) => {
        const ratioDiff = a.ratio - b.ratio;
        if (Math.abs(ratioDiff) > 0.05) return ratioDiff;
        const fitDiff = b.fit - a.fit;
        if (fitDiff !== 0) return fitDiff;
        return a.player.name.localeCompare(b.player.name);
      });

    for (const candidate of benchSorted) {
      if (subs.some((s) => s.outPlayerId === candidate.id)) continue;

      const sub: Substitution = {
        outPlayerId: out.playerId,
        inPlayerId: candidate.id,
        slotId: out.slotId,
        position: out.slot.position,
      };
      if (!tryAddSub(subs, workingLineup, sub, rules)) continue;

      workingLineup = applySubs(workingLineup, [sub]);
      benchPool.splice(benchPool.indexOf(candidate.id), 1);
      benchPool.push(out.playerId);
      break;
    }
  }

  return subs;
}

function applySubs(
  lineup: Record<string, string | null>,
  subs: Substitution[]
): Record<string, string | null> {
  const next = { ...lineup };
  for (const sub of subs) {
    next[sub.slotId] = sub.inPlayerId;
  }
  return next;
}

function addSegmentMinutes(
  minutes: Record<string, number>,
  lineup: Record<string, string | null>,
  duration: number
): Record<string, number> {
  const next = { ...minutes };
  for (const playerId of Object.values(lineup)) {
    if (playerId) {
      next[playerId] = (next[playerId] ?? 0) + duration;
    }
  }
  return next;
}

/** Sum on-field minutes from each segment of an existing plan. */
export function calculatePlayerMinutesFromPlan(plan: GamePlan): Record<string, number> {
  let minutes: Record<string, number> = {};
  for (const segment of plan.segments) {
    const duration = segment.endMinute - segment.startMinute;
    minutes = addSegmentMinutes(minutes, segment.lineup, duration);
  }
  for (const id of plan.activePlayerIds) {
    if (minutes[id] === undefined) minutes[id] = 0;
  }
  return minutes;
}

export function generateGamePlan(
  players: Player[],
  settings: GameSettings,
  coachingProfiles: Record<string, PlayerCoachingInput> = {},
  availability: Record<string, PlayerAvailability> = {},
  subRules: SubstitutionRule[] = [],
  manualTargetOverrides: Record<string, number> = {}
): GamePlan {
  const activePlayers = getAvailablePlayers(players, availability);
  const unavailablePlayerIds = players
    .filter((p) => !activePlayers.some((a) => a.id === p.id))
    .map((p) => p.id);

  const totalSegments = settings.segmentsPerHalf * 2;
  const totalMinutes = settings.halfMinutes * 2;
  const segmentDuration = totalMinutes / totalSegments;
  const playerIds = activePlayers.map((p) => p.id);
  const playerTargets = resolvePlayerTargets(
    playerIds,
    computePlayerTargets(playerIds, coachingProfiles, settings, totalMinutes),
    manualTargetOverrides
  );
  const targetMinutes =
    playerIds.length > 0
      ? playerIds.reduce((acc, id) => acc + playerTargets[id], 0) / playerIds.length
      : 0;

  let lineup = buildInitialLineup(activePlayers, playerTargets, settings);
  let minutesPlayed: Record<string, number> = {};
  let consecutiveBench = initConsecutiveBench(playerIds);
  const segments: SegmentAssignment[] = [];
  const maxBench = settings.maxConsecutiveBenchRotations ?? 1;

  for (let i = 0; i < totalSegments; i++) {
    const half: 1 | 2 = i < settings.segmentsPerHalf ? 1 : 2;
    const segmentInHalf =
      half === 1 ? i + 1 : i - settings.segmentsPerHalf + 1;
    const startMinute = i * segmentDuration;
    const endMinute = (i + 1) * segmentDuration;

    const prevLineup =
      i === 0 ? { ...lineup } : { ...segments[i - 1].lineup };

    const substitutions: Substitution[] = [];
    let workingLineup = { ...prevLineup };

    if (i === settings.segmentsPerHalf && settings.secondHalfKeeperId) {
      const keeperSwap = applyHalfTimeKeeperSwap(
        workingLineup,
        settings.secondHalfKeeperId,
        activePlayers
      );
      workingLineup = keeperSwap.lineup;
      if (keeperSwap.substitution) {
        substitutions.push(keeperSwap.substitution);
      }
    }

    if (i > 0) {
      substitutions.push(
        ...pickSubsForRotation(
          workingLineup,
          getBench(playerIds, workingLineup),
          activePlayers,
          settings.subsPerRotation,
          minutesPlayed,
          playerTargets,
          subRules,
          consecutiveBench,
          maxBench,
          i,
          settings.segmentsPerHalf,
          settings,
          totalSegments,
          segmentDuration
        )
      );
    }

    lineup =
      substitutions.length > 0 ? applySubs(prevLineup, substitutions) : workingLineup;

    const segmentBench = getBench(playerIds, lineup);
    const storedSubs =
      i > 0
        ? normalizeSegmentSubs(prevLineup, lineup, playerIds, substitutions)
        : [];

    segments.push({
      segmentIndex: i,
      half,
      segmentInHalf,
      startMinute,
      endMinute,
      lineup: { ...lineup },
      bench: segmentBench,
      substitutions: storedSubs,
    });

    minutesPlayed = addSegmentMinutes(minutesPlayed, lineup, segmentDuration);
    consecutiveBench = applyBenchStreakUpdate(
      consecutiveBench,
      playerIds,
      segmentBench,
      i,
      settings.segmentsPerHalf,
      settings
    );
  }

  return {
    settings,
    segments,
    playerMinutes: minutesPlayed,
    playerTargets,
    manualTargetOverrides:
      Object.keys(manualTargetOverrides).length > 0 ? manualTargetOverrides : undefined,
    targetMinutes,
    activePlayerIds: playerIds,
    unavailablePlayerIds,
  };
}

export function getCurrentSegment(plan: GamePlan, elapsedMinutes: number): number {
  const idx = plan.segments.findIndex(
    (s) => elapsedMinutes >= s.startMinute && elapsedMinutes < s.endMinute
  );
  return idx >= 0 ? idx : plan.segments.length - 1;
}

export function formatMinute(minute: number): string {
  const m = Math.floor(minute);
  const s = Math.round((minute - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getPlayerById(players: Player[], id: string): Player | undefined {
  return players.find((p) => p.id === id);
}

export function countByPosition(players: Player[]): Record<Position, number> {
  return players.reduce(
    (acc, p) => {
      if (canPlayPosition(p, "GK")) acc.GK += 1;
      if (canPlayPosition(p, "DEF")) acc.DEF += 1;
      if (canPlayPosition(p, "MID")) acc.MID += 1;
      if (canPlayPosition(p, "ST")) acc.ST += 1;
      return acc;
    },
    { GK: 0, DEF: 0, MID: 0, ST: 0 } as Record<Position, number>
  );
}

export function validateRoster(
  players: Player[],
  options?: { forGameDay?: boolean }
): string[] {
  const warnings: string[] = [];
  const counts = countByPosition(players);

  if (players.length < 7) {
    warnings.push(
      options?.forGameDay
        ? `Only ${players.length} players available — need at least 7 to play.`
        : "Need at least 7 players for a match."
    );
  }

  if (counts.GK < 1) {
    warnings.push(
      options?.forGameDay
        ? "No available goalkeeper — assign GK (primary or secondary) on Roster."
        : "Assign at least one goalkeeper (primary or secondary)."
    );
  }
  if (counts.DEF < 2) {
    warnings.push(
      options?.forGameDay
        ? `Only ${counts.DEF} player(s) can play defender — may need out-of-position.`
        : "Need at least 2 defenders for 2-3-1."
    );
  }
  if (counts.MID < 3) {
    warnings.push(
      options?.forGameDay
        ? `Only ${counts.MID} player(s) can play midfield — may need out-of-position.`
        : "Need at least 3 midfielders for 2-3-1."
    );
  }
  if (counts.ST < 1) {
    warnings.push(
      options?.forGameDay
        ? "No available striker — may need a midfielder up top."
        : "Need at least 1 striker for 2-3-1."
    );
  }

  if (players.length === 7) {
    warnings.push("Exactly 7 available — everyone plays full game, no subs.");
  }

  return warnings;
}

export { canPlayGoalkeeper, getGoalkeeperCandidates } from "./positions";

export {
  applyHalfTimeKeeperSwap,
  pickSubsForRotation,
  applySubs,
  getBench,
  addSegmentMinutes,
};
