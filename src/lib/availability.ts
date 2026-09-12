import type { Player, PlayerAvailability } from "../types";

export function isPlayerAvailable(
  availability: Record<string, PlayerAvailability>,
  playerId: string
): boolean {
  return availability[playerId]?.available !== false;
}

export function getAvailablePlayers(
  players: Player[],
  availability: Record<string, PlayerAvailability>
): Player[] {
  return players.filter((p) => isPlayerAvailable(availability, p.id));
}

export function getUnavailablePlayers(
  players: Player[],
  availability: Record<string, PlayerAvailability>
): Player[] {
  return players.filter((p) => !isPlayerAvailable(availability, p.id));
}

export function setPlayerAvailability(
  availability: Record<string, PlayerAvailability>,
  playerId: string,
  patch: Partial<PlayerAvailability>
): Record<string, PlayerAvailability> {
  const current = availability[playerId] ?? { available: true };
  return {
    ...availability,
    [playerId]: { ...current, ...patch },
  };
}

export function markAllAvailable(
  players: Player[]
): Record<string, PlayerAvailability> {
  return Object.fromEntries(players.map((p) => [p.id, { available: true }]));
}

export const ABSENCE_REASON_LABELS: Record<
  NonNullable<PlayerAvailability["reason"]>,
  string
> = {
  injured: "Injured",
  absent: "Absent",
  other: "Out",
};
