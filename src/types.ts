export type Position = "GK" | "DEF" | "MID" | "ST";

export interface Player {
  id: string;
  number: number;
  name: string;
  birthYear: number;
  primaryPosition: Position;
  secondaryPosition?: Position;
}

export interface FormationSlot {
  id: string;
  position: Position;
  label: string;
}

export const FORMATION_231: FormationSlot[] = [
  { id: "gk", position: "GK", label: "GK" },
  { id: "d1", position: "DEF", label: "D1" },
  { id: "d2", position: "DEF", label: "D2" },
  { id: "m1", position: "MID", label: "M1" },
  { id: "m2", position: "MID", label: "M2" },
  { id: "m3", position: "MID", label: "M3" },
  { id: "st", position: "ST", label: "ST" },
];

export interface GameSettings {
  halfMinutes: number;
  segmentsPerHalf: number;
  subsPerRotation: number;
  /** 0 = equal time for all, 100 = fully merit-weighted */
  meritInfluence: number;
  /** Player id in goal for 1st half (must have GK primary or secondary) */
  firstHalfKeeperId?: string;
  /** Player id in goal for 2nd half — swapped at half-time */
  secondHalfKeeperId?: string;
  /** Max segments on bench in a row before player must come in (1 = never sit 2 in a row) */
  maxConsecutiveBenchRotations: number;
}

/** Coach ratings that influence target playing time (1 = low, 5 = high). */
export interface PlayerCoachingInput {
  /** Practice attendance + effort/hustle at training */
  practice: number;
  /** Match / game performance and skill shown */
  performance: number;
  behavior: number;
  notes?: string;
}

export const DEFAULT_COACHING_INPUT: PlayerCoachingInput = {
  practice: 3,
  performance: 3,
  behavior: 3,
};

export interface SegmentAssignment {
  segmentIndex: number;
  half: 1 | 2;
  segmentInHalf: number;
  startMinute: number;
  endMinute: number;
  lineup: Record<string, string | null>;
  bench: string[];
  substitutions: Substitution[];
}

export interface Substitution {
  outPlayerId: string;
  inPlayerId: string;
  slotId: string;
  position: Position;
}

/** Coach constraints applied when generating rotations. */
export type SubstitutionRule =
  | {
      id: string;
      type: "notSubbedTogether";
      playerIds: string[];
      label?: string;
    }
  | {
      id: string;
      type: "notDefendTogether";
      playerA: string;
      playerB: string;
      label?: string;
    }
  | {
      id: string;
      type: "notOnFieldTogether";
      playerA: string;
      playerB: string;
      label?: string;
    };

export type AbsenceReason = "injured" | "absent" | "other";

/** Per-game availability; omitted or available=true means player is in. */
export interface PlayerAvailability {
  available: boolean;
  reason?: AbsenceReason;
  note?: string;
}

export interface GamePlan {
  settings: GameSettings;
  segments: SegmentAssignment[];
  playerMinutes: Record<string, number>;
  /** Per-player target minutes (merit-weighted, or coach override). */
  playerTargets: Record<string, number>;
  /** Coach-set target overrides keyed by player id. */
  manualTargetOverrides?: Record<string, number>;
  targetMinutes: number;
  activePlayerIds: string[];
  unavailablePlayerIds: string[];
  /** Segment indices with coach-edited substitutions */
  manualSegments?: number[];
}

export interface AppState {
  players: Player[];
  settings: GameSettings;
  currentPlan: GamePlan | null;
  activeSegmentIndex: number;
  gameStarted: boolean;
  elapsedSeconds: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  halfMinutes: 25,
  segmentsPerHalf: 2,
  subsPerRotation: 2,
  meritInfluence: 50,
  maxConsecutiveBenchRotations: 1,
};

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfield",
  ST: "Striker",
};

export const POSITION_COLORS: Record<Position, string> = {
  GK: "bg-amber-100 text-amber-900 border-amber-300",
  DEF: "bg-blue-100 text-blue-900 border-blue-300",
  MID: "bg-green-100 text-green-900 border-green-300",
  ST: "bg-red-100 text-red-900 border-red-300",
};
