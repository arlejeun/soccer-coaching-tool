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

/** One match (tournament game, weekend fixture, etc.). */
export interface SavedGame {
  id: string;
  name: string;
  opponent?: string;
  /** Optional kickoff / date label, free text or ISO. */
  when?: string;
  updatedAt: string;
  plan: GamePlan | null;
  gameSettings: StoredGameSettings;
  gameDayAvailability: Record<string, PlayerAvailability>;
}

/** All saved matches + shared sub rules, synced to Sheets and localStorage. */
export interface GameDayState {
  updatedAt: string;
  activeGameId: string;
  games: SavedGame[];
  /** Shared across games (club rotation constraints). */
  subRules: SubstitutionRule[];
}

function defaultGameSettings(): StoredGameSettings {
  return {
    halfMinutes: DEFAULT_SETTINGS.halfMinutes,
    segmentsPerHalf: DEFAULT_SETTINGS.segmentsPerHalf,
    subsPerRotation: DEFAULT_SETTINGS.subsPerRotation,
  };
}

export function newGameId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createBlankGame(name = "Game 1"): SavedGame {
  const now = new Date().toISOString();
  return {
    id: newGameId(),
    name,
    updatedAt: now,
    plan: null,
    gameSettings: defaultGameSettings(),
    gameDayAvailability: {},
  };
}

export function defaultGameDayState(): GameDayState {
  const game = createBlankGame("Game 1");
  return {
    updatedAt: game.updatedAt,
    activeGameId: game.id,
    games: [game],
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

function normalizeSavedGame(raw: Partial<SavedGame>, fallbackName: string): SavedGame {
  return {
    id: raw.id || newGameId(),
    name: (raw.name ?? fallbackName).trim() || fallbackName,
    opponent: raw.opponent?.trim() || undefined,
    when: raw.when?.trim() || undefined,
    updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
    plan: raw.plan ?? null,
    gameSettings: {
      ...defaultGameSettings(),
      ...(raw.gameSettings ?? {}),
    },
    gameDayAvailability: raw.gameDayAvailability ?? {},
  };
}

/** Upgrade legacy single-plan blob (or multi-game) into current shape. */
export function normalizeGameDayState(raw: unknown): GameDayState | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const subRules =
    Array.isArray(data.subRules) && data.subRules.length > 0
      ? (data.subRules as SubstitutionRule[])
      : DEFAULT_SUB_RULES;

  if (Array.isArray(data.games) && data.games.length > 0) {
    const games = data.games.map((g, i) =>
      normalizeSavedGame((g ?? {}) as Partial<SavedGame>, `Game ${i + 1}`)
    );
    const activeGameId =
      typeof data.activeGameId === "string" && games.some((g) => g.id === data.activeGameId)
        ? data.activeGameId
        : games[0].id;
    return {
      updatedAt:
        typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
      activeGameId,
      games,
      subRules,
    };
  }

  // Legacy flat: { plan, gameSettings, gameDayAvailability, subRules, updatedAt }
  const legacy = data as Partial<SavedGame> & {
    updatedAt?: string;
    subRules?: SubstitutionRule[];
  };
  const game = normalizeSavedGame(
    {
      id: newGameId(),
      name: "Game 1",
      updatedAt: legacy.updatedAt,
      plan: legacy.plan ?? null,
      gameSettings: legacy.gameSettings,
      gameDayAvailability: legacy.gameDayAvailability,
    },
    "Game 1"
  );

  return {
    updatedAt: legacy.updatedAt ?? game.updatedAt,
    activeGameId: game.id,
    games: [game],
    subRules,
  };
}

/** Migrate older per-key localStorage into one multi-game blob. */
export function loadGameDayStateFromLocal(): GameDayState {
  const blob = readJson<unknown>(GAME_DAY_STORAGE_KEY);
  const normalized = normalizeGameDayState(blob);
  if (normalized) return normalized;

  const legacyPlan = readJson<GamePlan | null>("u10-plan");
  const legacySettings = readJson<StoredGameSettings>("u10-game-settings");
  const legacyAvailability = readJson<Record<string, PlayerAvailability>>("u10-game-day");
  const legacyRules = readJson<SubstitutionRule[]>("u10-sub-rules");

  const game = normalizeSavedGame(
    {
      name: "Game 1",
      updatedAt: new Date().toISOString(),
      plan: legacyPlan ?? null,
      gameSettings: legacySettings ?? undefined,
      gameDayAvailability: legacyAvailability ?? {},
    },
    "Game 1"
  );

  return {
    updatedAt: game.updatedAt,
    activeGameId: game.id,
    games: [game],
    subRules: legacyRules?.length ? legacyRules : DEFAULT_SUB_RULES,
  };
}

export function getActiveGame(state: GameDayState): SavedGame {
  return (
    state.games.find((g) => g.id === state.activeGameId) ??
    state.games[0] ??
    createBlankGame()
  );
}

export function writeGameDayStateToLocal(state: GameDayState): void {
  const payload = JSON.stringify(state);
  localStorage.setItem(GAME_DAY_STORAGE_KEY, payload);
  const active = getActiveGame(state);
  // Keep legacy keys in sync with the active game for recovery / older builds.
  localStorage.setItem("u10-plan", JSON.stringify(active.plan));
  localStorage.setItem("u10-game-settings", JSON.stringify(active.gameSettings));
  localStorage.setItem("u10-game-day", JSON.stringify(active.gameDayAvailability));
  localStorage.setItem("u10-sub-rules", JSON.stringify(state.subRules));
}

export function touchGameDayState(state: GameDayState): GameDayState {
  const now = new Date().toISOString();
  const activeId = state.activeGameId;
  return {
    ...state,
    updatedAt: now,
    games: state.games.map((g) =>
      g.id === activeId ? { ...g, updatedAt: now } : g
    ),
  };
}

export function isGameDayNewer(
  a: GameDayState | null | undefined,
  b: GameDayState | null | undefined
): boolean {
  const aTime = a?.updatedAt ? Date.parse(a.updatedAt) : 0;
  const bTime = b?.updatedAt ? Date.parse(b.updatedAt) : 0;
  return aTime > bTime;
}

function gameNewer(a: SavedGame, b: SavedGame): boolean {
  const aTime = Date.parse(a.updatedAt || "") || 0;
  const bTime = Date.parse(b.updatedAt || "") || 0;
  return aTime >= bTime;
}

function gameHasPlan(game: SavedGame): boolean {
  return Boolean(game.plan?.segments && game.plan.segments.length > 0);
}

/** Prefer a game that still has a plan over a newer empty shell of the same id. */
export function pickPreferredGame(a: SavedGame, b: SavedGame): SavedGame {
  const aHas = gameHasPlan(a);
  const bHas = gameHasPlan(b);
  if (aHas && !bHas) return a;
  if (bHas && !aHas) return b;
  return gameNewer(a, b) ? a : b;
}

/**
 * Union local + remote games by id so Reload never drops a match that only
 * exists on one side. Never let an empty local game wipe a remote plan.
 */
export function mergeGameDayStates(
  local: GameDayState,
  remote: GameDayState | null
): { state: GameDayState; shouldPush: boolean } {
  if (!remote) {
    return {
      state: local,
      shouldPush: hasAnyPlan(local) || local.games.length > 1,
    };
  }

  const byId = new Map<string, SavedGame>();
  for (const g of remote.games) byId.set(g.id, g);
  for (const g of local.games) {
    const existing = byId.get(g.id);
    byId.set(g.id, existing ? pickPreferredGame(g, existing) : g);
  }

  const games = Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  const localActiveOk = games.some((g) => g.id === local.activeGameId);
  const remoteActiveOk = games.some((g) => g.id === remote.activeGameId);
  const preferredActive = localActiveOk
    ? local.activeGameId
    : remoteActiveOk
      ? remote.activeGameId
      : games[0]?.id;

  const useLocalMeta = isGameDayNewer(local, remote);
  const state: GameDayState = {
    updatedAt: useLocalMeta ? local.updatedAt : remote.updatedAt,
    activeGameId: preferredActive || local.activeGameId,
    games: games.length > 0 ? games : local.games,
    subRules: useLocalMeta ? local.subRules : remote.subRules,
  };

  const remoteIds = new Set(remote.games.map((g) => g.id));
  const localOnly = local.games.some((g) => !remoteIds.has(g.id));
  const countMismatch = local.games.length !== remote.games.length;
  // Only push when local actually contributes something Sheets is missing
  // (extra game, or a newer revision that still has a plan).
  const localContributes = local.games.some((g) => {
    const r = remote.games.find((x) => x.id === g.id);
    if (!r) return true;
    const picked = pickPreferredGame(g, r);
    return picked === g && (gameHasPlan(g) || !gameHasPlan(r));
  });

  const shouldPush = localOnly || (countMismatch && localContributes) || localContributes;

  return {
    state: {
      ...state,
      updatedAt: shouldPush ? new Date().toISOString() : state.updatedAt,
    },
    shouldPush,
  };
}

export function hasAnyPlan(state: GameDayState): boolean {
  return state.games.some((g) => g.plan != null);
}

export function patchActiveGame(
  state: GameDayState,
  patch: Partial<
    Pick<SavedGame, "plan" | "gameSettings" | "gameDayAvailability" | "name" | "opponent" | "when">
  >
): GameDayState {
  const active = getActiveGame(state);
  const nextGame: SavedGame = {
    ...active,
    ...patch,
    gameSettings: patch.gameSettings
      ? { ...active.gameSettings, ...patch.gameSettings }
      : active.gameSettings,
    gameDayAvailability: patch.gameDayAvailability ?? active.gameDayAvailability,
    plan: patch.plan !== undefined ? patch.plan : active.plan,
  };
  const games = state.games.map((g) => (g.id === active.id ? nextGame : g));
  return touchGameDayState({ ...state, games, activeGameId: active.id });
}

export function setActiveGameId(state: GameDayState, gameId: string): GameDayState {
  if (!state.games.some((g) => g.id === gameId)) return state;
  return touchGameDayState({ ...state, activeGameId: gameId });
}

export function addGame(
  state: GameDayState,
  options?: { name?: string; copyFromActive?: boolean }
): GameDayState {
  const active = getActiveGame(state);
  const name =
    options?.name?.trim() ||
    `Game ${state.games.length + 1}`;
  const game = options?.copyFromActive
    ? {
        ...structuredClone(active),
        id: newGameId(),
        name: options.name?.trim() || `${active.name} (copy)`,
        updatedAt: new Date().toISOString(),
      }
    : createBlankGame(name);

  if (!options?.copyFromActive && options?.name) {
    game.name = name;
  }

  return touchGameDayState({
    ...state,
    games: [...state.games, game],
    activeGameId: game.id,
  });
}

export function renameGame(
  state: GameDayState,
  gameId: string,
  name: string,
  meta?: { opponent?: string; when?: string }
): GameDayState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const games = state.games.map((g) =>
    g.id === gameId
      ? {
          ...g,
          name: trimmed,
          opponent: meta?.opponent !== undefined ? meta.opponent.trim() || undefined : g.opponent,
          when: meta?.when !== undefined ? meta.when.trim() || undefined : g.when,
        }
      : g
  );
  return touchGameDayState({ ...state, games });
}

export function deleteGame(state: GameDayState, gameId: string): GameDayState {
  if (state.games.length <= 1) return state;
  const games = state.games.filter((g) => g.id !== gameId);
  const activeGameId =
    state.activeGameId === gameId ? games[0].id : state.activeGameId;
  return touchGameDayState({ ...state, games, activeGameId });
}

export function gameLabel(game: SavedGame): string {
  const bits = [game.name];
  if (game.opponent) bits.push(`vs ${game.opponent}`);
  if (game.when) bits.push(game.when);
  return bits.join(" · ");
}
