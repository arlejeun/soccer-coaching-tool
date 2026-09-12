import { INITIAL_ROSTER } from "../src/data/roster";
import { DEFAULT_SUB_RULES } from "../src/data/subRules";
import { applyStartingLineupChange } from "../src/lib/planEdits";
import { generateGamePlan } from "../src/lib/substitutionEngine";
import { DEFAULT_SETTINGS } from "../src/types";

const settings = {
  ...DEFAULT_SETTINGS,
  segmentsPerHalf: 4,
  subsPerRotation: 2,
  halfMinutes: 25,
  firstHalfKeeperId: "p4",
  secondHalfKeeperId: "p2",
};

let plan = generateGamePlan(INITIAL_ROSTER, settings, {}, {}, DEFAULT_SUB_RULES, {
  p3: 32,
});

const lineup = { ...plan.segments[0].lineup, st: "p3" };
plan = applyStartingLineupChange(plan, lineup, INITIAL_ROSTER, DEFAULT_SUB_RULES);

for (const id of ["p3", "p8", "p11"]) {
  const p = INITIAL_ROSTER.find((x) => x.id === id)!;
  console.log(
    p.name.split(" ")[0],
    plan.playerMinutes[id]?.toFixed(1),
    "tgt",
    plan.playerTargets[id]?.toFixed(1)
  );
}

console.log("--- first half ST ---");
for (const s of plan.segments.filter((x) => x.half === 1)) {
  const st = INITIAL_ROSTER.find((p) => p.id === s.lineup.st)?.name.split(" ")[0];
  const subs = s.substitutions
    .map((sub) => {
      const out = INITIAL_ROSTER.find((p) => p.id === sub.outPlayerId)?.number;
      const inn = INITIAL_ROSTER.find((p) => p.id === sub.inPlayerId)?.number;
      return `#${out}->#${inn}@${sub.slotId}`;
    })
    .join(", ");
  console.log(`seg ${s.segmentInHalf}: ST=${st} bench=${s.bench.length} subs=[${subs}]`);
}
