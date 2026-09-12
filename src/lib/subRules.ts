import type { Substitution, SubstitutionRule } from "../types";

const DEF_SLOTS = new Set(["d1", "d2"]);

export function isOnField(lineup: Record<string, string | null>, playerId: string): boolean {
  return Object.values(lineup).includes(playerId);
}

export function isInDefSlot(lineup: Record<string, string | null>, playerId: string): boolean {
  return Object.entries(lineup).some(
    ([slotId, id]) => DEF_SLOTS.has(slotId) && id === playerId
  );
}

export function lineupViolations(
  lineup: Record<string, string | null>,
  rules: SubstitutionRule[]
): SubstitutionRule[] {
  return rules.filter((rule) => {
    if (rule.type === "notDefendTogether") {
      const { playerA, playerB } = rule;
      if (!isOnField(lineup, playerA) || !isOnField(lineup, playerB)) return false;
      return isInDefSlot(lineup, playerA) || isInDefSlot(lineup, playerB);
    }
    if (rule.type === "notOnFieldTogether") {
      return (
        isOnField(lineup, rule.playerA) && isOnField(lineup, rule.playerB)
      );
    }
    return false;
  });
}

export function subsViolations(
  subs: Substitution[],
  rules: SubstitutionRule[]
): SubstitutionRule[] {
  return rules.filter((rule) => {
    if (rule.type !== "notSubbedTogether") return false;
    const touched = new Set<string>();
    for (const sub of subs) {
      if (rule.playerIds.includes(sub.outPlayerId)) touched.add(sub.outPlayerId);
      if (rule.playerIds.includes(sub.inPlayerId)) touched.add(sub.inPlayerId);
    }
    return touched.size >= 2;
  });
}

export function describeRule(rule: SubstitutionRule, name: (id: string) => string): string {
  if (rule.label) return rule.label;
  if (rule.type === "notSubbedTogether") {
    return `${rule.playerIds.map(name).join(" & ")} — not in same rotation`;
  }
  if (rule.type === "notDefendTogether") {
    return `${name(rule.playerA)} & ${name(rule.playerB)} — not defending together`;
  }
  return `${name(rule.playerA)} & ${name(rule.playerB)} — not on field together`;
}

export function ruleSummary(rule: SubstitutionRule): string {
  switch (rule.type) {
    case "notSubbedTogether":
      return "Don't sub together in one rotation";
    case "notDefendTogether":
      return "Can't both be on field if either is at DEF";
    case "notOnFieldTogether":
      return "Can't both be on field at once";
  }
}
