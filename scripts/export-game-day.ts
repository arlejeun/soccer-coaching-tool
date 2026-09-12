import { writeFileSync } from "fs";
import { INITIAL_ROSTER } from "../src/data/roster";
import { DEFAULT_SUB_RULES } from "../src/data/subRules";
import { generateGamePlan, formatMinute, getPlayerById } from "../src/lib/substitutionEngine";
import { applyStartingLineupChange, slotLabel } from "../src/lib/planEdits";
import { getBenchSubstitutions, getFieldShuffles } from "../src/lib/subDisplay";
import type { PlayerCoachingInput } from "../src/types";
import { FORMATION_231, DEFAULT_SETTINGS } from "../src/types";

const extra: PlayerCoachingInput = { practice: 4, performance: 4, behavior: 4 };
const coachingProfiles: Record<string, PlayerCoachingInput> = {
  p5: extra, // Aiden
  p7: extra, // Téo
  p10: extra, // Whitley
};

/** Manual play-time targets (minutes). Noah easing back from injury. */
const targetOverrides: Record<string, number> = {
  p1: 26, // Noah — ease in
  p2: 31, // Sullivan
  p3: 31, // Austin
  p5: 36, // Aiden
  p7: 36, // Téo
  p10: 36, // Whitley
  p11: 32, // James
};

const settings = {
  ...DEFAULT_SETTINGS,
  halfMinutes: 25,
  segmentsPerHalf: 4,
  subsPerRotation: 4,
  meritInfluence: 50,
  firstHalfKeeperId: "p4", // Waylon
  secondHalfKeeperId: "p8", // Silas
};

const availability = {};

let plan = generateGamePlan(
  INITIAL_ROSTER,
  settings,
  coachingProfiles,
  availability,
  DEFAULT_SUB_RULES,
  targetOverrides
);

plan = applyStartingLineupChange(
  plan,
  {
    gk: "p4", // Waylon
    d1: "p5", // Aiden
    d2: "p2", // Sullivan
    m1: "p10", // Whitley
    m2: "p7", // Téo
    m3: "p11", // James (covers MID)
    st: "p3", // Austin
  },
  INITIAL_ROSTER,
  DEFAULT_SUB_RULES
);

function name(id: string | null | undefined): string {
  if (!id) return "—";
  const p = getPlayerById(INITIAL_ROSTER, id);
  return p ? `#${p.number} ${p.name}` : id;
}

const gameDate = "Sunday, August 30, 2026";
const lines: string[] = [];

lines.push(`# U10 Game Day Plan`);
lines.push(`**${gameDate}** · 7v7 · 2-3-1 · 50 min (25+25)`);
lines.push("");
lines.push(`> Auto-generated plan. Verify keepers & lineup before kickoff.`);
lines.push(`> Open \`docs/GAME_DAY.html\` in a browser and print (Ctrl+P).`);
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Quick reference");
lines.push("");
lines.push("| Setting | Value |");
lines.push("|---------|-------|");
lines.push(`| Rotations per half | ${settings.segmentsPerHalf} (~6 min each) |`);
lines.push(`| Subs per rotation | ${settings.subsPerRotation} |`);
lines.push(`| 1st half GK | ${name(settings.firstHalfKeeperId)} |`);
lines.push(`| 2nd half GK | ${name(settings.secondHalfKeeperId)} |`);
lines.push(`| Extra minutes | Téo, Whitley, Aiden |`);
lines.push(`| Ease in | #24 Noah Bergsten (back from injury) |`);
lines.push("");
lines.push("Starting XI: Waylon (GK), Aiden & Sullivan (DEF), Whit, Téo, James (MID), Austin (ST).");
lines.push("Keepers play the field in their off-half. MID can cover ST or DEF; DEF/ST can cover MID.");
lines.push("");
lines.push("### Sub rules");
for (const r of DEFAULT_SUB_RULES) {
  lines.push(`- ${r.label ?? r.type}`);
}
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Playing time targets");
lines.push("");
lines.push("| # | Player | Projected | Target | +/- |");
lines.push("|---|--------|-----------|--------|-----|");
const sorted = [...INITIAL_ROSTER]
  .filter((p) => plan.activePlayerIds.includes(p.id))
  .sort((a, b) => (plan.playerMinutes[a.id] ?? 0) - (plan.playerMinutes[b.id] ?? 0));
for (const p of sorted) {
  const mins = plan.playerMinutes[p.id] ?? 0;
  const tgt = plan.playerTargets[p.id] ?? 0;
  const diff = mins - tgt;
  lines.push(
    `| ${p.number} | ${p.name} | ${mins.toFixed(1)}m | ${tgt.toFixed(0)}m | ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} |`
  );
}
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Rotation schedule");
lines.push("");

for (const segment of plan.segments) {
  const prev =
    segment.segmentIndex > 0
      ? plan.segments[segment.segmentIndex - 1].lineup
      : segment.lineup;
  const benchSubs = getBenchSubstitutions(segment);
  const shuffles = getFieldShuffles(prev, segment.lineup);
  const label =
    segment.segmentIndex === 0
      ? "**STARTING XI**"
      : `**Half ${segment.half} · Segment ${segment.segmentInHalf}**`;

  lines.push(`### ${label}`);
  lines.push(`*${formatMinute(segment.startMinute)} – ${formatMinute(segment.endMinute)}*`);
  lines.push("");
  lines.push("**On field**");
  lines.push("");
  for (const slot of FORMATION_231) {
    lines.push(`- **${slot.label}** — ${name(segment.lineup[slot.id])}`);
  }
  lines.push("");
  lines.push("**Bench:** " + (segment.bench.map((id) => name(id)).join(", ") || "—"));
  lines.push("");
  if (benchSubs.length > 0 || shuffles.length > 0) {
    lines.push("**Subs this break:**");
    for (const sub of benchSubs) {
      lines.push(
        `- OUT ${name(sub.outPlayerId)} → IN ${name(sub.inPlayerId)} (${slotLabel(sub.slotId)})`
      );
    }
    for (const s of shuffles) {
      lines.push(`- ${name(s.playerId)} moves ${slotLabel(s.fromSlotId)} → ${slotLabel(s.toSlotId)}`);
    }
    lines.push("");
  }
}

lines.push("---");
lines.push("");
lines.push("## Coach notes (fill in)");
lines.push("");
lines.push("- Ease in: #24 Noah Bergsten (back from injury — lower minutes)");
lines.push("- Keeper change at half: ___________________________");
lines.push("- Special matchups: ______________________________");
lines.push("");
lines.push("---");
lines.push("*Generated by U10 Sub Manager*");

const md = lines.join("\n");

// HTML version for easy printing
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>U10 Game Day — ${gameDate}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 8.5in; margin: 0 auto; padding: 0.5in; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 1.25rem; border-bottom: 2px solid #166534; padding-bottom: 0.25rem; }
    h3 { font-size: 0.95rem; margin-top: 1rem; background: #f0fdf4; padding: 0.35rem 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0.5rem 0; }
    th, td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; text-align: left; }
    th { background: #f3f4f6; }
    .segment { break-inside: avoid; margin-bottom: 1rem; border: 1px solid #ddd; padding: 0.75rem; }
    .time { color: #555; font-size: 0.85rem; }
    .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; font-size: 0.85rem; }
    .bench { font-size: 0.85rem; margin: 0.5rem 0; }
    .subs { font-size: 0.85rem; background: #fefce8; padding: 0.5rem; margin-top: 0.5rem; }
    .notes li { margin: 0.5rem 0; list-style: none; }
    @media print { body { padding: 0.25in; } }
  </style>
</head>
<body>
  <h1>U10 Game Day Plan</h1>
  <p><strong>${gameDate}</strong> · 7v7 · 2-3-1 · 50 min · 4 rotations/half · ${settings.subsPerRotation} subs/rotation</p>
  <p style="color:#555;font-size:0.85rem">1st half GK: ${name(settings.firstHalfKeeperId)} · 2nd half GK: ${name(settings.secondHalfKeeperId)} · <strong>Ease in: #24 Noah Bergsten</strong></p>
  <p style="color:#555;font-size:0.85rem">Start: Waylon GK · Aiden &amp; Sullivan DEF · Whit, Téo, James MID · Austin ST</p>

  <h2>Playing time</h2>
  <table>
    <tr><th>#</th><th>Player</th><th>Projected</th><th>Target</th><th>+/-</th></tr>
    ${sorted
      .map((p) => {
        const mins = plan.playerMinutes[p.id] ?? 0;
        const tgt = plan.playerTargets[p.id] ?? 0;
        const diff = mins - tgt;
        return `<tr><td>${p.number}</td><td>${p.name}</td><td>${mins.toFixed(1)}m</td><td>${tgt.toFixed(0)}m</td><td>${diff >= 0 ? "+" : ""}${diff.toFixed(1)}</td></tr>`;
      })
      .join("")}
  </table>

  <h2>Rotations</h2>
  ${plan.segments
    .map((segment) => {
      const prev =
        segment.segmentIndex > 0
          ? plan.segments[segment.segmentIndex - 1].lineup
          : segment.lineup;
      const benchSubs = getBenchSubstitutions(segment);
      const shuffles = getFieldShuffles(prev, segment.lineup);
      const title =
        segment.segmentIndex === 0
          ? "STARTING XI"
          : `Half ${segment.half} · Segment ${segment.segmentInHalf}`;
      return `<div class="segment">
        <h3>${title} <span class="time">${formatMinute(segment.startMinute)} – ${formatMinute(segment.endMinute)}</span></h3>
        <div class="field-grid">
          ${FORMATION_231.map(
            (slot) =>
              `<div><strong>${slot.label}</strong> ${name(segment.lineup[slot.id])}</div>`
          ).join("")}
        </div>
        <p class="bench"><strong>Bench:</strong> ${segment.bench.map((id) => name(id)).join(", ") || "—"}</p>
        ${
          benchSubs.length || shuffles.length
            ? `<div class="subs"><strong>Subs:</strong><ul>${benchSubs
                .map(
                  (s) =>
                    `<li>OUT ${name(s.outPlayerId)} → IN ${name(s.inPlayerId)} (${slotLabel(s.slotId)})</li>`
                )
                .join("")}${shuffles
                .map(
                  (s) =>
                    `<li>${name(s.playerId)}: ${slotLabel(s.fromSlotId)} → ${slotLabel(s.toSlotId)}</li>`
                )
                .join("")}</ul></div>`
            : ""
        }
      </div>`;
    })
    .join("")}

  <h2>Coach notes</h2>
  <ul class="notes">
    <li>Ease in: #24 Noah Bergsten (back from injury — lower minutes)</li>
    <li>Keeper change: __________________________________</li>
    <li>Notes: _________________________________________</li>
  </ul>
</body>
</html>`;

writeFileSync("docs/GAME_DAY.md", md);
writeFileSync("docs/GAME_DAY.html", html);
console.log("Wrote docs/GAME_DAY.md and docs/GAME_DAY.html");
