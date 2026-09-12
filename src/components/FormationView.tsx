import type { FormationSlot, Player } from "../types";
import { FORMATION_231, POSITION_COLORS } from "../types";
import { getPlayerById } from "../lib/substitutionEngine";

interface Props {
  lineup: Record<string, string | null>;
  players: Player[];
  compact?: boolean;
}

export default function FormationView({ lineup, players, compact }: Props) {
  const getPlayer = (slotId: string) => {
    const id = lineup[slotId];
    return id ? getPlayerById(players, id) : null;
  };

  return (
    <div
      className={`relative mx-auto overflow-hidden rounded-2xl bg-gradient-to-b from-pitch-light to-pitch shadow-inner ${compact ? "max-w-xs" : "max-w-md"}`}
      style={{ aspectRatio: "3/4" }}
    >
      <div className="absolute inset-0 opacity-20">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" />
      </div>

      <div className="relative flex h-full flex-col justify-between p-3">
        <PlayerBubble slot={FORMATION_231[6]} player={getPlayer("st")} compact={compact} />

        <div className="flex justify-center gap-2 sm:gap-4">
          {(["m1", "m2", "m3"] as const).map((id) => (
            <PlayerBubble
              key={id}
              slot={FORMATION_231.find((s) => s.id === id)!}
              player={getPlayer(id)}
              compact={compact}
            />
          ))}
        </div>

        <div className="flex justify-center gap-8">
          {(["d1", "d2"] as const).map((id) => (
            <PlayerBubble
              key={id}
              slot={FORMATION_231.find((s) => s.id === id)!}
              player={getPlayer(id)}
              compact={compact}
            />
          ))}
        </div>

        <div className="flex justify-center">
          <PlayerBubble slot={FORMATION_231[0]} player={getPlayer("gk")} compact={compact} />
        </div>
      </div>
    </div>
  );
}

function PlayerBubble({
  slot,
  player,
  compact,
}: {
  slot: FormationSlot;
  player: Player | null | undefined;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`flex flex-col items-center rounded-full border-2 bg-white shadow-md ${compact ? "h-14 w-14" : "h-16 w-16"} ${player ? "border-white" : "border-dashed border-white/60 bg-white/30"}`}
      >
        {player ? (
          <>
            <span className={`font-bold text-pitch ${compact ? "text-sm" : "text-base"}`}>
              {player.number}
            </span>
            <span className={`max-w-[3.5rem] truncate text-center text-[10px] leading-tight text-gray-700 ${compact ? "hidden" : ""}`}>
              {player.name.split(" ")[0]}
            </span>
          </>
        ) : (
          <span className="text-xs text-white/80">{slot.label}</span>
        )}
      </div>
      <span
        className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${POSITION_COLORS[slot.position]}`}
      >
        {slot.label}
      </span>
    </div>
  );
}
