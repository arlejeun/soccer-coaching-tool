const STORAGE_KEY = "u10-match-clocks";

export interface MatchClockState {
  elapsedSeconds: number;
  running: boolean;
  /** Wall time when this snapshot was written (for catch-up after reload). */
  savedAt: number;
}

type ClockMap = Record<string, MatchClockState>;

function readAll(): ClockMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ClockMap;
  } catch {
    return {};
  }
}

function writeAll(map: ClockMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadMatchClock(
  gameId: string | undefined,
  totalSeconds: number
): MatchClockState {
  if (!gameId) {
    return { elapsedSeconds: 0, running: false, savedAt: Date.now() };
  }
  const saved = readAll()[gameId];
  if (!saved) {
    return { elapsedSeconds: 0, running: false, savedAt: Date.now() };
  }

  let elapsed = Math.max(0, Math.floor(saved.elapsedSeconds) || 0);
  let running = Boolean(saved.running);

  // If the clock was running when the page closed, advance by wall time.
  if (running && saved.savedAt) {
    const delta = Math.floor((Date.now() - saved.savedAt) / 1000);
    if (delta > 0) elapsed += delta;
  }

  if (totalSeconds > 0 && elapsed >= totalSeconds) {
    elapsed = totalSeconds;
    running = false;
  }

  return { elapsedSeconds: elapsed, running, savedAt: Date.now() };
}

export function saveMatchClock(
  gameId: string | undefined,
  state: Omit<MatchClockState, "savedAt">
): void {
  if (!gameId) return;
  const map = readAll();
  map[gameId] = {
    elapsedSeconds: Math.max(0, Math.floor(state.elapsedSeconds)),
    running: state.running,
    savedAt: Date.now(),
  };
  writeAll(map);
}

export function clearMatchClock(gameId: string | undefined): void {
  if (!gameId) return;
  const map = readAll();
  delete map[gameId];
  writeAll(map);
}
