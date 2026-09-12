import { useState } from "react";
import { getSheetsSecret, getSheetsUrl, setSheetsConfig } from "../lib/sheetsApi";
import type { SyncStatus } from "../hooks/useGoogleSheet";

interface Props {
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSynced: Date | null;
  isConfigured: boolean;
  onRefresh: () => void;
  onConfigure: (url: string, secret: string) => void;
}

export default function SheetSyncBar({
  syncStatus,
  syncError,
  lastSynced,
  isConfigured,
  onRefresh,
  onConfigure,
}: Props) {
  const [expanded, setExpanded] = useState(!isConfigured);
  const [urlInput, setUrlInput] = useState(getSheetsUrl());
  const [secretInput, setSecretInput] = useState(getSheetsSecret());

  const statusLabel: Record<SyncStatus, string> = {
    idle: "Not connected",
    loading: "Loading…",
    synced: "Synced with Google Sheets",
    saving: "Saving…",
    error: "Sync error",
    offline: "Local only",
  };

  const statusColor: Record<SyncStatus, string> = {
    idle: "bg-gray-100 text-gray-700",
    loading: "bg-blue-100 text-blue-800",
    synced: "bg-green-100 text-green-800",
    saving: "bg-blue-100 text-blue-800",
    error: "bg-red-100 text-red-800",
    offline: "bg-yellow-100 text-yellow-800",
  };

  const handleConnect = () => {
    setSheetsConfig(urlInput, secretInput);
    onConfigure(urlInput, secretInput);
  };

  return (
    <div className="border-b border-pitch-dark bg-pitch-dark/50 px-4 py-2 text-white">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left text-sm"
      >
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[syncStatus]}`}>
          {statusLabel[syncStatus]}
        </span>
        <span className="text-xs opacity-80">
          {expanded ? "Hide" : "Google Sheets"} ·{" "}
          {lastSynced ? lastSynced.toLocaleTimeString() : "—"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 pb-1">
          <label className="block text-xs opacity-90">
            Apps Script Web App URL
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className="mt-1 w-full rounded-lg border-0 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs opacity-90">
            Shared secret
            <input
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder="Same secret set in Apps Script"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border-0 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={!urlInput || !secretInput}
              className="flex-1 rounded-lg bg-white py-2 text-sm font-semibold text-pitch disabled:opacity-50"
            >
              Connect
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={!urlInput || !secretInput || syncStatus === "loading"}
              className="rounded-lg bg-pitch px-4 py-2 text-sm font-medium ring-1 ring-white/30 disabled:opacity-50"
            >
              Reload
            </button>
          </div>
          {syncError && <p className="text-xs text-red-200">{syncError}</p>}
          <p className="text-xs opacity-70">
            Set the secret in Apps Script via <code className="rounded bg-black/20 px-1">setApiSecret()</code>.
            See <code className="rounded bg-black/20 px-1">docs/GOOGLE_SHEETS_SETUP.md</code>.
          </p>
        </div>
      )}
    </div>
  );
}
