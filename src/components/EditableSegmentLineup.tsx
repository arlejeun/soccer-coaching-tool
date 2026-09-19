import { useEffect, useState } from "react";
import type { GamePlan, Player, SubstitutionRule } from "../types";
import { FORMATION_231, POSITION_COLORS } from "../types";
import FormationView from "./FormationView";
import {
  applySegmentLineupChange,
  canSaveStartingLineup,
  checkLineupWarnings,
  getLineupSlotCandidates,
  lineupSlotCandidateTag,
  setLineupSlotPlayer,
  slotLabel,
} from "../lib/planEdits";
import { getPlayerById } from "../lib/substitutionEngine";

interface Props {
  plan: GamePlan;
  segmentIndex: number;
  players: Player[];
  subRules: SubstitutionRule[];
  onPlanChange: (plan: GamePlan) => void;
  /** Live draft lineup for minutes preview while editing. */
  onDraftPreview?: (
    draft: { segmentIndex: number; lineup: Record<string, string | null> } | null
  ) => void;
}

export default function EditableSegmentLineup({
  plan,
  segmentIndex,
  players,
  subRules,
  onPlanChange,
  onDraftPreview,
}: Props) {
  const segment = plan.segments[segmentIndex];
  const [editing, setEditing] = useState(false);
  const [draftLineup, setDraftLineup] = useState(() => ({ ...segment.lineup }));
  const isManual = plan.manualSegments?.includes(segmentIndex);
  const isKickoff = segmentIndex === 0;

  useEffect(() => {
    if (!editing) {
      setDraftLineup({ ...segment.lineup });
    }
  }, [segment.lineup, editing]);

  useEffect(() => {
    if (!onDraftPreview || !editing) return;
    onDraftPreview({ segmentIndex, lineup: draftLineup });
    return () => onDraftPreview(null);
  }, [editing, draftLineup, segmentIndex, onDraftPreview]);

  const warnings = editing
    ? checkLineupWarnings(draftLineup, plan.activePlayerIds, players, subRules)
    : [];
  const blockingWarnings = editing
    ? warnings.filter(
        (w) =>
          !w.includes("out of position") &&
          !w.includes("Breaks a field rule") &&
          !w.includes("not defending")
      )
    : [];
  const canSave = canSaveStartingLineup(draftLineup, plan.activePlayerIds, players);

  const handleOpen = () => {
    setDraftLineup({ ...segment.lineup });
    setEditing(true);
  };

  const handleSave = () => {
    if (!canSave) return;
    onPlanChange(
      applySegmentLineupChange(plan, segmentIndex, draftLineup, players, subRules)
    );
    setEditing(false);
  };

  const handleSlotChange = (slotId: string, playerId: string) => {
    if (!playerId) return;
    setDraftLineup((prev) => setLineupSlotPlayer(prev, slotId, playerId));
  };

  if (!editing) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-gray-500">On field</p>
          <button
            type="button"
            onClick={handleOpen}
            className="rounded-lg bg-pitch/10 px-3 py-1.5 text-xs font-semibold text-pitch hover:bg-pitch/20"
          >
            Edit positions
          </button>
        </div>
        {isManual && (
          <p className="mb-2 text-xs font-medium text-blue-700">
            {isKickoff ? "Starting XI manually set" : "Lineup manually set"}
          </p>
        )}
        <FormationView lineup={segment.lineup} players={players} compact />
      </div>
    );
  }

  const draftBench = plan.activePlayerIds.filter(
    (id) => !Object.values(draftLineup).includes(id)
  );

  return (
    <div className="space-y-3 rounded-lg border-2 border-pitch bg-green-50/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-800">
          {isKickoff ? "Edit starting XI" : "Edit on-field positions"}
        </p>
        {isManual && (
          <span className="rounded bg-blue-100 px-1.5 text-[10px] font-medium text-blue-800">
            edited
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Any available player can play any spot. Picking someone already on the field
        swaps positions; picking from the bench brings them on. Out-of-position picks
        are allowed (warning only).
      </p>

      <ul className="space-y-2">
        {FORMATION_231.map((slot) => {
          const candidates = getLineupSlotCandidates(plan, slot.id, draftLineup, players);
          const currentId = draftLineup[slot.id] ?? "";
          const current = currentId ? getPlayerById(players, currentId) : null;

          return (
            <li key={slot.id} className="flex items-center gap-2">
              <span
                className={`w-10 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold ${POSITION_COLORS[slot.position]}`}
              >
                {slotLabel(slot.id)}
              </span>
              <select
                value={currentId}
                onChange={(e) => handleSlotChange(slot.id, e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
              >
                {!currentId && <option value="">— pick —</option>}
                {candidates.map((p) => {
                  const displaced = current
                    ? `#${current.number} ${current.name.split(" ")[0]}`
                    : null;
                  const tag = lineupSlotCandidateTag(
                    p,
                    slot.id,
                    draftLineup,
                    draftBench,
                    displaced
                  );
                  return (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                      {tag}
                    </option>
                  );
                })}
              </select>
            </li>
          );
        })}
      </ul>

      {draftBench.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Bench</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {draftBench.map((id) => {
              const p = getPlayerById(players, id);
              if (!p) return null;
              return (
                <li
                  key={id}
                  className={`rounded-lg border px-2 py-1 text-xs ${POSITION_COLORS[p.primaryPosition]}`}
                >
                  #{p.number} {p.name.split(" ")[0]}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="text-xs text-orange-700">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {blockingWarnings.length > 0 && (
        <p className="text-xs text-red-700">Fill all 7 positions before saving.</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 rounded-lg bg-pitch py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save positions
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
