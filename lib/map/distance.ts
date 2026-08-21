import { prisma } from "@/lib/prisma";

/**
 * In-memory cache of the full 40x40 shortest-path distance matrix.
 * Computed lazily on first access via BFS from each location.
 */
let distanceMatrix: Map<string, Map<string, number>> | null = null;

/**
 * Loads the adjacency graph from the database, runs BFS from each of
 * the 40 locations, and caches the resulting distance matrix in module scope.
 *
 * Validates that all computed distances fall within [0, 6] (the graph diameter).
 */
export async function initializeDistanceMatrix(): Promise<void> {
  // 1. Query all locations and adjacency edges from the DB
  const [locations, edges] = await Promise.all([
    prisma.location.findMany({ select: { id: true } }),
    prisma.adjacency.findMany({
      select: { locationAId: true, locationBId: true },
    }),
  ]);

  // 2. Build adjacency list (both directions since canonical ordering)
  const adjacencyList = new Map<string, Set<string>>();

  for (const location of locations) {
    adjacencyList.set(location.id, new Set<string>());
  }

  for (const edge of edges) {
    adjacencyList.get(edge.locationAId)!.add(edge.locationBId);
    adjacencyList.get(edge.locationBId)!.add(edge.locationAId);
  }

  // 3. BFS from each location to compute shortest-path distances
  const matrix = new Map<string, Map<string, number>>();

  for (const source of locations) {
    const distances = bfs(source.id, adjacencyList);
    matrix.set(source.id, distances);
  }

  // 4. Validate all distances are in [0, 6]
  for (const [sourceId, distances] of matrix) {
    for (const [targetId, distance] of distances) {
      if (distance < 0 || distance > 6) {
        throw new Error(
          `Distance out of range: ${sourceId} -> ${targetId} = ${distance}. Expected [0, 6].`
        );
      }
    }
  }

  // 5. Store in module-level cache
  distanceMatrix = matrix;
}

/**
 * Returns the shortest-path distance between two locations.
 * Lazily initializes the distance matrix on first call.
 *
 * @returns 0 if locationA === locationB
 * @throws Error if either location is not found in the matrix
 */
export async function getShortestPathDistance(
  locationA: string,
  locationB: string
): Promise<number> {
  if (locationA === locationB) {
    return 0;
  }

  if (distanceMatrix === null) {
    await initializeDistanceMatrix();
  }

  const row = distanceMatrix!.get(locationA);
  if (!row) {
    throw new Error(`Location not found in distance matrix: ${locationA}`);
  }

  const distance = row.get(locationB);
  if (distance === undefined) {
    throw new Error(`Location not found in distance matrix: ${locationB}`);
  }

  return distance;
}

/**
 * Returns the full 40x40 distance matrix.
 * Lazily initializes on first call.
 */
export async function getDistanceMatrix(): Promise<
  Map<string, Map<string, number>>
> {
  if (distanceMatrix === null) {
    await initializeDistanceMatrix();
  }

  return distanceMatrix!;
}

/**
 * Performs BFS from a source node and returns a map of distances to all reachable nodes.
 */
function bfs(
  sourceId: string,
  adjacencyList: Map<string, Set<string>>
): Map<string, number> {
  const distances = new Map<string, number>();
  distances.set(sourceId, 0);

  const queue: string[] = [sourceId];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    const currentDistance = distances.get(current)!;
    const neighbors = adjacencyList.get(current);

    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDistance + 1);
          queue.push(neighbor);
        }
      }
    }
  }

  return distances;
}
