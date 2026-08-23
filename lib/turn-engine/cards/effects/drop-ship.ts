import { CardEffectContext } from "../types";
import { getShortestPathDistance } from "@/lib/map/distance";
import { emitEvent } from "@/lib/turn-engine/event-feed";

export async function handleDropShip(ctx: CardEffectContext): Promise<void> {
  const originLocationId = ctx.playerLocationId;

  // Load all locations with their regions
  const allLocations = await ctx.tx.location.findMany({
    select: { id: true, regionId: true },
  });

  // Get origin's region
  const originLocation = allLocations.find((l) => l.id === originLocationId);
  if (!originLocation) throw new Error(`Origin location not found: ${originLocationId}`);

  const originRegionId = originLocation.regionId;

  // Compute distances from origin to all locations in different regions
  const candidates: { id: string; distance: number }[] = [];
  for (const loc of allLocations) {
    if (loc.regionId === originRegionId) continue;
    const dist = await getShortestPathDistance(originLocationId, loc.id);
    candidates.push({ id: loc.id, distance: dist });
  }

  // Primary set: distance >= 4 AND different region
  let eligibleSet = candidates.filter((c) => c.distance >= 4);

  // Fallback: if primary set empty, take locations with max distance in different region
  if (eligibleSet.length === 0) {
    const maxDistance = Math.max(...candidates.map((c) => c.distance));
    eligibleSet = candidates.filter((c) => c.distance === maxDistance);
  }

  // Select uniformly at random from eligible set
  const selectedIndex = Math.floor(ctx.rng() * eligibleSet.length);
  const destinationId = eligibleSet[selectedIndex].id;

  // Update player position
  await ctx.tx.playerPosition.update({
    where: { roomId_playerId: { roomId: ctx.roomId, playerId: ctx.playerId } },
    data: { locationId: destinationId },
  });

  await emitEvent(
    ctx.roomId,
    "player-relocated",
    {
      playerId: ctx.playerId,
      fromLocationId: originLocationId,
      toLocationId: destinationId,
      cause: "drop-ship",
    },
    ctx.currentRound,
    ctx.tx
  );
}
