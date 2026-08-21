import { prisma } from "@/lib/prisma";
import type { AdjacencyEdge, TransportType } from "@/lib/map/types";

export interface AdjacentLocationWithTransport {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
  transport: TransportType;
  isSameRegion: boolean;
}

/**
 * Returns all locations adjacent to the given location, including
 * transport type and isSameRegion for each connecting edge.
 */
export async function getAdjacentLocations(
  locationId: string
): Promise<AdjacentLocationWithTransport[]> {
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
      transport: edge.transport as TransportType,
      isSameRegion: edge.isSameRegion,
    };
  });
}

/**
 * Returns all 72 adjacency edges in the map, including transport type.
 */
export async function getAllAdjacencyEdges(): Promise<AdjacencyEdge[]> {
  const edges = await prisma.adjacency.findMany();

  return edges.map((edge) => ({
    id: edge.id,
    locationAId: edge.locationAId,
    locationBId: edge.locationBId,
    isSameRegion: edge.isSameRegion,
    transport: edge.transport as TransportType,
  }));
}
