import type { GamePlan, GameSettings, Player, PlayerCoachingInput, PlayerAvailability, SubstitutionRule } from "../types";
import {
  formatMinute,
  calculatePlayerMinutesFromPlan,
  generateGamePlan,
  getGoalkeeperCandidates,
  getPlayerById,
  validateRoster,
} from "../lib/substitutionEngine";
import { computePlayerTargets } from "../lib/coachingScore";
import { applyStartingLineupChange } from "../lib/planEdits";
import { getAvailablePlayers } from "../lib/availability";
import GameDayAvailability from "./GameDayAvailability";
import SubstitutionRulesEditor from "./SubstitutionRulesEditor";
import EditableSubstitution from "./EditableSubstitution";
import EditableSegmentLineup from "./EditableSegmentLineup";
import PlanPrintSheet, { printGamePlan } from "./PlanPrintSheet";
import { POSITION_COLORS } from "../types";
import { ABSENCE_REASON_LABELS } from "../lib/availability";
import { benchSubIndex, getBenchSubstitutions, getFieldShuffles } from "../lib/subDisplay";
import { slotLabel } from "../lib/planEdits";
import { useEffect, useMemo, useState } from "react";

interface Props {
  players: Player[];
  settings: GameSettings;
  coachingProfiles: Record<string, PlayerCoachingInput>;
  availability: Record<string, PlayerAvailability>;
  subRules: SubstitutionRule[];
  plan: GamePlan | null;
  onSettingsChange: (settings: GameSettings) => void;
  onAvailabilityChange: (availability: Record<string, PlayerAvailability>) => void;
  onSubRulesChange: (rules: SubstitutionRule[]) => void;
  onPlanChange: (plan: GamePlan) => void;
}

export default function GamePlanner({
  players,
  settings,
  coachingProfiles,
  availability,
  subRules,
  plan,
  onSettingsChange,
  onAvailabilityChange,
  onSubRulesChange,
  onPlanChange,
}: Props) {
  const availablePlayers = getAvailablePlayers(players, availability);
  const gkCandidates = getGoalkeeperCandidates(availablePlayers);
  const warnings = validateRoster(availablePlayers, { forGameDay: true });
  const blocking = availablePlayers.length < 7;
  const totalMinutes = settings.halfMinutes * 2;

  const handleGenerate = (
    overrides: Record<string, number> = plan?.manualTargetOverrides ?? {},
    options?: { preserveStartingLineup?: boolean }
  ) => {
    const generated = generateGamePlan(
      players,
      settings,
      coachingProfiles,
      availability,
      subRules,
      overrides
    );

    if (
      options?.preserveStartingLineup &&
      plan?.manualSegments?.includes(0) &&
      plan.segments[0]
    ) {
      onPlanChange(
        applyStartingLineupChange(
          { ...generated, manualTargetOverrides: overrides },
          plan.segments[0].lineup,
          players,
          subRules
        )
      );
      return;
    }

    onPlanChange({
      ...generated,
      manualTargetOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      manualSegments: [],
    });
  };

  return (
    <>
    <div className="space-y-4 print:hidden">
      <GameDayAvailability
        players={players}
        availability={availability}
        onChange={onAvailabilityChange}
      />

      <SubstitutionRulesEditor
        players={availablePlayers}
        rules={subRules}
        onChange={onSubRulesChange}
      />

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-lg font-semibold">Game Settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          {availablePlayers.length} players today · {totalMinutes} min game · Merit{" "}
          {settings.meritInfluence}%
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Half length (min)</span>
            <input
              type="number"
              min={10}
              max={45}
              value={settings.halfMinutes}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  halfMinutes: Number(e.target.value),
                })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Rotations per half</span>
            <select
              value={settings.segmentsPerHalf}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  segmentsPerHalf: Number(e.target.value),
                })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value={1}>1 (half-time only)</option>
              <option value={2}>2 (quarters)</option>
              <option value={3}>3</option>
              <option value={4}>4 (every ~6 min in 25-min half)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Subs per rotation</span>
            <select
              value={settings.subsPerRotation}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  subsPerRotation: Number(e.target.value),
                })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value={1}>1 player</option>
              <option value={2}>2 players</option>
              <option value={3}>3 players</option>
              <option value={4}>4 players (full bench swap)</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">1st half keeper</span>
            <select
              value={settings.firstHalfKeeperId ?? ""}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  firstHalfKeeperId: e.target.value || undefined,
                })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Auto (best GK on roster)</option>
              {gkCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name.split(" ")[0]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">2nd half keeper</span>
            <select
              value={settings.secondHalfKeeperId ?? ""}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  secondHalfKeeperId: e.target.value || undefined,
                })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Same keeper all game</option>
              {gkCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name.split(" ")[0]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {gkCandidates.length < 2 && (
          <p className="mt-2 text-sm text-orange-700">
            Assign a secondary GK on the Roster tab to rotate keepers at half-time.
          </p>
        )}

        <p className="mt-2 text-sm text-gray-600">
          No back-to-back bench stints — after sitting one rotation, a player is subbed in
          on the next break.
        </p>

        {warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}

        <button
          onClick={() => handleGenerate()}
          disabled={blocking}
          className="mt-4 w-full rounded-xl bg-pitch px-4 py-3 font-semibold text-white transition hover:bg-pitch-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generate Substitution Plan
        </button>
      </div>

      {plan && (plan.unavailablePlayerIds?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <h3 className="font-semibold text-orange-900">Not in today&apos;s plan</h3>
          <ul className="mt-2 space-y-1 text-sm text-orange-800">
            {(plan.unavailablePlayerIds ?? []).map((id) => {
              const p = getPlayerById(players, id);
              const status = availability[id];
              if (!p) return null;
              return (
                <li key={id}>
                  #{p.number} {p.name}
                  {status?.reason && ` — ${ABSENCE_REASON_LABELS[status.reason]}`}
                  {status?.note && ` (${status.note})`}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {plan && (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onPlanChange({
                  ...plan,
                  playerMinutes: calculatePlayerMinutesFromPlan(plan),
                });
                printGamePlan();
              }}
              className="flex-1 rounded-xl border-2 border-pitch bg-white px-4 py-3 text-sm font-semibold text-pitch transition hover:bg-green-50"
            >
              Print lineup & rotations
            </button>
          </div>

          <MinutesTable
            plan={plan}
            players={players.filter((p) =>
              (plan.activePlayerIds ?? players.map((x) => x.id)).includes(p.id)
            )}
            coachingProfiles={coachingProfiles}
            onRegenerate={(overrides) =>
              handleGenerate(overrides, {
                preserveStartingLineup: plan.manualSegments?.includes(0),
              })
            }
            onRecalculateMinutes={() =>
              onPlanChange({
                ...plan,
                playerMinutes: calculatePlayerMinutesFromPlan(plan),
              })
            }
          />

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Rotation Schedule</h3>
            {plan.segments.map((segment) => {
              const prevLineup =
                segment.segmentIndex > 0
                  ? plan.segments[segment.segmentIndex - 1].lineup
                  : segment.lineup;
              const benchSubs = getBenchSubstitutions(segment);
              const fieldShuffles = getFieldShuffles(prevLineup, segment.lineup);

              return (
              <div
                key={segment.segmentIndex}
                className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="rounded-full bg-pitch px-2 py-0.5 text-xs font-bold text-white">
                      Half {segment.half} · Segment {segment.segmentInHalf}
                    </span>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatMinute(segment.startMinute)} – {formatMinute(segment.endMinute)}
                    </p>
                  </div>
                  {segment.segmentIndex === 0 && (
                    <span className="text-xs font-medium text-green-700">Starting XI</span>
                  )}
                  {plan.manualSegments?.includes(segment.segmentIndex) && (
                    <span className="text-xs font-medium text-blue-700">Edited</span>
                  )}
                </div>

                {(benchSubs.length > 0 || fieldShuffles.length > 0) && (
                  <div className="mt-3 rounded-lg bg-yellow-50 p-3">
                    <p className="text-xs font-semibold uppercase text-yellow-800">
                      Substitutions
                      {benchSubs.length > 0 && (
                        <span className="ml-1 font-normal normal-case text-yellow-700">
                          · {benchSubs.length} bench swap{benchSubs.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {benchSubs.map((sub) => {
                        const subIndex = benchSubIndex(segment, sub);
                        return (
                        <EditableSubstitution
                          key={`${segment.segmentIndex}-${subIndex}`}
                          plan={plan}
                          segmentIndex={segment.segmentIndex}
                          sub={sub}
                          subIndex={subIndex}
                          players={players}
                          subRules={subRules}
                          onPlanChange={onPlanChange}
                        />
                        );
                      })}
                      {fieldShuffles.map((shuffle) => {
                        const p = getPlayerById(players, shuffle.playerId);
                        if (!p) return null;
                        return (
                          <li
                            key={`shuffle-${shuffle.playerId}`}
                            className="flex flex-wrap items-center gap-2 rounded-lg bg-yellow-100/60 px-2 py-1.5 text-yellow-900"
                          >
                            <span className="text-xs">
                              ⇄ #{p.number} {p.name.split(" ")[0]} moved{" "}
                              {slotLabel(shuffle.fromSlotId)} → {slotLabel(shuffle.toSlotId)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <EditableSegmentLineup
                      plan={plan}
                      segmentIndex={segment.segmentIndex}
                      players={players}
                      subRules={subRules}
                      onPlanChange={onPlanChange}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Bench</p>
                    <ul className="space-y-1">
                      {segment.bench.map((id) => {
                        const p = getPlayerById(players, id);
                        if (!p) return null;
                        return (
                          <li
                            key={id}
                            className={`rounded-lg border px-2 py-1.5 text-sm ${POSITION_COLORS[p.primaryPosition]}`}
                          >
                            #{p.number} {p.name.split(" ")[0]}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}

      {!plan && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
          Configure settings and generate a plan to see the full rotation schedule.
        </div>
      )}
    </div>

    {plan && (
      <PlanPrintSheet
        plan={plan}
        players={players.filter((p) =>
          (plan.activePlayerIds ?? players.map((x) => x.id)).includes(p.id)
        )}
      />
    )}
    </>
  );
}

function MinutesTable({
  plan,
  players,
  coachingProfiles,
  onRegenerate,
  onRecalculateMinutes,
}: {
  plan: GamePlan;
  players: Player[];
  coachingProfiles: Record<string, PlayerCoachingInput>;
  onRegenerate: (overrides: Record<string, number>) => void;
  onRecalculateMinutes: () => void;
}) {
  const totalMinutes = plan.settings.halfMinutes * 2;
  const coachingTargets = useMemo(
    () =>
      computePlayerTargets(
        plan.activePlayerIds,
        coachingProfiles,
        plan.settings,
        totalMinutes
      ),
    [plan.activePlayerIds, coachingProfiles, plan.settings, totalMinutes]
  );

  const [draftTargets, setDraftTargets] = useState<Record<string, number>>(() => ({
    ...plan.playerTargets,
  }));

  useEffect(() => {
    setDraftTargets({ ...plan.playerTargets });
  }, [plan.playerTargets]);

  const sorted = [...players].sort(
    (a, b) => (plan.playerMinutes[a.id] ?? 0) - (plan.playerMinutes[b.id] ?? 0)
  );
  const maxMin = Math.max(...Object.values(plan.playerMinutes));
  const minMin = Math.min(...Object.values(plan.playerMinutes));

  const hasTargetChanges = plan.activePlayerIds.some(
    (id) => Math.abs((draftTargets[id] ?? 0) - (plan.playerTargets[id] ?? 0)) >= 0.5
  );

  const buildOverrides = (targets: Record<string, number>) => {
    const overrides: Record<string, number> = {};
    for (const id of plan.activePlayerIds) {
      const coaching = coachingTargets[id] ?? plan.targetMinutes;
      const target = targets[id] ?? plan.playerTargets[id];
      if (Math.abs(target - coaching) >= 0.5) {
        overrides[id] = target;
      }
    }
    return overrides;
  };

  const setTarget = (playerId: string, raw: string) => {
    const parsed = Number(raw);
    if (raw === "" || Number.isNaN(parsed)) return;
    const rounded = Math.round(Math.max(0, Math.min(totalMinutes, parsed)) * 10) / 10;
    setDraftTargets((prev) => ({ ...prev, [playerId]: rounded }));
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Projected Playing Time</h3>
          <p className="text-sm text-gray-600">
            Spread: {(maxMin - minMin).toFixed(1)} min · Left bar = projected · Target = goal
          </p>
        </div>
        <button
          type="button"
          onClick={onRecalculateMinutes}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Calculate from plan
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {sorted.map((p) => {
          const projected = plan.playerMinutes[p.id] ?? 0;
          const target = draftTargets[p.id] ?? plan.playerTargets[p.id] ?? plan.targetMinutes;
          const coaching = coachingTargets[p.id] ?? plan.targetMinutes;
          const isOverridden = Math.abs(target - coaching) >= 0.5;
          const pct = (projected / totalMinutes) * 100;
          const diff = projected - target;
          return (
            <li key={p.id} className="flex items-center gap-2">
              <span className="w-8 text-sm font-bold text-pitch">#{p.number}</span>
              <span className="w-20 truncate text-sm">{p.name.split(" ")[0]}</span>
              <div className="min-w-0 flex-1">
                <div className="relative h-3 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="absolute top-0 h-full w-0.5 bg-gray-400"
                    style={{ left: `${(target / totalMinutes) * 100}%` }}
                    title={`Target: ${target.toFixed(1)}m`}
                  />
                  <div
                    className="h-full rounded-full bg-pitch-light transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="w-12 text-right text-sm font-medium tabular-nums">
                {projected.toFixed(1)}m
              </span>
              <label className="flex w-16 flex-col items-end">
                <input
                  type="number"
                  min={0}
                  max={totalMinutes}
                  step={0.5}
                  value={target}
                  onChange={(e) => setTarget(p.id, e.target.value)}
                  className={`w-full rounded border px-1 py-0.5 text-right text-xs tabular-nums ${
                    isOverridden
                      ? "border-blue-400 bg-blue-50 font-medium"
                      : "border-gray-300"
                  }`}
                  title={`Coaching target: ${coaching.toFixed(1)}m`}
                />
                <span className="text-[10px] text-gray-400">tgt</span>
              </label>
              <span
                className={`w-11 text-right text-xs tabular-nums ${
                  Math.abs(diff) <= 2 ? "text-green-600" : "text-orange-600"
                }`}
              >
                {diff >= 0 ? "+" : ""}
                {diff.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => onRegenerate(buildOverrides(draftTargets))}
        disabled={!hasTargetChanges}
        className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {hasTargetChanges ? "Apply targets & rebuild rotations" : "Edit targets above to rebuild"}
      </button>

      {Object.keys(plan.manualTargetOverrides ?? {}).length > 0 && (
        <button
          type="button"
          onClick={() => {
            setDraftTargets({ ...coachingTargets });
            onRegenerate({});
          }}
          className="mt-2 w-full text-xs text-gray-500 underline hover:text-gray-700"
        >
          Reset targets to coaching scores
        </button>
      )}
    </div>
  );
}
