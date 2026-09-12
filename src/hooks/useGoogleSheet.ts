import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_ROSTER } from "../data/roster";
import {
  isSheetsConfigured,
  loadFromSheet,
  saveCoachingToSheet,
  saveRosterToSheet,
  setSheetsConfig,
} from "../lib/sheetsApi";
import type { Player, PlayerCoachingInput } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { normalizeCoachingInput } from "../lib/coachingScore";

export type SyncStatus = "idle" | "loading" | "synced" | "saving" | "error" | "offline";

interface SheetState {
  players: Player[];
  coachingProfiles: Record<string, PlayerCoachingInput>;
  meritInfluence: number;
  syncStatus: SyncStatus;
  syncError: string | null;
  isConfigured: boolean;
  lastSynced: Date | null;
}

export function useGoogleSheet() {
  const [state, setState] = useState<SheetState>({
    players: INITIAL_ROSTER,
    coachingProfiles: {},
    meritInfluence: DEFAULT_SETTINGS.meritInfluence,
    syncStatus: "idle",
    syncError: null,
    isConfigured: isSheetsConfigured(),
    lastSynced: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<"roster" | "coaching" | null>(null);

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
      setState({
        players: data.players.length > 0 ? data.players : INITIAL_ROSTER,
        coachingProfiles: data.coachingProfiles,
        meritInfluence: data.meritInfluence,
        syncStatus: "synced",
        syncError: null,
        isConfigured: true,
        lastSynced: new Date(),
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        syncStatus: "error",
        syncError: err instanceof Error ? err.message : "Failed to load",
        isConfigured: true,
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const flushSave = useCallback(async () => {
    if (!isSheetsConfigured()) return;
    const kind = pendingSave.current;
    pendingSave.current = null;
    const current = stateRef.current;

    setState((s) => ({ ...s, syncStatus: "saving", syncError: null }));

    try {
      const result =
        kind === "roster"
          ? await saveRosterToSheet(current.players)
          : await saveCoachingToSheet(current.coachingProfiles, current.meritInfluence);

      if (!result.ok) throw new Error(result.error ?? "Save failed");

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

  const scheduleSave = useCallback(
    (kind: "roster" | "coaching") => {
      if (!isSheetsConfigured()) return;
      pendingSave.current = kind;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, 1500);
    },
    [flushSave]
  );

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

  const configure = useCallback(
    (url: string, secret: string) => {
      setSheetsConfig(url, secret);
      refresh();
    },
    [refresh]
  );

  return {
    ...state,
    setPlayers,
    setCoachingProfiles,
    setMeritInfluence,
    refresh,
    configure,
  };
}
