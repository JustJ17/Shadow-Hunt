import { TransactionClient, CaptureAttemptOutcome } from "@/lib/turn-engine/types";
import { emitEvent } from "@/lib/turn-engine/event-feed";

/**
 * Resolves a Capture Attempt by comparing the player's final location
 * with the Mastermind's location.
 *
 * On success: room → "finished", GameResult created, "game-won" event emitted, returns success with Mastermind location revealed
 * On failure: sets skipNextTurn flag on player, returns failure WITHOUT revealing Mastermind location
 */
export async function resolveCaptureAttempt(
  roomId: string,
  playerId: string,
  playerLocationId: string,
  roundNumber: number,
  tx: TransactionClient
): Promise<CaptureAttemptOutcome> {
  // Get the Mastermind's location
  const threat = await tx.gameThreat.findUnique({
    where: { roomId },
    select: { locationId: true },
  });

  if (!threat) {
    throw new Error(`No game threat found for room ${roomId}`);
  }

  if (playerLocationId === threat.locationId) {
    // SUCCESS: Player wins!
    // Update room status to "finished"
    await tx.room.update({
      where: { id: roomId },
      data: { status: "finished" },
    });

    // Create GameResult record for the win
    await tx.gameResult.create({
      data: {
        roomId,
        outcome: "win",
        winnerId: playerId,
        winLocationId: playerLocationId,
        mastermindLocationId: threat.locationId,
        roundNumber,
      },
    });

    // Emit "game-won" event to the Event Feed
    await emitEvent(
      roomId,
      "game-won",
      {
        winnerId: playerId,
        locationId: playerLocationId,
        mastermindLocationId: threat.locationId,
      },
      roundNumber,
      tx
    );

    return {
      result: "success",
      locationId: playerLocationId,
      winnerId: playerId,
      mastermindLocationId: threat.locationId,
    };
  } else {
    // FAILURE: Set skip next turn flag
    await tx.playerPosition.update({
      where: { roomId_playerId: { roomId, playerId } },
      data: { skipNextTurn: true },
    });

    // Emit "capture-failed" event to the public Event Feed
    await emitEvent(
      roomId,
      "capture-failed",
      {
        playerId,
        locationId: playerLocationId,
        // Do NOT include the Mastermind location
      },
      roundNumber,
      tx
    );

    return {
      result: "failed",
      locationId: playerLocationId,
      // Do NOT reveal the Mastermind's location
    };
  }
}
