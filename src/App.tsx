import { useState } from "react";
import { INITIAL_ROSTER } from "./data/roster";
import { useGoogleSheet } from "./hooks/useGoogleSheet";
import RosterManager from "./components/RosterManager";
import CoachingInputPanel from "./components/CoachingInput";
import GamePlanner from "./components/GamePlanner";
import MatchDay from "./components/MatchDay";
import SheetSyncBar from "./components/SheetSyncBar";
import GameSwitcher from "./components/GameSwitcher";
import { gameLabel } from "./lib/gameDayState";
import type { GameSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

type AppTab = "roster" | "coaching" | "plan" | "match";

export default function App() {
  const [tab, setTab] = useState<AppTab>("coaching");
  const sheet = useGoogleSheet();
  const settings: GameSettings = {
    ...DEFAULT_SETTINGS,
    ...sheet.gameSettings,
    meritInfluence: sheet.meritInfluence,
    maxConsecutiveBenchRotations: DEFAULT_SETTINGS.maxConsecutiveBenchRotations,
  };
  const activeLabel = gameLabel(sheet.activeGame);

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-24 print:block print:max-w-none print:pb-0">
      <header className="sticky top-0 z-10 bg-pitch text-white shadow-md print:hidden">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold">U10 Sub Manager</h1>
          <p className="text-sm opacity-90">7v7 · 2-3-1 · Merit-based rotation</p>
        </div>
        <SheetSyncBar
          syncStatus={sheet.syncStatus}
          syncError={sheet.syncError}
          lastSynced={sheet.lastSynced}
          isConfigured={sheet.isConfigured}
          onRefresh={sheet.refresh}
          onConfigure={sheet.configure}
        />
      </header>

      <main className="px-4 py-4 print:p-0">
        {tab === "roster" && (
          <RosterManager players={sheet.players} onUpdate={sheet.setPlayers} />
        )}
        {tab === "coaching" && (
          <CoachingInputPanel
            players={sheet.players}
            profiles={sheet.coachingProfiles}
            meritInfluence={sheet.meritInfluence}
            onProfilesChange={sheet.setCoachingProfiles}
            onMeritInfluenceChange={sheet.setMeritInfluence}
          />
        )}
        {(tab === "plan" || tab === "match") && (
          <div className="mb-4">
            <GameSwitcher
              games={sheet.games}
              activeGameId={sheet.activeGameId}
              onSelect={sheet.selectGame}
              onCreate={sheet.createGame}
              onDuplicate={sheet.duplicateActiveGame}
              onDelete={sheet.removeGame}
              onRename={sheet.updateGameMeta}
            />
          </div>
        )}
        {tab === "plan" && (
          <GamePlanner
            players={sheet.players.length > 0 ? sheet.players : INITIAL_ROSTER}
            settings={settings}
            coachingProfiles={sheet.coachingProfiles}
            availability={sheet.gameDayAvailability}
            subRules={sheet.subRules}
            plan={sheet.plan}
            gameTitle={activeLabel}
            onSettingsChange={(s) =>
              sheet.setGameSettings({
                halfMinutes: s.halfMinutes,
                segmentsPerHalf: s.segmentsPerHalf,
                subsPerRotation: s.subsPerRotation,
                firstHalfKeeperId: s.firstHalfKeeperId,
                secondHalfKeeperId: s.secondHalfKeeperId,
              })
            }
            onAvailabilityChange={sheet.setGameDayAvailability}
            onSubRulesChange={sheet.setSubRules}
            onPlanChange={sheet.setPlan}
          />
        )}
        {tab === "match" && (
          <MatchDay
            players={sheet.players.length > 0 ? sheet.players : INITIAL_ROSTER}
            plan={sheet.plan}
            subRules={sheet.subRules}
            gameId={sheet.activeGameId}
            gameTitle={activeLabel}
            onPlanChange={sheet.setPlan}
            onBack={() => setTab("plan")}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white shadow-lg print:hidden">
        <div className="mx-auto flex max-w-lg">
          {(
            [
              { id: "roster" as const, label: "Roster", icon: "👥" },
              { id: "coaching" as const, label: "Coaching", icon: "⭐" },
              { id: "plan" as const, label: "Plan", icon: "📋" },
              { id: "match" as const, label: "Match", icon: "⚽" },
            ] as const
          ).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 flex-col items-center py-3 text-xs font-medium transition ${
                tab === id
                  ? "text-pitch"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="text-lg">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
