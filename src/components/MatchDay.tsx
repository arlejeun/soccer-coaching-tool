import { useEffect, useState } from "react";
import type { GamePlan, Player, SubstitutionRule } from "../types";
import {
  formatMinute,
  getCurrentSegment,
  getPlayerById,
} from "../lib/substitutionEngine";
import EditableSegmentLineup from "./EditableSegmentLineup";
import { getBenchSubstitutions, getFieldShuffles } from "../lib/subDisplay";
import { slotLabel } from "../lib/planEdits";
import {
  clearMatchClock,
  loadMatchClock,
  saveMatchClock,
} from "../lib/matchClock";
import { POSITION_COLORS } from "../types";

interface Props {
  players: Player[];
  plan: GamePlan | null;
  subRules: SubstitutionRule[];
  gameId?: string;
  gameTitle?: string;
  onPlanChange: (plan: GamePlan) => void;
  onBack: () => void;
}

export default function MatchDay({
  players,
  plan,
  subRules,
  gameId,
  gameTitle,
  onPlanChange,
  onBack,
}: Props) {
  const totalSeconds = plan ? plan.settings.halfMinutes * 2 * 60 : 0;
  const halfSeconds = plan ? plan.settings.halfMinutes * 60 : 0;

  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Restore clock when switching games (not on every plan edit).
  useEffect(() => {
    const restored = loadMatchClock(gameId, totalSeconds);
    setElapsedSeconds(restored.elapsedSeconds);
    setRunning(restored.running);
    setHydrated(true);
  }, [gameId, totalSeconds]);

  // Persist while the match is open (including mid-tick and pause).
  useEffect(() => {
    if (!hydrated || !gameId) return;
    saveMatchClock(gameId, { elapsedSeconds, running });
  }, [gameId, elapsedSeconds, running, hydrated]);

  useEffect(() => {
    if (!hydrated || !gameId) return;
    const persist = () =>
      saveMatchClock(gameId, { elapsedSeconds, running });
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [gameId, elapsedSeconds, running, hydrated]);

  const elapsedMinutes = elapsedSeconds / 60;

  useEffect(() => {
    if (!running || !plan) return;
    const id = setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 1;
        if (next >= totalSeconds) {
          setRunning(false);
          return totalSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, plan, totalSeconds]);

  useEffect(() => {
    if (plan && hydrated) {
      setSegmentIndex(getCurrentSegment(plan, elapsedMinutes));
    }
  }, [plan, elapsedMinutes, hydrated]);

  if (!plan) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-gray-600">Generate a substitution plan first.</p>
        <button onClick={onBack} className="mt-4 text-pitch underline">
          Go to Planner
        </button>
      </div>
    );
  }

  const segment = plan.segments[segmentIndex];
  const nextSegment = plan.segments[segmentIndex + 1];
  const currentHalf: 1 | 2 = elapsedSeconds < halfSeconds ? 1 : 2;
  const halfElapsed = currentHalf === 1 ? elapsedSeconds : elapsedSeconds - halfSeconds;
  const halfRemaining = halfSeconds - halfElapsed;
  const atFirst = segmentIndex <= 0;
  const atLast = segmentIndex >= plan.segments.length - 1;

  const goToSegment = (index: number) => {
    const clamped = Math.max(0, Math.min(index, plan.segments.length - 1));
    const target = plan.segments[clamped];
    setSegmentIndex(clamped);
    setElapsedSeconds(Math.round(target.startMinute * 60));
  };

  const handleReset = () => {
    setRunning(false);
    setElapsedSeconds(0);
    setSegmentIndex(0);
    clearMatchClock(gameId);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-pitch p-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            {gameTitle && (
              <p className="mb-1 text-xs font-medium opacity-90">{gameTitle}</p>
            )}
            <p className="text-xs uppercase tracking-wide opacity-80">Match Clock</p>
            <p className="text-4xl font-bold tabular-nums">
              {formatMinute(elapsedMinutes)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide opacity-80">
              Half {currentHalf}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMinute(halfRemaining / 60)} left
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setRunning(!running)}
            className="flex-1 rounded-lg bg-white py-3 font-bold text-pitch"
          >
            {running ? "Pause" : elapsedSeconds > 0 ? "Resume" : "Start Match"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg bg-pitch-dark px-4 py-3 font-medium"
          >
            Reset
          </button>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-pitch-dark">
          <div
            className="h-full bg-white transition-all"
            style={{ width: `${(elapsedSeconds / totalSeconds) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-center text-[11px] text-white/70">
          Clock is saved for this game — reload keeps your place.
        </p>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">On Field Now</h2>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Half {segment.half} · Seg {segment.segmentInHalf} · {segmentIndex + 1}/
            {plan.segments.length}
          </span>
        </div>
        <EditableSegmentLineup
          plan={plan}
          segmentIndex={segmentIndex}
          players={players}
          subRules={subRules}
          onPlanChange={onPlanChange}
        />
      </div>

      {nextSegment &&
        (() => {
          const prevLineup = plan.segments[nextSegment.segmentIndex - 1]?.lineup ?? {};
          const benchSubs = getBenchSubstitutions(nextSegment);
          const shuffles = getFieldShuffles(prevLineup, nextSegment.lineup);
          if (benchSubs.length === 0 && shuffles.length === 0) return null;
          return (
            <div className="rounded-xl border-2 border-yellow-400 bg-yellow-50 p-4">
              <h3 className="font-bold text-yellow-900">
                Next Subs @ {formatMinute(nextSegment.startMinute)}
                {benchSubs.length > 0 && (
                  <span className="ml-1 text-sm font-normal">
                    ({benchSubs.length} bench swap{benchSubs.length !== 1 ? "s" : ""})
                  </span>
                )}
              </h3>
              <ul className="mt-2 space-y-2">
                {benchSubs.map((sub, i) => {
                  const out = getPlayerById(players, sub.outPlayerId);
                  const inn = getPlayerById(players, sub.inPlayerId);
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                    >
                      <span className="text-red-600">
                        OUT: #{out?.number} {out?.name.split(" ")[0]}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-green-700">
                        IN: #{inn?.number} {inn?.name.split(" ")[0]}
                      </span>
                    </li>
                  );
                })}
                {shuffles.map((shuffle) => {
                  const p = getPlayerById(players, shuffle.playerId);
                  if (!p) return null;
                  return (
                    <li
                      key={shuffle.playerId}
                      className="rounded-lg bg-yellow-100/60 px-3 py-2 text-xs text-yellow-900"
                    >
                      ⇄ #{p.number} {p.name.split(" ")[0]} · {slotLabel(shuffle.fromSlotId)} →{" "}
                      {slotLabel(shuffle.toSlotId)}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <h3 className="mb-2 font-semibold">Bench</h3>
        <div className="grid grid-cols-2 gap-2">
          {segment.bench.map((id) => {
            const p = getPlayerById(players, id);
            if (!p) return null;
            return (
              <div
                key={id}
                className={`rounded-lg border px-3 py-2 ${POSITION_COLORS[p.primaryPosition]}`}
              >
                <span className="font-bold">#{p.number}</span> {p.name.split(" ")[0]}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={atFirst}
          onClick={() => goToSegment(segmentIndex - 1)}
          className="rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous rotation
        </button>
        <button
          type="button"
          disabled={atLast}
          onClick={() => goToSegment(segmentIndex + 1)}
          className="rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next rotation →
        </button>
      </div>
      <p className="text-center text-xs text-gray-500">
        Jumping also moves the match clock to that rotation.
      </p>
    </div>
  );
}
