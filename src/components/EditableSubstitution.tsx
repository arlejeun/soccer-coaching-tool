import { useState } from "react";
import type { GamePlan, Player, Substitution, SubstitutionRule } from "../types";
import { POSITION_COLORS } from "../types";
import {
  applyManualSubChange,
  checkSubWarnings,
  findOtherSubUsingInPlayer,
  getSubInCandidates,
  getSubInCandidateHint,
  slotLabel,
  subInCandidateLabel,
} from "../lib/planEdits";
import { getPlayerById } from "../lib/substitutionEngine";

interface Props {
  plan: GamePlan;
  segmentIndex: number;
  sub: Substitution;
  subIndex: number;
  players: Player[];
  subRules: SubstitutionRule[];
  onPlanChange: (plan: GamePlan) => void;
}

export default function EditableSubstitution({
  plan,
  segmentIndex,
  sub,
  subIndex,
  players,
  subRules,
  onPlanChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [inPlayerId, setInPlayerId] = useState(sub.inPlayerId);
  const isManual = plan.manualSegments?.includes(segmentIndex);

  const out = getPlayerById(players, sub.outPlayerId);
  const inn = getPlayerById(players, sub.inPlayerId);
  const candidates = getSubInCandidates(plan, segmentIndex, subIndex, players);
  const candidateHint = getSubInCandidateHint(plan, segmentIndex, subIndex);

  const previewPlan = editing
    ? applyManualSubChange(plan, segmentIndex, subIndex, inPlayerId, players, subRules)
    : plan;
  const warnings = editing
    ? checkSubWarnings(previewPlan, segmentIndex, subRules, (id) => {
        const p = getPlayerById(players, id);
        return p ? p.name.split(" ")[0] : id;
      })
    : [];

  const handleSave = () => {
    if (!inPlayerId || subIndex < 0) return;
    onPlanChange(applyManualSubChange(plan, segmentIndex, subIndex, inPlayerId, players, subRules));
    setEditing(false);
  };

  if (!editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5">
        <span className="text-red-600">
          ↓ #{out?.number} {out?.name.split(" ")[0]}
        </span>
        <span className="text-gray-400">→</span>
        <span className="text-green-700">
          ↑ #{inn?.number} {inn?.name.split(" ")[0]}
        </span>
        <span className={`rounded px-1 text-xs ${POSITION_COLORS[sub.position]}`}>
          {slotLabel(sub.slotId)}
        </span>
        {isManual && (
          <span className="rounded bg-blue-100 px-1.5 text-[10px] font-medium text-blue-800">
            edited
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setInPlayerId(sub.inPlayerId);
            setEditing(true);
          }}
          className="ml-auto text-xs font-medium text-pitch underline"
        >
          Swap
        </button>
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-lg border border-pitch bg-white p-3">
      <p className="text-xs font-semibold text-gray-700">
        Manual swap · {slotLabel(sub.slotId)} · OUT #{out?.number} {out?.name.split(" ")[0]}
      </p>
      <label className="block text-xs text-gray-500">
        Player coming IN (from bench this rotation)
        <select
          value={inPlayerId}
          onChange={(e) => setInPlayerId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
        >
          {candidates.length === 0 ? (
            <option value="">No bench players available</option>
          ) : (
            candidates.map((p) => {
              const otherIdx = findOtherSubUsingInPlayer(
                plan.segments[segmentIndex],
                subIndex,
                p.id
              );
              const exchangeSlot =
                otherIdx >= 0
                  ? slotLabel(plan.segments[segmentIndex].substitutions[otherIdx].slotId)
                  : null;
              return (
                <option key={p.id} value={p.id}>
                  {subInCandidateLabel(p, sub.slotId, exchangeSlot)}
                </option>
              );
            })
          )}
        </select>
      </label>
      {candidateHint && (
        <p className="text-xs text-gray-500">{candidateHint}</p>
      )}
      {warnings.length > 0 && (
        <ul className="text-xs text-orange-700">
          {warnings.map((w) => (
            <li key={w}>⚠ {w} (saved anyway)</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!inPlayerId || subIndex < 0 || candidates.length === 0}
          className="flex-1 rounded-lg bg-pitch py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save swap
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700"
        >
          Cancel
        </button>
      </div>
    </li>
  );
}
