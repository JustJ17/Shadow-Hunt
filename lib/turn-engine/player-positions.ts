import { TransactionClient } from "@/lib/turn-engine/types";

/**
 * Fisher-Yates shuffle algorithm.
 * Returns a new shuffled copy of the array.
 */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Assigns starting positions for all players in a game.
 * Each player is placed at the Hub location of a distinct Region,
 * selected via Fisher-Yates shuffle of the available regions.
 *
 * @param roomId - The game session room ID
 * @param playerIds - Player IDs ordered by turnPosition (1..N)
 * @param tx - Prisma transaction client
 */
export async function assignStartingPositions(
  roomId: string,
  playerIds: string[],
  tx: TransactionClient
): Promise<void> {
  // Load all regions with their hub location IDs
  const regions = await tx.region.findMany({
    select: { id: true, hubLocationId: true },
  });

  // Filter to regions that have a hub location set
  const validRegions = regions.filter(
    (r): r is { id: string; hubLocationId: string } => r.hubLocationId !== null
  );

  if (validRegions.length < playerIds.length) {
    throw new Error(
      `Not enough regions with hub locations (${validRegions.length}) for ${playerIds.length} players`
    );
  }

  // Shuffle regions and assign one per player
  const shuffledRegions = shuffle(validRegions);

  for (let i = 0; i < playerIds.length; i++) {
    await tx.playerPosition.create({
      data: {
        roomId,
        playerId: playerIds[i],
        locationId: shuffledRegions[i].hubLocationId,
        skipNextTurn: false,
      },
    });
  }
}

/**
 * Returns the current location ID for a player in a game session.
 */
export async function getPlayerPosition(
  roomId: string,
  playerId: string,
  tx: TransactionClient
): Promise<string> {
  const record = await tx.playerPosition.findUnique({
    where: { roomId_playerId: { roomId, playerId } },
    select: { locationId: true },
  });

  if (!record) {
    throw new Error(
      `No position found for player ${playerId} in room ${roomId}`
    );
  }

  return record.locationId;
}

/**
 * Returns the full PlayerPosition record for a player within a transaction.
 */
export async function getPlayerPositionRecord(
  roomId: string,
  playerId: string,
  tx: TransactionClient
) {
  const record = await tx.playerPosition.findUnique({
    where: { roomId_playerId: { roomId, playerId } },
  });

  if (!record) {
    throw new Error(
      `No position found for player ${playerId} in room ${roomId}`
    );
  }

  return record;
}
