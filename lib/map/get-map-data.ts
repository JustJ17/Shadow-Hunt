import { prisma } from "@/lib/prisma";
import type {
  MapData,
  RegionWithLocations,
  AdjacencyListEntry,
  TransportType,
} from "@/lib/map/types";

/**
 * Returns the full static map data: all regions with their locations
 * and per-location adjacency lists including isSameRegion flags.
 *
 * Excludes all game state (GameThreat, GameSpy).
 */
export async function getFullMapData(): Promise<MapData> {
  const [dbRegions, dbEdges] = await Promise.all([
    prisma.region.findMany({
      include: { locations: true },
    }),
    prisma.adjacency.findMany(),
  ]);

  // Build RegionWithLocations[]
  const regions: RegionWithLocations[] = dbRegions.map((region) => ({
    id: region.id,
    name: region.name,
    hubLocationId: region.hubLocationId!,
    locations: region.locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      regionId: loc.regionId,
      isHub: loc.isHub,
    })),
  }));

  // Collect all location IDs for adjacency list building
  const allLocationIds = regions.flatMap((r) => r.locations.map((l) => l.id));

  // Build AdjacencyListEntry[] — one entry per location
  const adjacency: AdjacencyListEntry[] = allLocationIds.map((locationId) => {
    const relevantEdges = dbEdges.filter(
      (edge) =>
        edge.locationAId === locationId || edge.locationBId === locationId
    );

    const edges = relevantEdges.map((edge) => {
      const targetLocationId =
        edge.locationAId === locationId ? edge.locationBId : edge.locationAId;
      return {
        targetLocationId,
        isSameRegion: edge.isSameRegion,
        transport: edge.transport as TransportType,
      };
    });

    const adjacentLocationIds = edges.map((e) => e.targetLocationId);

    return {
      locationId,
      adjacentLocationIds,
      edges,
    };
  });

  return { regions, adjacency };
}
