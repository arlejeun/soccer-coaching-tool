import type { SubstitutionRule } from "../types";

/** Default coach constraints — customize on the Plan tab. */
export const DEFAULT_SUB_RULES: SubstitutionRule[] = [
  {
    id: "rule-whit-aiden",
    type: "notSubbedTogether",
    playerIds: ["p10", "p5"],
    label: "Whitley & Aiden — not same rotation",
  },
  {
    id: "rule-sully-bryce",
    type: "notDefendTogether",
    playerA: "p2",
    playerB: "p6",
    label: "Sullivan & Bryce — not defending together",
  },
];
