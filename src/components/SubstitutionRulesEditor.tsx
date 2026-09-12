import type { Player, SubstitutionRule } from "../types";
import { describeRule, ruleSummary } from "../lib/subRules";

const RULE_TYPES = [
  {
    type: "notSubbedTogether" as const,
    label: "Not subbed in same rotation",
    hint: "At most one of these players per rotation break",
  },
  {
    type: "notDefendTogether" as const,
    label: "Not defending together",
    hint: "If either is at DEF, the other can't be on field",
  },
  {
    type: "notOnFieldTogether" as const,
    label: "Not on field together",
    hint: "These two never on field at the same time",
  },
];

interface Props {
  players: Player[];
  rules: SubstitutionRule[];
  onChange: (rules: SubstitutionRule[]) => void;
}

export default function SubstitutionRulesEditor({ players, rules, onChange }: Props) {
  const name = (id: string) => {
    const p = players.find((x) => x.id === id);
    return p ? `#${p.number} ${p.name.split(" ")[0]}` : id;
  };

  const addRule = (type: SubstitutionRule["type"]) => {
    const id = `rule-${Date.now()}`;
    if (type === "notSubbedTogether") {
      onChange([
        ...rules,
        { id, type, playerIds: [players[0]?.id ?? "", players[1]?.id ?? ""] },
      ]);
    } else {
      onChange([
        ...rules,
        { id, type, playerA: players[0]?.id ?? "", playerB: players[1]?.id ?? "" },
      ]);
    }
  };

  const updateRule = (id: string, patch: Partial<SubstitutionRule>) => {
    onChange(
      rules.map((r) => (r.id === id ? ({ ...r, ...patch } as SubstitutionRule) : r))
    );
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-lg font-semibold text-gray-900">Substitution Rules</h2>
      <p className="mt-1 text-sm text-gray-600">
        Override the auto-plan when certain players must not rotate or play together.
      </p>

      <ul className="mt-4 space-y-3">
        {rules.map((rule) => (
          <li key={rule.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {describeRule(rule, name)}
                </p>
                <p className="text-xs text-gray-500">{ruleSummary(rule)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeRule(rule.id)}
                className="text-xs text-red-600 underline"
              >
                Remove
              </button>
            </div>

            {rule.type === "notSubbedTogether" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {rule.playerIds.map((pid, idx) => (
                  <PlayerSelect
                    key={idx}
                    players={players}
                    value={pid}
                    onChange={(id) => {
                      const next = [...rule.playerIds];
                      next[idx] = id;
                      updateRule(rule.id, { playerIds: next });
                    }}
                  />
                ))}
                {rule.playerIds.length < 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateRule(rule.id, {
                        playerIds: [...rule.playerIds, players[0]?.id ?? ""],
                      })
                    }
                    className="col-span-2 text-xs text-pitch underline"
                  >
                    + Add player to group
                  </button>
                )}
              </div>
            )}

            {(rule.type === "notDefendTogether" ||
              rule.type === "notOnFieldTogether") && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <PlayerSelect
                  players={players}
                  value={rule.playerA}
                  onChange={(id) => updateRule(rule.id, { playerA: id })}
                />
                <PlayerSelect
                  players={players}
                  value={rule.playerB}
                  onChange={(id) => updateRule(rule.id, { playerB: id })}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {rules.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">No rules — auto-plan only.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {RULE_TYPES.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => addRule(type)}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            + {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerSelect({
  players,
  value,
  onChange,
}: {
  players: Player[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
    >
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          #{p.number} {p.name}
        </option>
      ))}
    </select>
  );
}
