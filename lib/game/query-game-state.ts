import { prisma } from "@/lib/prisma";
import { GameState } from "@/lib/game/types";

/**
 * Retrieves the full game state (Main Threat + all Spy NPCs) for a room
 * in a single database call.
 *
 * Returns null if the room doesn't exist or has no game state (no threat placed).
 */
export async function getGameState(
  roomId: string
): Promise<GameState | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      gameThreat: true,
      gameSpies: true,
    },
  });

  if (!room || !room.gameThreat) {
    return null;
  }

  return {
    roomId: room.id,
    threat: {
      id: room.gameThreat.id,
      locationId: room.gameThreat.locationId,
    },
    spies: room.gameSpies.map((spy) => ({
      id: spy.id,
      regionId: spy.regionId,
      locationId: spy.locationId,
    })),
  };
}

/**
 * Records a player's capture of a spy NPC.
 * Creates a SpyCapture row; captureOrder is automatically computed
 * from the number of existing captures for this spy.
 *
 * Returns the captureOrder assigned to this player (1 = first, 2 = second, etc.)
 */
export async function recordSpyCapture(
  spyId: string,
  roomId: string,
  playerId: string
): Promise<number> {
  const existingCount = await prisma.spyCapture.count({
    where: { spyId },
  });
  const captureOrder = existingCount + 1;

  await prisma.spyCapture.create({
    data: { roomId, spyId, playerId, captureOrder },
  });

  return captureOrder;
}
