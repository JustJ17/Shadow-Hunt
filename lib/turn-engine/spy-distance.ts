import { prisma } from "@/lib/prisma";

/**
 * Module-level cache of the spy distance matrix.
 * Built from car/boat edges only (plane edges excluded).
 * Unlike the full-graph distance matrix, this produces different
 * shortest-path values because plane shortcuts are unavailable.
 */
let spyDistanceMatrix: Map<string, Map<string, number>> | null = null;

/**
 * Loads the adjacency graph from the database (car/boat edges only),
 * runs BFS from each location, and caches the resulting distance matrix
 * in module scope.
 *
 * Plane edges are excluded, so distances may be larger than the
 * full-graph distances (no diameter validation needed).
 */
export async function initializeSpyDistanceMatrix(): Promise<void> {
  // 1. Query all locations and car/boat adjacency edges from the DB
  const [locations, edges] = await Promise.all([
    prisma.location.findMany({ select: { id: true } }),
    prisma.adjacency.findMany({
      where: { transport: { in: ["car", "boat"] } },
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
    matrix.set(source.id, bfs(source.id, adjacencyList));
  }

  // 4. Store in module-level cache
  spyDistanceMatrix = matrix;
}

/**
 * Returns the shortest-path distance between two locations using only
 * car/boat edges (plane edges excluded).
 * Lazily initializes the spy distance matrix on first call.
 *
 * @throws Error if either location is not found in the matrix
 */
export async function computeSpyDistance(
  fromLocationId: string,
  toLocationId: string
): Promise<number> {
  if (!spyDistanceMatrix) {
    await initializeSpyDistanceMatrix();
  }

  const row = spyDistanceMatrix!.get(fromLocationId);
  if (!row) {
    throw new Error(
      `Location not found in spy distance matrix: ${fromLocationId}`
    );
  }

  const distance = row.get(toLocationId);
  if (distance === undefined) {
    throw new Error(
      `Location not found in spy distance matrix: ${toLocationId}`
    );
  }

  return distance;
}

/**
 * Resets the cached spy distance matrix. Useful for testing.
 */
export function resetSpyDistanceMatrix(): void {
  spyDistanceMatrix = null;
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
