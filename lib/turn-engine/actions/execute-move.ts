import { TransactionClient } from "@/lib/turn-engine/types";

/**
 * Updates the player's position to the target location.
 * Assumes validation has already been performed.
 */
export async function executeMove(
  playerId: string,
  roomId: string,
  targetLocationId: string,
  tx: TransactionClient
): Promise<void> {
  await tx.playerPosition.update({
    where: { roomId_playerId: { roomId, playerId } },
    data: { locationId: targetLocationId },
  });
}
