import type { Player, PlayerAvailability } from "../types";
import {
  ABSENCE_REASON_LABELS,
  setPlayerAvailability,
} from "../lib/availability";
import { POSITION_COLORS } from "../types";

interface Props {
  players: Player[];
  availability: Record<string, PlayerAvailability>;
  onChange: (availability: Record<string, PlayerAvailability>) => void;
}

export default function GameDayAvailability({
  players,
  availability,
  onChange,
}: Props) {
  const availableCount = players.filter(
    (p) => availability[p.id]?.available !== false
  ).length;
  const outCount = players.length - availableCount;

  const toggleAvailable = (playerId: string) => {
    const current = availability[playerId]?.available !== false;
    onChange(
      setPlayerAvailability(availability, playerId, {
        available: !current,
        reason: !current ? undefined : availability[playerId]?.reason ?? "injured",
      })
    );
  };

  const markOut = (
    playerId: string,
    reason: NonNullable<PlayerAvailability["reason"]>
  ) => {
    onChange(
      setPlayerAvailability(availability, playerId, {
        available: false,
        reason,
      })
    );
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Availability</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mark injured or absent players before generating the plan.
          </p>
        </div>
        <span className="rounded-full bg-pitch px-2.5 py-1 text-xs font-bold text-white">
          {availableCount} available
        </span>
      </div>

      {outCount > 0 && (
        <p className="mt-2 text-sm text-orange-700">
          {outCount} player{outCount !== 1 ? "s" : ""} excluded — plan uses{" "}
          {availableCount} players only.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {players.map((player) => {
          const status = availability[player.id] ?? { available: true };
          const isAvailable = status.available !== false;

          return (
            <li
              key={player.id}
              className={`rounded-lg border p-3 transition ${
                isAvailable
                  ? "border-gray-200 bg-white"
                  : "border-orange-200 bg-orange-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleAvailable(player.id)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg transition ${
                    isAvailable
                      ? "bg-pitch text-white"
                      : "bg-orange-200 text-orange-800"
                  }`}
                  aria-label={isAvailable ? "Mark unavailable" : "Mark available"}
                >
                  {isAvailable ? "✓" : "✕"}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium ${isAvailable ? "text-gray-900" : "text-orange-900 line-through decoration-orange-400"}`}
                  >
                    #{player.number} {player.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {isAvailable ? "Available" : ABSENCE_REASON_LABELS[status.reason ?? "other"]}
                  </p>
                </div>

                <span
                  className={`rounded px-2 py-0.5 text-xs ${POSITION_COLORS[player.primaryPosition]}`}
                >
                  {player.primaryPosition}
                </span>
              </div>

              {!isAvailable && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["injured", "absent", "other"] as const).map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => markOut(player.id, reason)}
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${
                        status.reason === reason
                          ? "bg-orange-600 text-white"
                          : "bg-white text-orange-800 ring-1 ring-orange-200"
                      }`}
                    >
                      {ABSENCE_REASON_LABELS[reason]}
                    </button>
                  ))}
                </div>
              )}

              {!isAvailable && (
                <input
                  type="text"
                  value={status.note ?? ""}
                  onChange={(e) =>
                    onChange(
                      setPlayerAvailability(availability, player.id, {
                        note: e.target.value,
                      })
                    )
                  }
                  placeholder="Optional note — e.g. ankle sprain"
                  className="mt-2 w-full rounded-lg border border-orange-200 px-3 py-1.5 text-sm"
                />
              )}
            </li>
          );
        })}
      </ul>

      {outCount > 0 && (
        <button
          type="button"
          onClick={() =>
            onChange(Object.fromEntries(players.map((p) => [p.id, { available: true }])))
          }
          className="mt-3 text-sm font-medium text-pitch underline"
        >
          Reset — mark everyone available
        </button>
      )}
    </div>
  );
}
