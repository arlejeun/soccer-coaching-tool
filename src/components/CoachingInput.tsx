import type { GameSettings, Player, PlayerCoachingInput } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import {
  COACHING_CRITERIA,
  compositeScore,
  computePlayerTargets,
  getCoachingInput,
  scoreLabel,
} from "../lib/coachingScore";

interface Props {
  players: Player[];
  profiles: Record<string, PlayerCoachingInput>;
  meritInfluence: number;
  onProfilesChange: (profiles: Record<string, PlayerCoachingInput>) => void;
  onMeritInfluenceChange: (value: number) => void;
}

export default function CoachingInput({
  players,
  profiles,
  meritInfluence,
  onProfilesChange,
  onMeritInfluenceChange,
}: Props) {
  const totalMinutes = DEFAULT_SETTINGS.halfMinutes * 2;
  const settings: GameSettings = { ...DEFAULT_SETTINGS, meritInfluence };
  const targets = computePlayerTargets(
    players.map((p) => p.id),
    profiles,
    settings,
    totalMinutes
  );
  const equalTarget = (totalMinutes * 7) / players.length;

  const updateProfile = (playerId: string, patch: Partial<PlayerCoachingInput>) => {
    onProfilesChange({
      ...profiles,
      [playerId]: { ...getCoachingInput(profiles, playerId), ...patch },
    });
  };

  const ranked = [...players].sort(
    (a, b) => compositeScore(getCoachingInput(profiles, b.id)) - compositeScore(getCoachingInput(profiles, a.id))
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Coaching Input</h2>
        <p className="mt-1 text-sm text-gray-600">
          Rate practice & effort, match performance, and behavior. These scores
          adjust target playing time when you generate a substitution plan.
        </p>

        <label className="mt-4 block">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Merit influence</span>
            <span className="font-semibold text-pitch">{meritInfluence}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={meritInfluence}
            onChange={(e) => onMeritInfluenceChange(Number(e.target.value))}
            className="mt-2 w-full accent-pitch"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>Equal time for all</span>
            <span>Reward top performers</span>
          </div>
        </label>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <h3 className="font-semibold text-gray-900">Projected targets ({totalMinutes} min game)</h3>
        <p className="text-sm text-gray-600">
          Equal share: {equalTarget.toFixed(1)} min · Range adjusts with merit influence
        </p>
        <ul className="mt-3 space-y-2">
          {ranked.map((player) => {
            const input = getCoachingInput(profiles, player.id);
            const score = compositeScore(input);
            const target = targets[player.id];
            const diff = target - equalTarget;
            return (
              <li key={player.id} className="flex items-center gap-2 text-sm">
                <span className="w-8 font-bold text-pitch">#{player.number}</span>
                <span className="flex-1 truncate">{player.name.split(" ")[0]}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {score.toFixed(1)} · {scoreLabel(score)}
                </span>
                <span className="w-14 text-right font-medium">{target.toFixed(1)}m</span>
                <span
                  className={`w-12 text-right text-xs ${
                    Math.abs(diff) < 0.5 ? "text-gray-400" : diff > 0 ? "text-green-600" : "text-orange-600"
                  }`}
                >
                  {diff >= 0 ? "+" : ""}
                  {diff.toFixed(1)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3">
        {players.map((player) => {
          const input = getCoachingInput(profiles, player.id);
          const score = compositeScore(input);
          return (
            <div
              key={player.id}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    #{player.number} {player.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Overall {score.toFixed(1)}/5 · Target {targets[player.id].toFixed(1)} min
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    score >= 4
                      ? "bg-green-100 text-green-800"
                      : score >= 3
                        ? "bg-gray-100 text-gray-700"
                        : "bg-orange-100 text-orange-800"
                  }`}
                >
                  {scoreLabel(score)}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {COACHING_CRITERIA.map(({ key, label, hint }) => (
                  <RatingRow
                    key={key}
                    label={label}
                    hint={hint}
                    value={input[key]}
                    onChange={(value) => updateProfile(player.id, { [key]: value })}
                  />
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-gray-500">Coach notes</span>
                <textarea
                  value={input.notes ?? ""}
                  onChange={(e) => updateProfile(player.id, { notes: e.target.value })}
                  placeholder="Optional — e.g. missed 2 practices, great leadership..."
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RatingRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="text-xs text-gray-500">{hint}</p>
        </div>
        <span className="text-sm font-bold text-pitch">{value}/5</span>
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              n <= value
                ? "bg-pitch text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
