import type { PlayerCoachingInput } from "../types";
import { DEFAULT_COACHING_INPUT, type GameSettings } from "../types";

type CoachingCriterionKey = "practice" | "performance" | "behavior";

const SCORE_LABELS: Record<CoachingCriterionKey, string> = {
  practice: "Practice & Effort",
  performance: "Performance",
  behavior: "Behavior",
};

export const COACHING_CRITERIA: {
  key: CoachingCriterionKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "practice",
    label: "Practice & Effort",
    hint: "Attendance, punctuality, hustle, and focus at training",
  },
  {
    key: "performance",
    label: "Performance",
    hint: "Skill shown in games — decisions, technique, impact on the match",
  },
  {
    key: "behavior",
    label: "Behavior",
    hint: "Attitude, teamwork, coachability, respect",
  },
];

/** Migrate legacy practice/effort profiles and fill defaults. */
export function normalizeCoachingInput(
  raw: (Partial<PlayerCoachingInput> & { effort?: number }) | null | undefined
): PlayerCoachingInput {
  if (!raw) return { ...DEFAULT_COACHING_INPUT };

  const legacyEffort = typeof raw.effort === "number";
  const hasPerformance = typeof raw.performance === "number";

  let practice = clampScore(raw.practice ?? DEFAULT_COACHING_INPUT.practice);
  let performance = clampScore(
    hasPerformance ? raw.performance! : DEFAULT_COACHING_INPUT.performance
  );

  // Old sheets/local data: practice + effort → average into practice; performance starts neutral
  if (legacyEffort && !hasPerformance) {
    practice = clampScore(
      Math.round((practice + clampScore(raw.effort!)) / 2)
    );
    performance = DEFAULT_COACHING_INPUT.performance;
  }

  return {
    practice,
    performance,
    behavior: clampScore(raw.behavior ?? DEFAULT_COACHING_INPUT.behavior),
    notes: raw.notes,
  };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function getCoachingInput(
  profiles: Record<string, PlayerCoachingInput>,
  playerId: string
): PlayerCoachingInput {
  return normalizeCoachingInput(profiles[playerId]);
}

export function compositeScore(input: PlayerCoachingInput): number {
  const n = normalizeCoachingInput(input);
  return (n.practice + n.performance + n.behavior) / 3;
}

export function scoreLabel(score: number): string {
  if (score >= 4.5) return "Excellent";
  if (score >= 3.5) return "Strong";
  if (score >= 2.5) return "Average";
  if (score >= 1.5) return "Needs work";
  return "Concern";
}

/** Merit weight per player; average is always 1.0 across the roster. */
export function computeMeritWeights(
  playerIds: string[],
  profiles: Record<string, PlayerCoachingInput>,
  meritInfluence: number
): Record<string, number> {
  if (meritInfluence === 0 || playerIds.length === 0) {
    return Object.fromEntries(playerIds.map((id) => [id, 1]));
  }

  const influence = meritInfluence / 100;
  const maxSwing = 0.25;

  const rawWeights = playerIds.map((id) => {
    const input = getCoachingInput(profiles, id);
    const avg = compositeScore(input);
    const factor = (avg - 3) / 2;
    return { id, weight: 1 + influence * factor * maxSwing };
  });

  const sum = rawWeights.reduce((acc, w) => acc + w.weight, 0);
  const targetSum = playerIds.length;

  return Object.fromEntries(
    rawWeights.map(({ id, weight }) => [id, (weight / sum) * targetSum])
  );
}

export function computePlayerTargets(
  playerIds: string[],
  profiles: Record<string, PlayerCoachingInput>,
  settings: GameSettings,
  totalMinutes: number
): Record<string, number> {
  const totalFieldMinutes = totalMinutes * 7;
  const weights = computeMeritWeights(playerIds, profiles, settings.meritInfluence);
  const weightSum = playerIds.reduce((acc, id) => acc + weights[id], 0);

  return Object.fromEntries(
    playerIds.map((id) => [
      id,
      (totalFieldMinutes * weights[id]) / weightSum,
    ])
  );
}

/** Coach overrides win; otherwise use merit-derived targets. */
export function resolvePlayerTargets(
  playerIds: string[],
  coachingTargets: Record<string, number>,
  overrides: Record<string, number> = {}
): Record<string, number> {
  return Object.fromEntries(
    playerIds.map((id) => [id, overrides[id] ?? coachingTargets[id] ?? 0])
  );
}

export function formatCriterionLabel(
  key: CoachingCriterionKey,
  value: number
): string {
  return `${SCORE_LABELS[key]}: ${value}/5`;
}
