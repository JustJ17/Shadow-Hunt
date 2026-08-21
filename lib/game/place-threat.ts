import { TransactionClient } from "@/lib/game/types";

/**
 * Places the Main Threat at a random location from the full set of locations.
 * Uses uniform random distribution to select one location.
 */
export async function placeMainThreat(
  roomId: string,
  allLocationIds: string[],
  tx: TransactionClient
): Promise<string> {
  const randomIndex = Math.floor(Math.random() * allLocationIds.length);
  const locationId = allLocationIds[randomIndex];

  await tx.gameThreat.create({
    data: {
      roomId,
      locationId,
    },
  });

  return locationId;
}
