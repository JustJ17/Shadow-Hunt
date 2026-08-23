import type { AdjacencyListEntry, TransportType } from "@/lib/map/types";

export interface LegalMoveEntry {
  locationId: string;
  transport: TransportType;
}

/**
 * Computes all legal move destinations for a player at a given location.
 *
 * Filters:
 * 1. Excludes edges whose transport type is currently blocked.
 * 2. Excludes plane edges when neither the viewer's location nor the
 *    target location is a hub.
 */
export function computeLegalMoves(
  viewerLocationId: string,
  adjacency: AdjacencyListEntry[],
  blockedTransports: Set<TransportType>,
  hubLocationIds: Set<string>,
): LegalMoveEntry[] {
  const entry = adjacency.find((e) => e.locationId === viewerLocationId);
  if (!entry) return [];

  const moves: LegalMoveEntry[] = [];

  for (const edge of entry.edges) {
    // Skip blocked transport routes
    if (blockedTransports.has(edge.transport)) continue;

    // Skip plane edges when neither origin nor target is a hub
    if (
      edge.transport === "plane" &&
      !hubLocationIds.has(viewerLocationId) &&
      !hubLocationIds.has(edge.targetLocationId)
    ) {
      continue;
    }

    moves.push({
      locationId: edge.targetLocationId,
      transport: edge.transport,
    });
  }

  return moves;
}
