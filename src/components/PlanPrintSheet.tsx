import type { GamePlan, Player } from "../types";
import { FORMATION_231 } from "../types";
import { formatMinute, getPlayerById } from "../lib/substitutionEngine";
import { getBenchSubstitutions, getFieldShuffles } from "../lib/subDisplay";
import { slotLabel } from "../lib/planEdits";

interface Props {
  plan: GamePlan;
  players: Player[];
}

function playerLabel(players: Player[], id: string | null | undefined): string {
  if (!id) return "—";
  const p = getPlayerById(players, id);
  if (!p) return id;
  return `#${p.number} ${p.name}`;
}

export default function PlanPrintSheet({ plan, players }: Props) {
  const totalMinutes = plan.settings.halfMinutes * 2;
  const active = players.filter((p) => plan.activePlayerIds.includes(p.id));
  const minutes = plan.playerMinutes;

  const sortedByMinutes = [...active].sort(
    (a, b) => (minutes[a.id] ?? 0) - (minutes[b.id] ?? 0)
  );

  return (
    <div className="plan-print-sheet hidden bg-white text-black print:block">
      <header className="border-b-2 border-black pb-3">
        <h1 className="text-xl font-bold">U10 Game Plan — Lineup & Rotations</h1>
        <p className="mt-1 text-sm">
          {totalMinutes} min game · {plan.settings.segmentsPerHalf} rotations per half ·{" "}
          {plan.settings.subsPerRotation} subs per rotation · 2-3-1
        </p>
        <p className="text-xs text-gray-600">
          Printed {new Date().toLocaleString()}
        </p>
      </header>

      <section className="mt-4">
        <h2 className="text-sm font-bold uppercase tracking-wide">Projected playing time</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-400 text-left">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Player</th>
              <th className="py-1 pr-2 text-right">Projected</th>
              <th className="py-1 text-right">Target</th>
            </tr>
          </thead>
          <tbody>
            {sortedByMinutes.map((p) => (
              <tr key={p.id} className="border-b border-gray-200">
                <td className="py-1 pr-2 font-bold">{p.number}</td>
                <td className="py-1 pr-2">{p.name}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {(minutes[p.id] ?? 0).toFixed(1)}m
                </td>
                <td className="py-1 text-right tabular-nums">
                  {(plan.playerTargets[p.id] ?? plan.targetMinutes).toFixed(1)}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide">Rotation schedule</h2>
        {plan.segments.map((segment) => {
          const prevLineup =
            segment.segmentIndex > 0
              ? plan.segments[segment.segmentIndex - 1].lineup
              : segment.lineup;
          const benchSubs = getBenchSubstitutions(segment);
          const shuffles = getFieldShuffles(prevLineup, segment.lineup);

          return (
            <article
              key={segment.segmentIndex}
              className="break-inside-avoid border border-gray-400 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-300 pb-2">
                <h3 className="font-bold">
                  Half {segment.half} · Segment {segment.segmentInHalf}
                  {segment.segmentIndex === 0 && " — Starting XI"}
                </h3>
                <span className="text-sm tabular-nums">
                  {formatMinute(segment.startMinute)} – {formatMinute(segment.endMinute)}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold uppercase text-xs text-gray-600">On field</p>
                  <ul className="mt-1 space-y-0.5">
                    {FORMATION_231.map((slot) => (
                      <li key={slot.id}>
                        <span className="inline-block w-8 font-medium">{slot.label}</span>
                        {playerLabel(players, segment.lineup[slot.id])}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold uppercase text-xs text-gray-600">Bench</p>
                  <ul className="mt-1 space-y-0.5">
                    {segment.bench.length === 0 ? (
                      <li>—</li>
                    ) : (
                      segment.bench.map((id) => (
                        <li key={id}>{playerLabel(players, id)}</li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              {(benchSubs.length > 0 || shuffles.length > 0) && (
                <div className="mt-2 border-t border-gray-200 pt-2 text-sm">
                  <p className="font-semibold uppercase text-xs text-gray-600">
                    Substitutions
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {benchSubs.map((sub, i) => (
                      <li key={i}>
                        OUT {playerLabel(players, sub.outPlayerId)} → IN{" "}
                        {playerLabel(players, sub.inPlayerId)} ({slotLabel(sub.slotId)})
                      </li>
                    ))}
                    {shuffles.map((s) => (
                      <li key={s.playerId}>
                        {playerLabel(players, s.playerId)}: {slotLabel(s.fromSlotId)} →{" "}
                        {slotLabel(s.toSlotId)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

export function printGamePlan() {
  window.print();
}
