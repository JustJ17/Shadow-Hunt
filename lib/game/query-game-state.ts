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
      captured: spy.captured,
      capturedByPlayerId: spy.capturedByPlayerId,
    })),
  };
}

/**
 * Marks a Spy NPC as captured by a specific player.
 * Updates the spy record with captured=true and records the capturing player.
 */
export async function markSpyCaptured(
  spyId: string,
  capturedByPlayerId: string
): Promise<void> {
  await prisma.gameSpy.update({
    where: { id: spyId },
    data: {
      captured: true,
      capturedByPlayerId,
    },
  });
}
