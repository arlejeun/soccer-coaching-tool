import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_ROSTER } from "../data/roster";
import {
  type GameDayState,
  type StoredGameSettings,
  isGameDayNewer,
  loadGameDayStateFromLocal,
  touchGameDayState,
  writeGameDayStateToLocal,
} from "../lib/gameDayState";
import {
  isSheetsConfigured,
  loadFromSheet,
  saveCoachingToSheet,
  saveGameDayToSheet,
  saveRosterToSheet,
  setSheetsConfig,
} from "../lib/sheetsApi";
import type {
  GamePlan,
  Player,
  PlayerAvailability,
  PlayerCoachingInput,
  SubstitutionRule,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { normalizeCoachingInput } from "../lib/coachingScore";

export type SyncStatus = "idle" | "loading" | "synced" | "saving" | "error" | "offline";

type SaveKind = "roster" | "coaching" | "gameDay";

interface SheetState {
  players: Player[];
  coachingProfiles: Record<string, PlayerCoachingInput>;
  meritInfluence: number;
  gameDay: GameDayState;
  syncStatus: SyncStatus;
  syncError: string | null;
  isConfigured: boolean;
  lastSynced: Date | null;
}

function applyGameDayPatch(
  prev: GameDayState,
  patch: Partial<Omit<GameDayState, "updatedAt">>
): GameDayState {
  const next = touchGameDayState({
    plan: patch.plan !== undefined ? patch.plan : prev.plan,
    gameSettings: patch.gameSettings ?? prev.gameSettings,
    gameDayAvailability: patch.gameDayAvailability ?? prev.gameDayAvailability,
    subRules: patch.subRules ?? prev.subRules,
  });
  writeGameDayStateToLocal(next);
  return next;
}

export function useGoogleSheet() {
  const [state, setState] = useState<SheetState>(() => ({
    players: INITIAL_ROSTER,
    coachingProfiles: {},
    meritInfluence: DEFAULT_SETTINGS.meritInfluence,
    gameDay: loadGameDayStateFromLocal(),
    syncStatus: "idle",
    syncError: null,
    isConfigured: isSheetsConfigured(),
    lastSynced: null,
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<Set<SaveKind>>(new Set());

  const refresh = useCallback(async () => {
    if (!isSheetsConfigured()) {
      setState((s) => ({
        ...s,
        isConfigured: false,
        syncStatus: "offline",
        syncError: null,
      }));
      return;
    }

    setState((s) => ({ ...s, syncStatus: "loading", syncError: null }));
    try {
      const data = await loadFromSheet();
      const localGameDay = stateRef.current.gameDay;
      let gameDay = localGameDay;
      let shouldPushLocalGameDay = false;

      if (data.gameDayState && isGameDayNewer(data.gameDayState, localGameDay)) {
        gameDay = data.gameDayState;
        writeGameDayStateToLocal(gameDay);
      } else if (
        localGameDay.plan &&
        (data.gameDayState == null || isGameDayNewer(localGameDay, data.gameDayState))
      ) {
        // Local plan exists / is newer — keep it and push up after load.
        shouldPushLocalGameDay = true;
      }

      setState({
        players: data.players.length > 0 ? data.players : INITIAL_ROSTER,
        coachingProfiles: data.coachingProfiles,
        meritInfluence: data.meritInfluence,
        gameDay,
        syncStatus: "synced",
        syncError: null,
        isConfigured: true,
        lastSynced: new Date(),
      });

      if (shouldPushLocalGameDay && localGameDay.plan) {
        pendingSave.current.add("gameDay");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void flushSaveRef.current();
        }, 300);
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        syncStatus: "error",
        syncError: err instanceof Error ? err.message : "Failed to load",
        isConfigured: true,
      }));
    }
  }, []);

  const flushSave = useCallback(async () => {
    if (!isSheetsConfigured()) return;
    const kinds = Array.from(pendingSave.current);
    pendingSave.current.clear();
    if (kinds.length === 0) return;

    const current = stateRef.current;
    setState((s) => ({ ...s, syncStatus: "saving", syncError: null }));

    try {
      if (kinds.includes("roster")) {
        const result = await saveRosterToSheet(current.players);
        if (!result.ok) throw new Error(result.error ?? "Roster save failed");
      }
      if (kinds.includes("coaching")) {
        const result = await saveCoachingToSheet(
          current.coachingProfiles,
          current.meritInfluence
        );
        if (!result.ok) throw new Error(result.error ?? "Coaching save failed");
      }
      if (kinds.includes("gameDay")) {
        writeGameDayStateToLocal(current.gameDay);
        const result = await saveGameDayToSheet(current.gameDay);
        if (!result.ok) throw new Error(result.error ?? "Plan save failed");
      }

      setState((s) => ({
        ...s,
        syncStatus: "synced",
        syncError: null,
        lastSynced: new Date(),
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        syncStatus: "error",
        syncError: err instanceof Error ? err.message : "Failed to save",
      }));
    }
  }, []);

  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Flush pending cloud saves + local snapshot when leaving the page / app.
  useEffect(() => {
    const persistNow = () => {
      writeGameDayStateToLocal(stateRef.current.gameDay);
      if (pendingSave.current.size > 0) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        void flushSaveRef.current();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const scheduleSave = useCallback((kind: SaveKind) => {
    if (!isSheetsConfigured()) return;
    pendingSave.current.add(kind);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSaveRef.current();
    }, 1200);
  }, []);

  const setPlayers = useCallback(
    (players: Player[] | ((prev: Player[]) => Player[])) => {
      setState((s) => {
        const next = typeof players === "function" ? players(s.players) : players;
        return { ...s, players: next };
      });
      scheduleSave("roster");
    },
    [scheduleSave]
  );

  const setCoachingProfiles = useCallback(
    (
      profiles:
        | Record<string, PlayerCoachingInput>
        | ((prev: Record<string, PlayerCoachingInput>) => Record<string, PlayerCoachingInput>)
    ) => {
      setState((s) => {
        const next = typeof profiles === "function" ? profiles(s.coachingProfiles) : profiles;
        const normalized = Object.fromEntries(
          Object.entries(next).map(([id, input]) => [id, normalizeCoachingInput(input)])
        );
        return { ...s, coachingProfiles: normalized };
      });
      scheduleSave("coaching");
    },
    [scheduleSave]
  );

  const setMeritInfluence = useCallback(
    (meritInfluence: number) => {
      setState((s) => ({ ...s, meritInfluence }));
      scheduleSave("coaching");
    },
    [scheduleSave]
  );

  const setPlan = useCallback(
    (plan: GamePlan | null | ((prev: GamePlan | null) => GamePlan | null)) => {
      setState((s) => {
        const nextPlan = typeof plan === "function" ? plan(s.gameDay.plan) : plan;
        return { ...s, gameDay: applyGameDayPatch(s.gameDay, { plan: nextPlan }) };
      });
      scheduleSave("gameDay");
    },
    [scheduleSave]
  );

  const setGameSettings = useCallback(
    (
      settings:
        | StoredGameSettings
        | ((prev: StoredGameSettings) => StoredGameSettings)
    ) => {
      setState((s) => {
        const next =
          typeof settings === "function" ? settings(s.gameDay.gameSettings) : settings;
        return { ...s, gameDay: applyGameDayPatch(s.gameDay, { gameSettings: next }) };
      });
      scheduleSave("gameDay");
    },
    [scheduleSave]
  );

  const setGameDayAvailability = useCallback(
    (
      availability:
        | Record<string, PlayerAvailability>
        | ((prev: Record<string, PlayerAvailability>) => Record<string, PlayerAvailability>)
    ) => {
      setState((s) => {
        const next =
          typeof availability === "function"
            ? availability(s.gameDay.gameDayAvailability)
            : availability;
        return {
          ...s,
          gameDay: applyGameDayPatch(s.gameDay, { gameDayAvailability: next }),
        };
      });
      scheduleSave("gameDay");
    },
    [scheduleSave]
  );

  const setSubRules = useCallback(
    (
      rules:
        | SubstitutionRule[]
        | ((prev: SubstitutionRule[]) => SubstitutionRule[])
    ) => {
      setState((s) => {
        const next = typeof rules === "function" ? rules(s.gameDay.subRules) : rules;
        return { ...s, gameDay: applyGameDayPatch(s.gameDay, { subRules: next }) };
      });
      scheduleSave("gameDay");
    },
    [scheduleSave]
  );

  const configure = useCallback(
    (url: string, secret: string) => {
      setSheetsConfig(url, secret);
      refresh();
    },
    [refresh]
  );

  return {
    players: state.players,
    coachingProfiles: state.coachingProfiles,
    meritInfluence: state.meritInfluence,
    plan: state.gameDay.plan,
    gameSettings: state.gameDay.gameSettings,
    gameDayAvailability: state.gameDay.gameDayAvailability,
    subRules: state.gameDay.subRules,
    syncStatus: state.syncStatus,
    syncError: state.syncError,
    isConfigured: state.isConfigured,
    lastSynced: state.lastSynced,
    setPlayers,
    setCoachingProfiles,
    setMeritInfluence,
    setPlan,
    setGameSettings,
    setGameDayAvailability,
    setSubRules,
    refresh,
    configure,
  };
}
