import { DEFAULT_SUB_RULES } from "../data/subRules";
import type {
  GamePlan,
  GameSettings,
  PlayerAvailability,
  SubstitutionRule,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";

export const GAME_DAY_STORAGE_KEY = "u10-game-day-state";

export type StoredGameSettings = Pick<
  GameSettings,
  | "halfMinutes"
  | "segmentsPerHalf"
  | "subsPerRotation"
  | "firstHalfKeeperId"
  | "secondHalfKeeperId"
>;

/** Plan + match-day settings synced to Sheets and localStorage. */
export interface GameDayState {
  updatedAt: string;
  plan: GamePlan | null;
  gameSettings: StoredGameSettings;
  gameDayAvailability: Record<string, PlayerAvailability>;
  subRules: SubstitutionRule[];
}

export function defaultGameDayState(): GameDayState {
  return {
    updatedAt: new Date(0).toISOString(),
    plan: null,
    gameSettings: {
      halfMinutes: DEFAULT_SETTINGS.halfMinutes,
      segmentsPerHalf: DEFAULT_SETTINGS.segmentsPerHalf,
      subsPerRotation: DEFAULT_SETTINGS.subsPerRotation,
    },
    gameDayAvailability: {},
    subRules: DEFAULT_SUB_RULES,
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Migrate older per-key localStorage into one game-day blob. */
export function loadGameDayStateFromLocal(): GameDayState {
  const blob = readJson<GameDayState>(GAME_DAY_STORAGE_KEY);
  if (blob && typeof blob === "object") {
    return {
      ...defaultGameDayState(),
      ...blob,
      gameSettings: {
        ...defaultGameDayState().gameSettings,
        ...(blob.gameSettings ?? {}),
      },
      gameDayAvailability: blob.gameDayAvailability ?? {},
      subRules: blob.subRules?.length ? blob.subRules : DEFAULT_SUB_RULES,
      plan: blob.plan ?? null,
      updatedAt: blob.updatedAt ?? new Date(0).toISOString(),
    };
  }

  const legacyPlan = readJson<GamePlan | null>("u10-plan");
  const legacySettings = readJson<StoredGameSettings>("u10-game-settings");
  const legacyAvailability = readJson<Record<string, PlayerAvailability>>("u10-game-day");
  const legacyRules = readJson<SubstitutionRule[]>("u10-sub-rules");

  return {
    updatedAt: new Date().toISOString(),
    plan: legacyPlan ?? null,
    gameSettings: {
      ...defaultGameDayState().gameSettings,
      ...(legacySettings ?? {}),
    },
    gameDayAvailability: legacyAvailability ?? {},
    subRules: legacyRules?.length ? legacyRules : DEFAULT_SUB_RULES,
  };
}

export function writeGameDayStateToLocal(state: GameDayState): void {
  const payload = JSON.stringify(state);
  localStorage.setItem(GAME_DAY_STORAGE_KEY, payload);
  // Keep legacy keys in sync so older builds / recovery still see data.
  localStorage.setItem("u10-plan", JSON.stringify(state.plan));
  localStorage.setItem("u10-game-settings", JSON.stringify(state.gameSettings));
  localStorage.setItem("u10-game-day", JSON.stringify(state.gameDayAvailability));
  localStorage.setItem("u10-sub-rules", JSON.stringify(state.subRules));
}

export function touchGameDayState(state: Omit<GameDayState, "updatedAt">): GameDayState {
  return { ...state, updatedAt: new Date().toISOString() };
}

export function isGameDayNewer(a: GameDayState | null | undefined, b: GameDayState | null | undefined): boolean {
  const aTime = a?.updatedAt ? Date.parse(a.updatedAt) : 0;
  const bTime = b?.updatedAt ? Date.parse(b.updatedAt) : 0;
  return aTime > bTime;
}

export function normalizeGameDayState(raw: unknown): GameDayState | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<GameDayState>;
  return {
    ...defaultGameDayState(),
    ...data,
    gameSettings: {
      ...defaultGameDayState().gameSettings,
      ...(data.gameSettings ?? {}),
    },
    gameDayAvailability: data.gameDayAvailability ?? {},
    subRules: data.subRules?.length ? data.subRules : DEFAULT_SUB_RULES,
    plan: data.plan ?? null,
    updatedAt: data.updatedAt ?? new Date(0).toISOString(),
  };
}
