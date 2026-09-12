import type { GamePlan, Player, SubstitutionRule } from "../types";
import EditableSegmentLineup from "./EditableSegmentLineup";

/** @deprecated Use EditableSegmentLineup with segmentIndex={0} */
export default function EditableStartingLineup({
  plan,
  players,
  subRules,
  onPlanChange,
}: {
  plan: GamePlan;
  players: Player[];
  subRules: SubstitutionRule[];
  onPlanChange: (plan: GamePlan) => void;
}) {
  return (
    <EditableSegmentLineup
      plan={plan}
      segmentIndex={0}
      players={players}
      subRules={subRules}
      onPlanChange={onPlanChange}
    />
  );
}
