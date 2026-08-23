import { prisma } from "@/lib/prisma";
import {
  ActionPayload,
  TurnState,
  TurnActionResult,
  TurnActionError,
  BlockadeState,
  EndOfTurnResolution,
} from "@/lib/turn-engine/types";
import { validateAction } from "@/lib/turn-engine/validate-action";
import { executeMove } from "@/lib/turn-engine/actions/execute-move";
import { executeSkip } from "@/lib/turn-engine/actions/execute-skip";
import { executeCaptureAttempt } from "@/lib/turn-engine/actions/execute-capture-attempt";
import { dispatchCard } from "@/lib/turn-engine/cards/dispatcher";
import { resolveEndOfTurn } from "@/lib/turn-engine/resolution/resolve-end-of-turn";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import { emitEvent } from "@/lib/turn-engine/event-feed";
import { getPlayerPosition } from "@/lib/turn-engine/player-positions";
import { getAdjacentLocations } from "@/lib/map/adjacency";
import {
  getActiveBlockades,
  computeBlockedTransports,
} from "@/lib/turn-engine/cards/effects/blockade-utils";

/**
 * Main orchestrator for submitting a turn action.
 *
 * Wraps the entire flow in a Serializable transaction with a row-level lock
 * on the game_turns row to prevent concurrent submissions from corrupting state.
 *
 * Flow:
 * 1. Acquire row lock (SELECT FOR UPDATE on game_turns)
 * 2. Validate room status, player turn, and action validity
 * 3. Execute the action (for USE_CARD: dispatch via Card Engine, then consume)
 * 4. Emit public event to Event Feed
 * 5. If actionsRemaining reaches 0: run end-of-turn resolution, then advance turn
 * 6. If actionsRemaining > 0: persist updated state and return intermediate success
 * 7. Return TurnActionResult with resolution data
 */
export async function submitAction(
  roomId: string,
  playerId: string,
  action: ActionPayload
): Promise<TurnActionResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Lock turn state row (SELECT FOR UPDATE)
        const turnStateRows = await tx.$queryRaw<any[]>`
        SELECT * FROM "game_turns" WHERE "roomId" = ${roomId} FOR UPDATE
      `;

        if (!turnStateRows || turnStateRows.length === 0) {
          return {
            success: false,
            error: "Game not active",
            code: "GAME_NOT_ACTIVE",
          } as TurnActionError;
        }

        const row = turnStateRows[0];
        const turnState: TurnState = {
          id: row.id,
          roomId: row.roomId,
          currentPlayerId: row.currentPlayerId,
          currentRound: row.currentRound,
          actionsRemaining: row.actionsRemaining,
          actionBudget: row.actionBudget,
          captureAttemptFlag: row.captureAttemptFlag,
          isExtraTurn: row.isExtraTurn,
          version: row.version,
        };

        // 2. Validate room is in-progress
        const room = await tx.room.findUnique({
          where: { id: roomId },
          select: { status: true },
        });
        if (!room || room.status !== "in-progress") {
          return {
            success: false,
            error: "Game is not active",
            code: "GAME_NOT_ACTIVE",
          } as TurnActionError;
        }

        // 3. Check player is a member of the room
        const membership = await tx.roomPlayer.findUnique({
          where: { playerId_roomId: { playerId, roomId } },
        });
        if (!membership) {
          return {
            success: false,
            error: "Player not in room",
            code: "NOT_IN_ROOM",
          } as TurnActionError;
        }

        // 4. Get player position and adjacent locations
        const position = await getPlayerPosition(roomId, playerId, tx);
        const adjacentLocations = await getAdjacentLocations(position);

        // 5. Get player's cards for validation
        const playerCards = await tx.actionCard.findMany({
          where: { roomId, playerId, consumed: false },
          select: { id: true, type: true, consumed: true },
        });

        // 5b. Compute blockade state for this player
        const currentTurnPosition = membership.turnPosition ?? 0;
        const activeBlockades = await getActiveBlockades(
          roomId,
          turnState.currentRound,
          currentTurnPosition,
          tx
        );
        const blockedTransports = computeBlockedTransports(activeBlockades, playerId);
        const blockadeState: BlockadeState = { blockedTransports };

        // 6. Validate the action
        const validationError = validateAction(
          action,
          turnState,
          playerId,
          position,
          adjacentLocations,
          playerCards,
          blockadeState,
          turnState.actionsRemaining
        );
        if (validationError) return validationError;

        // 7. Execute the action
        let updatedLocationId: string | undefined;
        switch (action.actionType) {
          case "MOVE":
            await executeMove(playerId, roomId, action.targetLocationId, tx);
            updatedLocationId = action.targetLocationId;
            break;
          case "SKIP":
            executeSkip();
            break;
          case "CAPTURE_ATTEMPT":
            await executeCaptureAttempt(turnState.id, tx);
            break;
          case "USE_CARD": {
            // Look up card type from the validated card
            const card = playerCards.find((c) => c.id === action.cardId);
            const cardType = card?.type ?? "unknown";

            // Dispatch to Card Engine — validate target and execute effect
            // Card is NOT yet consumed; dispatch must succeed first
            const dispatchResult = await dispatchCard(
              cardType,
              playerId,
              roomId,
              action.targetPlayerId,
              position,
              turnState.currentRound,
              currentTurnPosition,
              tx
            );

            // If dispatch fails (UNKNOWN_CARD_TYPE or INVALID_CARD_TARGET),
            // return error without consuming card or decrementing actionsRemaining
            if (!dispatchResult.success) {
              return {
                success: false,
                error: dispatchResult.message,
                code: dispatchResult.code,
              } as TurnActionError;
            }

            // Dispatch succeeded — now mark card consumed
            await tx.actionCard.update({
              where: { id: action.cardId },
              data: { consumed: true },
            });
            break;
          }
        }

        // 8. Emit public action event
        switch (action.actionType) {
          case "MOVE": {
            const edge = adjacentLocations.find(
              (a) => a.id === action.targetLocationId
            );
            await emitEvent(
              roomId,
              "player-moved",
              {
                playerId,
                fromLocationId: position,
                toLocationId: action.targetLocationId,
                transport: edge?.transport ?? "car",
              },
              turnState.currentRound,
              tx
            );
            break;
          }
          case "SKIP":
            await emitEvent(
              roomId,
              "player-skipped",
              { playerId },
              turnState.currentRound,
              tx
            );
            break;
          case "USE_CARD": {
            const card = playerCards.find((c) => c.id === action.cardId);
            await emitEvent(
              roomId,
              "card-used",
              {
                playerId,
                cardIdentifier: card?.type ?? "unknown",
                targetPlayerId: action.targetPlayerId,
              },
              turnState.currentRound,
              tx
            );
            break;
          }
          case "CAPTURE_ATTEMPT":
            // No event here — capture events fire during resolution
            break;
        }

        // 9. Handle action budget and resolution
        const newActionsRemaining = turnState.actionsRemaining - 1;
        let resolution: EndOfTurnResolution | undefined;

        if (newActionsRemaining === 0) {
          // All actions used → trigger end-of-turn resolution
          resolution = await resolveEndOfTurn(roomId, playerId, turnState, tx);

          // Advance to next player (unless game ended via successful capture)
          if (
            !resolution.captureAttempt ||
            resolution.captureAttempt.result !== "success"
          ) {
            const { drawDetected, drawEvent } = await advanceTurn(
              roomId,
              turnState,
              tx
            );

            // If draw detected, include draw info in resolution — game is over
            if (drawDetected && drawEvent) {
              resolution.drawResult = {
                roundNumber: drawEvent.roundNumber,
                mastermindLocationId: drawEvent.mastermindLocationId,
                reason: "max-rounds-exceeded",
              };
            }
          }
        } else {
          // Actions still remaining → update turn state
          await tx.gameTurn.update({
            where: { id: turnState.id },
            data: {
              actionsRemaining: newActionsRemaining,
              captureAttemptFlag:
                action.actionType === "CAPTURE_ATTEMPT"
                  ? true
                  : turnState.captureAttemptFlag,
            },
          });
        }

        return {
          success: true,
          actionType: action.actionType,
          actionsRemaining: newActionsRemaining,
          updatedLocationId,
          resolution,
        };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error: any) {
    // Handle Prisma serialization/concurrency errors
    if (
      error.code === "P2034" ||
      error.message?.includes("could not serialize")
    ) {
      return {
        success: false,
        error: "Concurrency conflict — please retry",
        code: "CONCURRENCY_CONFLICT",
      } as TurnActionError;
    }
    throw error;
  }
}
