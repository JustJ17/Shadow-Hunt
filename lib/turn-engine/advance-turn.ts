import {
  TransactionClient,
  TurnState,
  DrawDetectionResult,
} from "@/lib/turn-engine/types";
import { emitEvent } from "@/lib/turn-engine/event-feed";
import { getPlayerPositionRecord } from "@/lib/turn-engine/player-positions";

/**
 * Advances the turn to the next player in round-robin order.
 *
 * Handles:
 * - Round-robin turn order based on turnPosition (ascending)
 * - Round number increment when wrapping from last player back to first
 * - Skip flagged players: clears the flag, emits a "turn-skipped" event, advances past them
 * - All-flagged edge case: clears all flags and advances the round until an unflagged player is found
 * - Resets slot to 1 and captureAttemptFlag to false for the new turn
 * - Draw detection: if the new round exceeds maxRoundLimit, ends the game as a draw
 */
export async function advanceTurn(
  roomId: string,
  turnState: TurnState,
  tx: TransactionClient
): Promise<DrawDetectionResult> {
  // Guard: if room is already finished (e.g., from a capture attempt), skip draw detection
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
  if (room.status === "finished") {
    return { drawDetected: false };
  }

  const players = await tx.roomPlayer.findMany({
    where: { roomId },
    orderBy: { turnPosition: "asc" },
  });

  const currentIdx = players.findIndex(
    (p) => p.playerId === turnState.currentPlayerId
  );
  let nextIdx = (currentIdx + 1) % players.length;
  let newRound = turnState.currentRound;

  // If we wrapped around to the beginning, increment the round
  if (nextIdx === 0) {
    newRound += 1;
  }

  // Check for skip flags — skip players until we find one without the flag.
  // Safety: if ALL remaining players have skip flags, clear all and advance
  // (the while loop is bounded by players.length to prevent infinite loops).
  let skippedCount = 0;
  while (skippedCount < players.length) {
    const nextPlayer = players[nextIdx];
    const position = await getPlayerPositionRecord(
      roomId,
      nextPlayer.playerId,
      tx
    );

    if (position.skipNextTurn) {
      // Clear the skip flag
      await tx.playerPosition.update({
        where: { roomId_playerId: { roomId, playerId: nextPlayer.playerId } },
        data: { skipNextTurn: false },
      });

      // Emit "turn-skipped" event to the public Event Feed
      await emitEvent(
        roomId,
        "turn-skipped",
        { playerId: nextPlayer.playerId },
        newRound,
        tx
      );

      // Advance to next player
      nextIdx = (nextIdx + 1) % players.length;
      if (nextIdx === 0) {
        newRound += 1;
      }
      skippedCount++;
    } else {
      break;
    }
  }

  // Draw detection: check if the new round exceeds the configured maxRoundLimit
  if (newRound > room.maxRoundLimit) {
    // Fetch the mastermind's location from GameThreat
    const gameThreat = await tx.gameThreat.findUniqueOrThrow({
      where: { roomId },
    });

    // Transition room status to "finished"
    await tx.room.update({
      where: { id: roomId },
      data: { status: "finished" },
    });

    // Create GameResult record with outcome "draw"
    await tx.gameResult.create({
      data: {
        roomId,
        outcome: "draw",
        mastermindLocationId: gameThreat.locationId,
        roundNumber: newRound,
        reason: "max-rounds-exceeded",
      },
    });

    // Emit "game-draw" event to the Event Feed
    await emitEvent(
      roomId,
      "game-draw",
      {
        roundNumber: newRound,
        mastermindLocationId: gameThreat.locationId,
        reason: "max-rounds-exceeded",
      },
      newRound,
      tx
    );

    return {
      drawDetected: true,
      drawEvent: {
        roundNumber: newRound,
        mastermindLocationId: gameThreat.locationId,
      },
    };
  }

  // Normal turn advancement — update the turn state for the new player's turn
  await tx.gameTurn.update({
    where: { id: turnState.id },
    data: {
      currentPlayerId: players[nextIdx].playerId,
      currentRound: newRound,
      currentSlot: 1,
      captureAttemptFlag: false,
    },
  });

  return { drawDetected: false };
}
