import { prisma } from "@/lib/prisma";
import type { AdjacencyEdge, Location } from "@/lib/map/types";

/**
 * Returns all locations adjacent to the given location.
 * Queries both directions of the canonical edge ordering
 * (locationAId < locationBId) to find all neighbors.
 */
export async function getAdjacentLocations(
  locationId: string
): Promise<Location[]> {
  const edges = await prisma.adjacency.findMany({
    where: {
      OR: [{ locationAId: locationId }, { locationBId: locationId }],
    },
    include: {
      locationA: true,
      locationB: true,
    },
  });

  return edges.map((edge) => {
    const neighbor =
      edge.locationAId === locationId ? edge.locationB : edge.locationA;
    return {
      id: neighbor.id,
      name: neighbor.name,
      regionId: neighbor.regionId,
      isHub: neighbor.isHub,
    };
  });
}

/**
 * Returns all 72 adjacency edges in the map.
 */
export async function getAllAdjacencyEdges(): Promise<AdjacencyEdge[]> {
  const edges = await prisma.adjacency.findMany();

  return edges.map((edge) => ({
    id: edge.id,
    locationAId: edge.locationAId,
    locationBId: edge.locationBId,
    isSameRegion: edge.isSameRegion,
  }));
}
