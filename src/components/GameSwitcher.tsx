import { useState } from "react";
import type { SavedGame } from "../lib/gameDayState";
import { gameLabel } from "../lib/gameDayState";

interface Props {
  games: SavedGame[];
  activeGameId: string;
  onSelect: (gameId: string) => void;
  onCreate: (name: string) => void;
  onDuplicate: (name: string) => void;
  onDelete: (gameId: string) => void;
  onRename: (gameId: string, name: string, meta: { opponent?: string; when?: string }) => void;
}

export default function GameSwitcher({
  games,
  activeGameId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onRename,
}: Props) {
  const active = games.find((g) => g.id === activeGameId) ?? games[0];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(active?.name ?? "");
  const [opponent, setOpponent] = useState(active?.opponent ?? "");
  const [when, setWhen] = useState(active?.when ?? "");

  const openEdit = () => {
    if (!active) return;
    setName(active.name);
    setOpponent(active.opponent ?? "");
    setWhen(active.when ?? "");
    setEditing(true);
  };

  const saveEdit = () => {
    if (!active || !name.trim()) return;
    onRename(active.id, name.trim(), { opponent, when });
    setEditing(false);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm print:hidden">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Games
          </p>
          <p className="text-sm text-gray-600">
            Separate plans for tournament matches
          </p>
        </div>
        <span className="rounded-full bg-pitch/10 px-2 py-0.5 text-xs font-medium text-pitch">
          {games.length}
        </span>
      </div>

      <label className="mt-3 block text-xs text-gray-500">
        Active game
        <select
          value={activeGameId}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {gameLabel(g)}
              {g.plan ? "" : " · no plan"}
            </option>
          ))}
        </select>
      </label>

      {!editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const label = window.prompt("Name for the new game", `Game ${games.length + 1}`);
              if (label == null) return;
              onCreate(label.trim() || `Game ${games.length + 1}`);
            }}
            className="rounded-lg bg-pitch px-3 py-2 text-xs font-semibold text-white"
          >
            New game
          </button>
          <button
            type="button"
            onClick={() => {
              const label = window.prompt(
                "Name for the copy",
                `${active?.name ?? "Game"} (copy)`
              );
              if (label == null) return;
              onDuplicate(label.trim() || `${active?.name ?? "Game"} (copy)`);
            }}
            className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-800"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={openEdit}
            className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-800"
          >
            Rename
          </button>
          <button
            type="button"
            disabled={games.length <= 1}
            onClick={() => {
              if (!active || games.length <= 1) return;
              if (
                !window.confirm(
                  `Delete “${active.name}”? Its plan cannot be undone.`
                )
              ) {
                return;
              }
              onDelete(active.id);
            }}
            className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-pitch/30 bg-green-50/40 p-3">
          <label className="block text-xs text-gray-600">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Sat pool play"
            />
          </label>
          <label className="block text-xs text-gray-600">
            Opponent (optional)
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Blue Lightning"
            />
          </label>
          <label className="block text-xs text-gray-600">
            When (optional)
            <input
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Sat 9:00 AM"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={!name.trim()}
              className="flex-1 rounded-lg bg-pitch py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700 ring-1 ring-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
