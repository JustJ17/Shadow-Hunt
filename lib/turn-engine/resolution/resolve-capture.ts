import { TransactionClient, CaptureAttemptOutcome } from "@/lib/turn-engine/types";

/**
 * Resolves a Capture Attempt by comparing the player's final location
 * with the Mastermind's location.
 *
 * On success: room → "finished", winner recorded, returns success with Mastermind location revealed
 * On failure: sets skipNextTurn flag on player, returns failure WITHOUT revealing Mastermind location
 */
export async function resolveCaptureAttempt(
  roomId: string,
  playerId: string,
  playerLocationId: string,
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

    return {
      result: "failed",
      locationId: playerLocationId,
      // Do NOT reveal the Mastermind's location
    };
  }
}
