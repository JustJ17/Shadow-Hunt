import {
  TransactionClient,
  InitializeGameResult,
  GameInitError,
} from "@/lib/game/types";
import { placeMainThreat } from "@/lib/game/place-threat";
import { placeSpyNpcs } from "@/lib/game/place-spies";
import { assignStartingPositions } from "@/lib/turn-engine/player-positions";

/**
 * Orchestrates game initialization: loads all locations grouped by region,
 * places the Main Threat at a random location, and places one Spy NPC per region.
 * Sets the maxRoundLimit on the Room (default: 20, valid range: 1-100).
 * Must be called within an existing Prisma transaction.
 */
export async function initializeGame(
  roomId: string,
  tx: TransactionClient,
  options?: { maxRoundLimit?: number }
): Promise<InitializeGameResult | GameInitError> {
  const maxRoundLimit = options?.maxRoundLimit ?? 20;

  // Validate maxRoundLimit range [1, 100]
  if (
    !Number.isInteger(maxRoundLimit) ||
    maxRoundLimit < 1 ||
    maxRoundLimit > 100
  ) {
    return {
      success: false,
      error: "maxRoundLimit must be an integer between 1 and 100",
      code: "INVALID_ROUND_LIMIT",
    };
  }

  try {
    // 1. Query all locations and group by region
    const locations = await tx.location.findMany();

    if (locations.length === 0) {
      return {
        success: false,
        error: "No locations found in database",
        code: "NO_LOCATIONS_FOUND",
      };
    }

    // 2. Group locations by region into a Map<regionId, locationId[]>
    const regionLocations = new Map<string, string[]>();
    const allLocationIds: string[] = [];

    for (const location of locations) {
      allLocationIds.push(location.id);

      const existing = regionLocations.get(location.regionId);
      if (existing) {
        existing.push(location.id);
      } else {
        regionLocations.set(location.regionId, [location.id]);
      }
    }

    // 3. Place the Main Threat at a random location
    const threatLocationId = await placeMainThreat(roomId, allLocationIds, tx);

    // 4. Place one Spy NPC per region
    const spyPlacements = await placeSpyNpcs(roomId, regionLocations, tx);

    // 5. Assign starting positions to players
    const roomPlayers = await tx.roomPlayer.findMany({
      where: { roomId, turnPosition: { not: null } },
      orderBy: { turnPosition: "asc" },
      select: { playerId: true },
    });
    const playerIds = roomPlayers.map((p) => p.playerId);

    await assignStartingPositions(roomId, playerIds, tx);

    // 6. Create initial turn state (first player in turn order starts)
    await tx.gameTurn.create({
      data: {
        roomId,
        currentPlayerId: playerIds[0],
        currentRound: 1,
        currentSlot: 1,
        captureAttemptFlag: false,
        version: 0,
      },
    });

    // 7. Set maxRoundLimit on Room record
    await tx.room.update({
      where: { id: roomId },
      data: { maxRoundLimit },
    });

    return {
      success: true,
      threatLocationId,
      spyPlacements,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
      success: false,
      error: message,
      code: "INITIALIZATION_FAILED",
    };
  }
}
