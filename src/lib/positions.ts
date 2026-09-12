import type { Player, Position } from "../types";

/** Adjacent positions a player can cover when needed. MID is the hub. */
const ADJACENT: Record<Position, Position[]> = {
  GK: [],
  DEF: ["MID"],
  MID: ["DEF", "ST"],
  ST: ["MID"],
};

export function canPlayGoalkeeper(player: Player): boolean {
  return player.primaryPosition === "GK" || player.secondaryPosition === "GK";
}

export function getGoalkeeperCandidates(players: Player[]): Player[] {
  return players.filter(canPlayGoalkeeper);
}

export function canPlayPosition(player: Player, position: Position): boolean {
  return positionFit(player, position) > 0;
}

/** 2 = primary, 1 = secondary or adjacent (MID↔ST, DEF↔MID), 0 = no. */
export function positionFit(player: Player, position: Position): number {
  if (player.primaryPosition === position) return 2;
  if (player.secondaryPosition === position) return 1;
  if (position !== "GK" && ADJACENT[player.primaryPosition].includes(position)) {
    return 1;
  }
  return 0;
}
