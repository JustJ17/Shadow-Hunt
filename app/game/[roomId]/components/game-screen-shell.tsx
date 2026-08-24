"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import type { GamePollState } from "@/lib/turn-engine/types";
import type { MapData } from "@/lib/map/types";
import type { NameLookupFn, PlayerLookupFn } from "@/lib/game-ui/event-messages";
import { CardHand } from "./card-hand";
import type { CardSelection } from "./card-hand";
import { TurnHud } from "./turn-hud";
import { NotebookPanel } from "./notebook-panel";
import { EventFeedPanel } from "./event-feed-panel";
import { PanelErrorBoundary } from "./panel-error-boundary";
import { RulesModal } from "@/app/components/rules-modal";

// --- Types ---

interface GameScreenShellProps {
  state: GamePollState;
  mapData: MapData | null;
  isSubmitting: boolean;
  onCardSelect: (selection: CardSelection) => void;
  mapSlot: React.ReactNode;
}

// --- Tab configuration ---

const TABS = [
  { id: "hud", label: "HUD" },
  { id: "notebook", label: "Notebook" },
  { id: "feed", label: "Feed" },
  { id: "cards", label: "Cards" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// --- Component ---

/**
 * GameScreenShell — responsive layout shell that composes the map and all four panels.
 *
 * Desktop (≥1024px): CSS Grid with map left + right sidebar + bottom card hand.
 * Compact (<1024px): map top (~40vh), tab bar, single active panel.
 *
 * Requirements: 1.1–1.10, 15.1–15.3, 15.9, 16.1–16.5
 */
export function GameScreenShell({
  state,
  mapData,
  isSubmitting,
  onCardSelect,
  mapSlot,
}: GameScreenShellProps) {
  const [selectedTab, setSelectedTab] = useState<TabId>("hud");
  const [rulesOpen, setRulesOpen] = useState(false);
  const scrollPositions = useRef<Record<TabId, number>>({
    hud: 0,
    notebook: 0,
    feed: 0,
    cards: 0,
  });
  const panelContainerRef = useRef<HTMLDivElement>(null);

  // --- Name lookup ---
  const nameLookup: NameLookupFn = useMemo(() => {
    if (!mapData) return (id: string) => id;

    const locationMap = new Map<string, string>();
    const regionMap = new Map<string, string>();

    for (const region of mapData.regions) {
      regionMap.set(region.id, region.name);
      for (const location of region.locations) {
        locationMap.set(location.id, location.name);
      }
    }

    return (id: string, kind: "location" | "region") => {
      if (kind === "location") return locationMap.get(id) ?? id;
      return regionMap.get(id) ?? id;
    };
  }, [mapData]);

  // --- Player lookup ---
  const playerLookup: PlayerLookupFn = useMemo(() => {
    const map = new Map(state.players.map((p) => [p.playerId, p.displayName]));
    return (id: string) => map.get(id) ?? "someone";
  }, [state.players]);

  // --- Derived state ---
  const isViewerTurn = state.currentPlayerId === state.viewerPlayerId;

  // --- Tab switching with scroll preservation ---
  const handleTabSelect = useCallback(
    (tabId: TabId) => {
      // Save current scroll position
      if (panelContainerRef.current) {
        scrollPositions.current[selectedTab] = panelContainerRef.current.scrollTop;
      }
      setSelectedTab(tabId);
    },
    [selectedTab],
  );

  // Restore scroll position after panel switch
  const handlePanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        (panelContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        node.scrollTop = scrollPositions.current[selectedTab];
      }
    },
    [selectedTab],
  );

  // --- Tab keyboard navigation ---
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = TABS.findIndex((t) => t.id === selectedTab);
      let nextIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % TABS.length;
          break;
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = TABS.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      const nextTab = TABS[nextIndex];
      handleTabSelect(nextTab.id);

      // Focus the next tab button
      const tabElement = document.getElementById(`tab-${nextTab.id}`);
      tabElement?.focus();
    },
    [selectedTab, handleTabSelect],
  );

  // --- Panel rendering helper ---
  const renderPanel = (tabId: TabId) => {
    switch (tabId) {
      case "hud":
        return (
          <PanelErrorBoundary panelName="Turn HUD">
            <TurnHud state={state} nameLookup={nameLookup} />
          </PanelErrorBoundary>
        );
      case "notebook":
        return (
          <PanelErrorBoundary panelName="Notebook">
            <NotebookPanel
              privateData={state.privateData}
              nameLookup={nameLookup}
              playerLookup={playerLookup}
            />
          </PanelErrorBoundary>
        );
      case "feed":
        return (
          <PanelErrorBoundary panelName="Event Feed">
            <EventFeedPanel
              events={state.events}
              nameLookup={nameLookup}
              playerLookup={playerLookup}
            />
          </PanelErrorBoundary>
        );
      case "cards":
        return (
          <PanelErrorBoundary panelName="Card Hand">
            <CardHand
              actionCards={state.privateData?.actionCards}
              isViewerTurn={isViewerTurn}
              actionsRemaining={state.actionsRemaining}
              isSubmitting={isSubmitting}
              onCardSelect={onCardSelect}
              players={state.players}
              viewerPlayerId={state.viewerPlayerId}
              pendingReward={state.privateData?.pendingReward ?? null}
              nameLookup={nameLookup}
            />
          </PanelErrorBoundary>
        );
    }
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      {/* Desktop layout (≥1024px) */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_360px] lg:grid-rows-[1fr_auto] lg:h-screen">
        <main className="row-span-1 overflow-hidden">{mapSlot}</main>

        <aside className="flex flex-col gap-2 p-2 overflow-y-auto row-span-1">
          <PanelErrorBoundary panelName="Turn HUD">
            <TurnHud state={state} nameLookup={nameLookup} />
          </PanelErrorBoundary>
          <PanelErrorBoundary panelName="Notebook">
            <NotebookPanel
              privateData={state.privateData}
              nameLookup={nameLookup}
              playerLookup={playerLookup}
            />
          </PanelErrorBoundary>
          <PanelErrorBoundary panelName="Event Feed">
            <EventFeedPanel
              events={state.events}
              nameLookup={nameLookup}
              playerLookup={playerLookup}
            />
          </PanelErrorBoundary>
        </aside>

        <div className="col-span-2 p-2">
          <PanelErrorBoundary panelName="Card Hand">
            <CardHand
              actionCards={state.privateData?.actionCards}
              isViewerTurn={isViewerTurn}
              actionsRemaining={state.actionsRemaining}
              isSubmitting={isSubmitting}
              onCardSelect={onCardSelect}
              players={state.players}
              viewerPlayerId={state.viewerPlayerId}
              pendingReward={state.privateData?.pendingReward ?? null}
              nameLookup={nameLookup}
            />
          </PanelErrorBoundary>
        </div>
      </div>

      {/* Compact layout (<1024px) */}
      <div className="lg:hidden flex flex-col h-screen">
        <main className="h-[40vh] shrink-0 overflow-hidden">{mapSlot}</main>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Panels"
          className="flex border-b border-gray-700 shrink-0"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selectedTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => handleTabSelect(tab.id)}
              onKeyDown={handleTabKeyDown}
              tabIndex={selectedTab === tab.id ? 0 : -1}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 ${
                selectedTab === tab.id
                  ? "text-white border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab panel */}
        <div
          ref={handlePanelRef}
          id={`panel-${selectedTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${selectedTab}`}
          className="flex-1 overflow-y-auto p-2"
        >
          {renderPanel(selectedTab)}
        </div>
      </div>

      {/* Rules button (floating) */}
      <button
        onClick={() => setRulesOpen(true)}
        className="fixed bottom-4 left-4 z-40 w-10 h-10 rounded-full bg-gray-700/80 hover:bg-gray-600 text-white text-lg font-bold flex items-center justify-center shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Open game rules"
        title="Game Rules"
      >
        ?
      </button>

      {/* Rules modal */}
      <RulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

export type { GameScreenShellProps, CardSelection };
