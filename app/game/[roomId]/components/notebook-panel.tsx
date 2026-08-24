"use client";

import { useState, useMemo } from "react";
import type {
  PlayerPrivateData,
  DiscriminatedNotebookEntry,
  PendingClueData,
} from "@/lib/turn-engine/types";
import type { NameLookupFn, PlayerLookupFn } from "@/lib/game-ui/event-messages";
import { getCardMeta } from "@/lib/game-ui/card-metadata";

// --- Types ---

interface NotebookPanelProps {
  privateData: PlayerPrivateData | undefined;
  nameLookup: NameLookupFn;
  playerLookup: PlayerLookupFn;
}

type EntryTypeFilter = "all" | DiscriminatedNotebookEntry["entryType"];

// --- Badge metadata ---

const BADGE_CONFIG: Record<
  DiscriminatedNotebookEntry["entryType"],
  { label: string; className: string }
> = {
  "spy-proximity": { label: "Spy", className: "bg-purple-600 text-purple-100" },
  mastermind_distance: { label: "Distance", className: "bg-blue-600 text-blue-100" },
  mastermind_direction: { label: "Direction", className: "bg-green-600 text-green-100" },
  phone_bug: { label: "Phone Bug", className: "bg-orange-600 text-orange-100" },
};

const FILTER_LABELS: Record<DiscriminatedNotebookEntry["entryType"], string> = {
  "spy-proximity": "Spy",
  mastermind_distance: "Distance",
  mastermind_direction: "Direction",
  phone_bug: "Phone Bug",
};

// --- Component ---

/**
 * NotebookPanel — renders the player's private clue notebook.
 *
 * Requirements: 6.1–6.10, 7.1–7.8, 15.5, 16.3, 16.4
 */
export function NotebookPanel({
  privateData,
  nameLookup,
  playerLookup,
}: NotebookPanelProps) {
  const [filter, setFilter] = useState<EntryTypeFilter>("all");

  const notebook = privateData?.notebook ?? [];
  const pendingClues = privateData?.pendingClues ?? [];

  // Sort entries ascending by roundNumber, preserving array order for ties
  const sortedEntries = useMemo(() => {
    return [...notebook].sort((a, b) => a.roundNumber - b.roundNumber);
  }, [notebook]);

  // Determine which entry types are present for filter buttons
  const presentTypes = useMemo(() => {
    const types = new Set<DiscriminatedNotebookEntry["entryType"]>();
    for (const entry of notebook) {
      if (entry.entryType in BADGE_CONFIG) {
        types.add(entry.entryType);
      }
    }
    return types;
  }, [notebook]);

  // Filter entries
  const visibleEntries = useMemo(() => {
    if (filter === "all") return sortedEntries;
    return sortedEntries.filter((entry) => entry.entryType === filter);
  }, [sortedEntries, filter]);

  // Empty state: both notebook and pendingClues empty (or privateData undefined)
  if (notebook.length === 0 && pendingClues.length === 0) {
    return (
      <section aria-label="Notebook" className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-sm text-center">No clues yet</p>
      </section>
    );
  }

  return (
    <section aria-label="Notebook" className="bg-gray-800 rounded-lg p-4 space-y-3">
      {/* Filter control */}
      {presentTypes.size > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by clue type">
          <FilterButton
            label="All"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {(
            ["spy-proximity", "mastermind_distance", "mastermind_direction", "phone_bug"] as const
          )
            .filter((type) => presentTypes.has(type))
            .map((type) => (
              <FilterButton
                key={type}
                label={FILTER_LABELS[type]}
                active={filter === type}
                onClick={() => setFilter(type)}
              />
            ))}
        </div>
      )}

      {/* Notebook entries */}
      <div className="space-y-2">
        {visibleEntries.map((entry, index) => (
          <NotebookEntryRow
            key={`${entry.entryType}-${entry.roundNumber}-${index}`}
            entry={entry}
            nameLookup={nameLookup}
            playerLookup={playerLookup}
          />
        ))}
      </div>

      {/* Pending clues */}
      {pendingClues.length > 0 && (
        <div className="space-y-2">
          {pendingClues.map((clue, index) => (
            <PendingClueRow key={`pending-${clue.cardIdentifier}-${index}`} clue={clue} />
          ))}
        </div>
      )}
    </section>
  );
}

// --- Sub-components ---

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active ? "true" : "false"}
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 ${
        active
          ? "bg-gray-600 text-white"
          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function NotebookEntryRow({
  entry,
  nameLookup,
  playerLookup,
}: {
  entry: DiscriminatedNotebookEntry;
  nameLookup: NameLookupFn;
  playerLookup: PlayerLookupFn;
}) {
  const badge = BADGE_CONFIG[entry.entryType as keyof typeof BADGE_CONFIG];

  // Unknown entry type fallback
  if (!badge) {
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-600 text-gray-200">
          Unknown
        </span>
        <span className="text-gray-300">
          <span className="text-gray-500">R{(entry as { roundNumber: number }).roundNumber}</span>
          {" — "}Unrecognised clue
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-sm">
      <span
        className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${badge.className}`}
      >
        {badge.label}
      </span>
      <span className="text-gray-200">
        <span className="text-gray-500">R{entry.roundNumber}</span>
        {" — "}
        <EntryContent entry={entry} nameLookup={nameLookup} playerLookup={playerLookup} />
      </span>
    </div>
  );
}

function EntryContent({
  entry,
  nameLookup,
  playerLookup,
}: {
  entry: DiscriminatedNotebookEntry;
  nameLookup: NameLookupFn;
  playerLookup: PlayerLookupFn;
}) {
  switch (entry.entryType) {
    case "spy-proximity": {
      const regionName = nameLookup(entry.regionId, "region");
      return (
        <>
          Region: {regionName} &mdash; {entry.stepsAway} steps from Spy
        </>
      );
    }
    case "mastermind_distance": {
      const locationName = nameLookup(entry.locationId, "location");
      return (
        <>
          {locationName} &mdash; {entry.stepsAway} steps from Mastermind
        </>
      );
    }
    case "mastermind_direction": {
      const locationName = nameLookup(entry.locationId, "location");
      return (
        <>
          {locationName} &mdash; one step closer to Mastermind
        </>
      );
    }
    case "phone_bug": {
      const playerName = playerLookup(entry.targetPlayerId);
      const locationName = nameLookup(entry.targetLocationId, "location");
      const spyInfo = getSpyInfo(entry, nameLookup);
      return (
        <>
          {playerName} at {locationName}, {entry.mastermindStepsAway} steps from
          Mastermind &mdash; {spyInfo}
        </>
      );
    }
    default:
      return null;
  }
}

function getSpyInfo(
  entry: { spyRegionId: string | null; spyCaptured: boolean },
  nameLookup: NameLookupFn,
): string {
  if (entry.spyRegionId === null) {
    return "no spy information";
  }
  const regionName = nameLookup(entry.spyRegionId, "region");
  if (entry.spyCaptured) {
    return `spy captured in ${regionName}`;
  }
  return `spy in ${regionName}`;
}

function PendingClueRow({ clue }: { clue: PendingClueData }) {
  const cardMeta = getCardMeta(clue.cardIdentifier);
  return (
    <div className="flex items-start gap-2 text-sm border border-dashed border-gray-600 rounded px-2 py-1.5">
      <span className="text-gray-400 italic">
        {cardMeta.displayName} &mdash; resolves at end of round {clue.roundNumber}
      </span>
    </div>
  );
}
