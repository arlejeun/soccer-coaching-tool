import type { Player, PlayerCoachingInput } from "../types";
import { normalizeCoachingInput } from "./coachingScore";
import {
  type GameDayState,
  normalizeGameDayState,
} from "./gameDayState";

export interface SheetData {
  players: Player[];
  coachingProfiles: Record<string, PlayerCoachingInput>;
  meritInfluence: number;
  gameDayState: GameDayState | null;
}

export interface SheetSaveResult {
  ok: boolean;
  error?: string;
  data?: SheetData;
}

const URL_KEY = "u10-sheets-url";
const SECRET_KEY = "u10-sheets-secret";

export function getSheetsUrl(): string {
  return localStorage.getItem(URL_KEY)?.trim() ?? import.meta.env.VITE_SHEETS_URL?.trim() ?? "";
}

export function getSheetsSecret(): string {
  return localStorage.getItem(SECRET_KEY)?.trim() ?? import.meta.env.VITE_SHEETS_SECRET?.trim() ?? "";
}

export function setSheetsConfig(url: string, secret: string): void {
  localStorage.setItem(URL_KEY, url.trim());
  localStorage.setItem(SECRET_KEY, secret.trim());
}

export function isSheetsConfigured(): boolean {
  return Boolean(getSheetsUrl() && getSheetsSecret());
}

function unauthorizedError(data: { error?: string }): boolean {
  return data.error === "Unauthorized";
}

function normalizeSheetPayload(data: {
  players?: Player[];
  coachingProfiles?: Record<string, PlayerCoachingInput>;
  meritInfluence?: number;
  gameDayState?: unknown;
}): SheetData {
  return {
    players: data.players ?? [],
    coachingProfiles: normalizeCoachingProfiles(data.coachingProfiles ?? {}),
    meritInfluence: data.meritInfluence ?? 50,
    gameDayState: normalizeGameDayState(data.gameDayState),
  };
}

/** Apps Script requires text/plain for CORS POST from the browser. */
async function readResponseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`Empty response from Sheets (${res.status})`);
  }
  if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
    throw new Error(
      "Google returned a web page instead of data. Check the Apps Script URL ends with /exec, access is Anyone, and redeploy after Code.gs updates. Large multi-game saves need the latest script (Games sheet)."
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Invalid JSON from Sheets (${res.status}): ${trimmed.slice(0, 120)}`);
  }
}

async function postToSheet(body: object): Promise<SheetSaveResult> {
  const url = getSheetsUrl();
  const secret = getSheetsSecret();
  if (!url) return { ok: false, error: "No Google Sheets URL configured" };
  if (!secret) return { ok: false, error: "No shared secret configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ ...body, secret }),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });

    const data = (await readResponseJson(res)) as SheetSaveResult & {
      players?: Player[];
      coachingProfiles?: Record<string, PlayerCoachingInput>;
      meritInfluence?: number;
      gameDayState?: unknown;
    };
    if (unauthorizedError(data)) {
      return { ok: false, error: "Invalid shared secret" };
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Save failed (${res.status})` };
    }

    return {
      ok: true,
      data: data.data
        ? normalizeSheetPayload(data.data)
        : normalizeSheetPayload(data),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }
}

export async function loadFromSheet(): Promise<SheetData> {
  const url = getSheetsUrl();
  const secret = getSheetsSecret();
  if (!url) throw new Error("No Google Sheets URL configured");
  if (!secret) throw new Error("No shared secret configured");

  const endpoint = new URL(url);
  endpoint.searchParams.set("secret", secret);

  const res = await fetch(endpoint.toString());
  const data = (await readResponseJson(res)) as SheetData & {
    ok?: boolean;
    error?: string;
  };

  if (unauthorizedError(data)) {
    throw new Error("Invalid shared secret");
  }
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Load failed (${res.status})`);
  }

  return normalizeSheetPayload(data);
}

function normalizeCoachingProfiles(
  profiles: Record<string, PlayerCoachingInput>
): Record<string, PlayerCoachingInput> {
  return Object.fromEntries(
    Object.entries(profiles).map(([id, input]) => [id, normalizeCoachingInput(input)])
  );
}

export async function saveRosterToSheet(players: Player[]): Promise<SheetSaveResult> {
  return postToSheet({ action: "saveRoster", players });
}

export async function saveCoachingToSheet(
  profiles: Record<string, PlayerCoachingInput>,
  meritInfluence: number
): Promise<SheetSaveResult> {
  return postToSheet({ action: "saveCoaching", profiles, meritInfluence });
}

export async function saveGameDayToSheet(gameDayState: GameDayState): Promise<SheetSaveResult> {
  return postToSheet({ action: "saveGameDay", gameDayState });
}

export async function saveAllToSheet(
  players: Player[],
  profiles: Record<string, PlayerCoachingInput>,
  meritInfluence: number,
  gameDayState?: GameDayState | null
): Promise<SheetSaveResult> {
  return postToSheet({
    action: "saveAll",
    players,
    profiles,
    meritInfluence,
    gameDayState: gameDayState ?? undefined,
  });
}
