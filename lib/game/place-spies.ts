import { TransactionClient, SpyPlacement } from "@/lib/game/types";

/**
 * Places one Spy NPC per region at a random location within that region.
 * Uses uniform random distribution to select a location from each region's locations.
 * A spy CAN be placed at the same location as the Main Threat (no exclusion).
 */
export async function placeSpyNpcs(
  roomId: string,
  regionLocations: Map<string, string[]>,
  tx: TransactionClient
): Promise<SpyPlacement[]> {
  const result: SpyPlacement[] = [];

  for (const [regionId, locationIds] of regionLocations) {
    const randomIndex = Math.floor(Math.random() * locationIds.length);
    const locationId = locationIds[randomIndex];

    const record = await tx.gameSpy.create({
      data: {
        roomId,
        regionId,
        locationId,
      },
    });

    result.push({
      id: record.id,
      regionId,
      locationId,
    });
  }

  return result;
}
