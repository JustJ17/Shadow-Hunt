import { prisma } from "@/lib/prisma";
import {
  ActionPayload,
  TurnState,
  TurnActionResult,
  TurnActionError,
  EndOfTurnResolution,
} from "@/lib/turn-engine/types";
import { validateAction } from "@/lib/turn-engine/validate-action";
import { executeMove } from "@/lib/turn-engine/actions/execute-move";
import { executeSkip } from "@/lib/turn-engine/actions/execute-skip";
import { executeCaptureAttempt } from "@/lib/turn-engine/actions/execute-capture-attempt";
import { executeUseCard } from "@/lib/turn-engine/actions/execute-use-card";
import { resolveEndOfTurn } from "@/lib/turn-engine/resolution/resolve-end-of-turn";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import { emitEvent } from "@/lib/turn-engine/event-feed";
import { getPlayerPosition } from "@/lib/turn-engine/player-positions";
import { getAdjacentLocations } from "@/lib/map/adjacency";

/**
 * Main orchestrator for submitting a turn action.
 *
 * Wraps the entire flow in a Serializable transaction with a row-level lock
 * on the game_turns row to prevent concurrent submissions from corrupting state.
 *
 * Flow:
 * 1. Acquire row lock (SELECT FOR UPDATE on game_turns)
 * 2. Validate room status, player turn, and action validity
 * 3. Execute the action
 * 4. Emit public event to Event Feed
 * 5. If slot 2: run end-of-turn resolution, then advance turn
 * 6. If slot 1: advance to slot 2, persist capture flag if applicable
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
          currentSlot: row.currentSlot as 1 | 2,
          captureAttemptFlag: row.captureAttemptFlag,
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

        // 6. Validate the action
        const validationError = validateAction(
          action,
          turnState,
          playerId,
          position,
          adjacentLocations,
          playerCards
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
          case "USE_CARD":
            await executeUseCard(playerId, roomId, action.cardId, tx);
            break;
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
              { playerId, cardType: card?.type ?? "unknown" },
              turnState.currentRound,
              tx
            );
            break;
          }
          case "CAPTURE_ATTEMPT":
            // No event here — capture events fire during resolution
            break;
        }

        // 9. Handle slot progression and resolution
        const slotNumber = turnState.currentSlot;
        let resolution: EndOfTurnResolution | undefined;

        if (slotNumber === 2) {
          // Slot 2 complete → trigger end-of-turn resolution
          resolution = await resolveEndOfTurn(roomId, playerId, turnState, tx);

          // Advance to next player (unless game ended via successful capture)
          if (
            !resolution.captureAttempt ||
            resolution.captureAttempt.result !== "success"
          ) {
            await advanceTurn(roomId, turnState, tx);
          }
        } else {
          // Slot 1 → advance to slot 2
          await tx.gameTurn.update({
            where: { id: turnState.id },
            data: {
              currentSlot: 2,
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
          slotNumber: slotNumber as 1 | 2,
          remainingSlots: slotNumber === 1 ? 1 : 0,
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
