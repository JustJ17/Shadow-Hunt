"use client";

import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useGamePoll } from "@/lib/hooks/use-game-poll";
import { useSubmitAction } from "@/lib/hooks/use-submit-action";
import { useMapData } from "@/lib/hooks/use-map-data";
import { computeLegalMoves } from "@/lib/game-ui/legal-moves";
import { EndScreen } from "./components/EndScreen";
import { ActionBar } from "./components/action-bar";
import { MoveFallbackList } from "./components/move-fallback-list";
import { GameScreenShell } from "./components/game-screen-shell";
import { WorldMap } from "./components/world-map";
import type { CardSelection } from "./components/card-hand";
import type { ActionCardPollData, UseCardPayload } from "@/lib/turn-engine/types";
import type { TransportType } from "@/lib/map/types";

/**
 * Main game page. Polls /api/game/[roomId]/state for current game state.
 * When status === "finished", renders EndScreen instead of active game view.
 * On direct navigation to a finished game, renders EndScreen on initial load
 * (no flash of active game view).
 *
 * Requirements: 1.2, 3.1, 4.1, 4.2, 5.1, 5.5, 8.1, 8.4, 8.6
 */
export default function GamePage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const { state, error, isLoading, refetch } = useGamePoll(roomId);
  const { submit, isSubmitting, error: submitError } = useSubmitAction(roomId, refetch);
  const { data: mapData, idToName } = useMapData();

  /**
   * Handles card selection from CardHand component (legacy interface).
   * Constructs UseCardPayload — includes targetPlayerId only when the card
   * requires a player target (targetRequirement !== "none").
   * Requirements: 5.1, 5.5
   */
  const handleCardSelect = useCallback(
    (card: ActionCardPollData, targetPlayerId?: string) => {
      const payload: UseCardPayload = {
        actionType: "USE_CARD",
        cardId: card.id,
        ...(card.targetRequirement !== "none" && targetPlayerId
          ? { targetPlayerId }
          : {}),
      };
      submit(payload);
    },
    [submit]
  );

  /**
   * Handles card selection via the CardSelection interface used by GameScreenShell.
   * Requirements: 1.1, 1.7
   */
  const handleCardSelectNew = useCallback(
    (selection: CardSelection) => {
      const payload: UseCardPayload = {
        actionType: "USE_CARD",
        cardId: selection.cardId,
        ...(selection.targetRequirement === "player" && selection.targetPlayerId
          ? { targetPlayerId: selection.targetPlayerId }
          : {}),
      };
      submit(payload);
    },
    [submit]
  );

  /** Handles move selection from CityMarkers or MoveFallbackList. Requirement 3.1 */
  const handleMoveSelect = useCallback(
    (targetLocationId: string) => {
      submit({ actionType: "MOVE", targetLocationId });
    },
    [submit]
  );

  /** Handles skip turn action. Requirement 4.1 */
  const handleSkip = useCallback(() => {
    submit({ actionType: "SKIP" });
  }, [submit]);

  /** Handles capture attempt action. Requirement 4.2 */
  const handleCaptureAttempt = useCallback(() => {
    submit({ actionType: "CAPTURE_ATTEMPT" });
  }, [submit]);

  /**
   * Compute legal move destinations from adjacency data and active blockades.
   * Uses the viewer's current location and the full adjacency list from map data.
   * Requirements: 3.3, 3.4, 3.6
   */
  const { legalMoveIds, legalMovesWithNames } = useMemo(() => {
    if (!state || !mapData) {
      return { legalMoveIds: new Set<string>(), legalMovesWithNames: [] };
    }

    const viewerPlayer = state.players.find(
      (p) => p.playerId === state.viewerPlayerId
    );
    if (!viewerPlayer) {
      return { legalMoveIds: new Set<string>(), legalMovesWithNames: [] };
    }

    const viewerLocationId = viewerPlayer.locationId;

    // Build blocked transports set from active blockades
    const blockedTransports = new Set<TransportType>(
      state.activeBlockades.map((b) => b.transportType)
    );

    // Build hub location IDs set from map data
    const hubLocationIds = new Set<string>();
    for (const region of mapData.regions) {
      for (const location of region.locations) {
        if (location.isHub) {
          hubLocationIds.add(location.id);
        }
      }
    }

    const moves = computeLegalMoves(
      viewerLocationId,
      mapData.adjacency,
      blockedTransports,
      hubLocationIds
    );

    const ids = new Set(moves.map((m) => m.locationId));
    const withNames = moves.map((m) => ({
      locationId: m.locationId,
      locationName: idToName(m.locationId),
      transport: m.transport,
    }));

    return { legalMoveIds: ids, legalMovesWithNames: withNames };
  }, [state, mapData, idToName]);

  // Loading state — neutral screen that works for both active and finished games
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="text-lg text-gray-400">Loading game...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-red-400 text-lg">{error}</p>
          <a href="/" className="text-blue-400 underline mt-4 inline-block">
            Back to home
          </a>
        </div>
      </div>
    );
  }

  if (!state) return null;

  // Game is finished — render EndScreen immediately (handles both polling
  // transition and direct navigation to a finished game URL)
  if (state.status === "finished") {
    return (
      <EndScreen
        roomId={roomId}
        playerId={state.viewerPlayerId}
        events={state.events}
      />
    );
  }

  // Derived state for turn ownership
  const isViewerTurn = state.viewerPlayerId === state.currentPlayerId;

  // captureAttemptFlag is not exposed in GamePollState — detect from events
  // if a capture-failed event exists for the viewer in the current round
  const captureAttemptFlag = state.events.some(
    (e) =>
      e.type === "capture-failed" &&
      e.roundNumber === state.currentRound &&
      (e.payload as Record<string, unknown>).playerId === state.viewerPlayerId
  );

  // Active game view — composed via GameScreenShell (Requirements: 1.1, 1.7)
  return (
    <GameScreenShell
      state={state}
      mapData={mapData ?? null}
      isSubmitting={isSubmitting}
      onCardSelect={handleCardSelectNew}
      mapSlot={
        <div className="flex flex-col h-full overflow-hidden">
          {/* SVG Map — takes up most of the space */}
          {mapData ? (
            <div className="flex-1 min-h-0">
              <WorldMap
                mapData={mapData}
                players={state.players.map(p => ({
                  id: p.playerId,
                  displayName: p.displayName,
                  locationId: p.locationId,
                  turnPosition: p.turnPosition,
                }))}
                viewerPlayerId={state.viewerPlayerId}
                activeBlockades={state.activeBlockades.map((b, i) => ({
                  id: `blockade-${i}`,
                  transport: b.transportType,
                  casterPlayerId: b.casterPlayerId,
                }))}
                legalMoveIds={legalMoveIds}
                isViewerTurn={isViewerTurn}
                isSubmitting={isSubmitting}
                onMoveSelect={handleMoveSelect}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500 text-sm">Loading map...</p>
            </div>
          )}
          {/* Action bar + Move list below the map */}
          <div className="shrink-0 p-2 space-y-2">
            <ActionBar
              isViewerTurn={isViewerTurn}
              isSubmitting={isSubmitting}
              actionsRemaining={state.actionsRemaining}
              captureAttemptFlag={captureAttemptFlag}
              error={submitError}
              onSkip={handleSkip}
              onCaptureAttempt={handleCaptureAttempt}
            />
            <MoveFallbackList
              legalMoves={legalMovesWithNames}
              isViewerTurn={isViewerTurn}
              isSubmitting={isSubmitting}
              onMoveSelect={handleMoveSelect}
            />
          </div>
        </div>
      }
    />
  );
}
