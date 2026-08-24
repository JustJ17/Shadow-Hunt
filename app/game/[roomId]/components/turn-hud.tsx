"use client";

import type { GamePollState, ActiveBlockadeData } from "@/lib/turn-engine/types";
import type { NameLookupFn } from "@/lib/game-ui/event-messages";

interface TurnHudProps {
  state: GamePollState;
  nameLookup: NameLookupFn;
}

/**
 * TurnHud panel — displays round info, turn identity, action budget,
 * turn order, status indicators, and blockade indicators.
 *
 * Requirements: 2.1–2.6, 3.1–3.5, 4.1–4.4, 5.1–5.4, 15.4
 */
export function TurnHud({ state, nameLookup }: TurnHudProps) {
  const {
    currentRound,
    currentPlayerId,
    viewerPlayerId,
    actionsRemaining,
    actionBudget,
    players,
    privateData,
    activeBlockades,
  } = state;

  const isViewerTurn = currentPlayerId === viewerPlayerId;
  const currentPlayer = players.find((p) => p.playerId === currentPlayerId);
  const currentPlayerName = currentPlayer?.displayName ?? "Unknown";

  // Sort players by turnPosition ascending
  const sortedPlayers = [...players].sort(
    (a, b) => a.turnPosition - b.turnPosition,
  );

  // Separate blockades into opponent-cast and self-cast
  const opponentBlockades: (ActiveBlockadeData & { casterName: string })[] = [];
  const selfBlockades: ActiveBlockadeData[] = [];

  for (const blockade of activeBlockades) {
    if (blockade.casterPlayerId === viewerPlayerId) {
      selfBlockades.push(blockade);
    } else {
      const caster = players.find(
        (p) => p.playerId === blockade.casterPlayerId,
      );
      opponentBlockades.push({
        ...blockade,
        casterName: caster?.displayName ?? "someone",
      });
    }
  }

  return (
    <section aria-label="Turn HUD" className="bg-gray-800 rounded-lg p-4 space-y-4">
      {/* Round badge */}
      <div className="flex items-center justify-between">
        <span className="bg-gray-700 text-gray-200 px-2 py-0.5 rounded text-sm font-medium">
          Round {currentRound}
        </span>
        <span className="text-sm text-gray-300">
          {actionsRemaining} of {actionBudget} actions
        </span>
      </div>

      {/* Turn identity */}
      <div>
        {isViewerTurn ? (
          <p className="text-green-400 font-semibold text-lg">Your turn</p>
        ) : (
          <p className="text-gray-300 text-lg">
            Waiting for <span className="text-white font-medium">{currentPlayerName}</span>
          </p>
        )}
        {actionsRemaining === 0 && isViewerTurn && (
          <p className="text-yellow-400 text-sm mt-1">Turn ending</p>
        )}
      </div>

      {/* Turn order list */}
      <div>
        <h3 className="text-xs uppercase text-gray-400 mb-2 tracking-wide">
          Turn Order
        </h3>
        <ol className="space-y-1" aria-label="Turn order">
          {sortedPlayers.map((player) => {
            const isCurrent = player.playerId === currentPlayerId;
            const isViewer = player.playerId === viewerPlayerId;
            const locationName = nameLookup(player.locationId, "location");

            return (
              <li
                key={player.playerId}
                className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
                  isCurrent
                    ? "bg-gray-700 text-white font-medium"
                    : "text-gray-300"
                }`}
                aria-current={isCurrent ? "true" : undefined}
              >
                <span className="text-gray-500 w-4 text-right">
                  {player.turnPosition}
                </span>
                <span className="flex-1 truncate">
                  {player.displayName}
                  {isViewer && (
                    <span className="text-gray-400 ml-1">(you)</span>
                  )}
                </span>
                <span className="text-gray-400 text-xs truncate max-w-30">
                  {locationName}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Status indicators */}
      {(privateData.skipNextTurn ||
        privateData.actionPenaltyFlag ||
        privateData.pendingExtraTurns > 0) && (
        <div className="space-y-1" aria-label="Status indicators">
          {privateData.skipNextTurn && (
            <p className="text-yellow-400 text-sm flex items-center gap-1">
              <WarningIcon />
              Your next turn will be skipped
            </p>
          )}
          {privateData.actionPenaltyFlag && (
            <p className="text-orange-400 text-sm flex items-center gap-1">
              <WarningIcon />
              You lose one action next turn
            </p>
          )}
          {privateData.pendingExtraTurns > 0 && (
            <p className="text-blue-400 text-sm flex items-center gap-1">
              <BonusIcon />
              {privateData.pendingExtraTurns} extra turn(s) pending
            </p>
          )}
        </div>
      )}

      {/* Blockade indicators */}
      {(opponentBlockades.length > 0 || selfBlockades.length > 0) && (
        <div className="space-y-1" aria-label="Blockade indicators">
          {opponentBlockades.map((blockade, index) => (
            <div
              key={`opponent-${blockade.transportType}-${index}`}
              className="flex items-center gap-2 text-sm text-red-400"
            >
              <TransportIcon type={blockade.transportType} />
              <span>
                {formatTransportLabel(blockade.transportType)} blocked by{" "}
                {blockade.casterName}
              </span>
            </div>
          ))}
          {selfBlockades.map((blockade, index) => (
            <div
              key={`self-${blockade.transportType}-${index}`}
              className="flex items-center gap-2 text-sm text-gray-400"
            >
              <TransportIcon type={blockade.transportType} />
              <span>
                You blocked {formatTransportLabel(blockade.transportType)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// --- Helper components ---

function WarningIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M7 1L13 13H1L7 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 5.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function BonusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 4.5V9.5M4.5 7H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Renders a distinct icon shape per transport type for blockade indicators. */
function TransportIcon({ type }: { type: string }) {
  switch (type) {
    case "car":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          {/* Road/car shape — rectangle with wheels */}
          <rect x="2" y="5" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="11" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" />
          <path d="M4 5V3H12V5" stroke="currentColor" strokeWidth="1" />
        </svg>
      );
    case "plane":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          {/* Wing/plane shape */}
          <path
            d="M8 2L14 8L8 9L6 14L5 9L2 8L8 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "boat":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          {/* Wave/boat shape */}
          <path
            d="M2 10C3 8.5 5 8.5 6 10C7 11.5 9 11.5 10 10C11 8.5 13 8.5 14 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M4 7L8 3L12 7H4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 3V7" stroke="currentColor" strokeWidth="1" />
        </svg>
      );
    default:
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Maps transport type to a human-readable label. */
function formatTransportLabel(type: string): string {
  switch (type) {
    case "car":
      return "Roads";
    case "plane":
      return "Airways";
    case "boat":
      return "Sea routes";
    default:
      return type;
  }
}
