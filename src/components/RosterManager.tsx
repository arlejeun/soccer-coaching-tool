import type { Player, Position } from "../types";
import { POSITION_COLORS, POSITION_LABELS } from "../types";
import { canPlayPosition } from "../lib/positions";

interface Props {
  players: Player[];
  onUpdate: (players: Player[]) => void;
}

const POSITIONS: Position[] = ["GK", "DEF", "MID", "ST"];

export default function RosterManager({ players, onUpdate }: Props) {
  const updatePlayer = (id: string, patch: Partial<Player>) => {
    onUpdate(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Team Roster</h2>
        <p className="mt-1 text-sm text-gray-600">
          Set primary and secondary positions. Use secondary GK for your 2nd-half keeper.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <ul className="divide-y divide-gray-100">
          {players.map((player) => (
            <li key={player.id} className="space-y-2 px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-pitch">#{player.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{player.name}</p>
                  <p className="text-xs text-gray-500">Born {player.birthYear}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <PositionSelect
                  label="Primary"
                  value={player.primaryPosition}
                  onChange={(pos) =>
                    updatePlayer(player.id, {
                      primaryPosition: pos,
                      secondaryPosition:
                        player.secondaryPosition === pos
                          ? undefined
                          : player.secondaryPosition,
                    })
                  }
                />
                <PositionSelect
                  label="Secondary"
                  value={player.secondaryPosition}
                  allowEmpty
                  onChange={(pos) =>
                    updatePlayer(player.id, {
                      secondaryPosition: pos,
                    })
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <PositionSummary players={players} />
    </div>
  );
}

function PositionSelect({
  label,
  value,
  allowEmpty,
  onChange,
}: {
  label: string;
  value?: Position;
  allowEmpty?: boolean;
  onChange: (pos: Position | undefined) => void;
}) {
  const display = value ?? (allowEmpty ? "" : "MID");

  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <select
        value={display}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v ? (v as Position) : undefined);
        }}
        className={`mt-1 w-full rounded-lg border px-2 py-2 text-sm font-medium ${
          value ? POSITION_COLORS[value] : "bg-gray-50 text-gray-500"
        }`}
      >
        {allowEmpty && <option value="">— None —</option>}
        {POSITIONS.map((pos) => (
          <option key={pos} value={pos}>
            {POSITION_LABELS[pos]}
          </option>
        ))}
      </select>
    </label>
  );
}

function PositionSummary({ players }: { players: Player[] }) {
  const counts = POSITIONS.reduce(
    (acc, pos) => {
      acc[pos] = players.filter((p) => canPlayPosition(p, pos)).length;
      return acc;
    },
    {} as Record<Position, number>
  );

  const needed: Record<Position, number> = { GK: 1, DEF: 2, MID: 3, ST: 1 };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {POSITIONS.map((pos) => {
        const ok = counts[pos] >= needed[pos];
        return (
          <div
            key={pos}
            className={`rounded-lg border px-3 py-2 text-center text-sm ${POSITION_COLORS[pos]} ${ok ? "" : "ring-2 ring-orange-400"}`}
          >
            <p className="font-semibold">{POSITION_LABELS[pos]}</p>
            <p>
              {counts[pos]} can play · {needed[pos]}+ needed
            </p>
          </div>
        );
      })}
    </div>
  );
}
