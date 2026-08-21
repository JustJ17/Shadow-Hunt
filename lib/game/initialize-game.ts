import {
  TransactionClient,
  InitializeGameResult,
  GameInitError,
} from "@/lib/game/types";
import { placeMainThreat } from "@/lib/game/place-threat";
import { placeSpyNpcs } from "@/lib/game/place-spies";

/**
 * Orchestrates game initialization: loads all locations grouped by region,
 * places the Main Threat at a random location, and places one Spy NPC per region.
 * Must be called within an existing Prisma transaction.
 */
export async function initializeGame(
  roomId: string,
  tx: TransactionClient
): Promise<InitializeGameResult | GameInitError> {
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
