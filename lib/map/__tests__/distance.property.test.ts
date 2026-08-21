// Feature: map-game-initialization, Property 7: Shortest-path distance correctness
// Feature: map-game-initialization, Property 8: Distance range bounded by diameter
// Feature: map-game-initialization, Property 9: Unique distance vectors

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  getShortestPathDistance,
  getDistanceMatrix,
} from "@/lib/map/distance";

interface Edge {
  id: string;
  locationAId: string;
  locationBId: string;
  isSameRegion: boolean;
}

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

let allEdges: Edge[] = [];
let allLocations: LocationRecord[] = [];
let prisma: PrismaClient;

// Independent BFS implementation for verification
function independentBfs(
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

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter });

  allEdges = await prisma.adjacency.findMany();
  allLocations = await prisma.location.findMany();
}, 30000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Distance Property Tests", () => {
  // **Validates: Requirements 5.3, 5.4, 5.6, 5.7, 11.8**

  describe("Property 7: Shortest-path distance correctness", () => {
    // Feature: map-game-initialization, Property 7: Shortest-path distance correctness
    it("matrix distance equals independent BFS for sampled location pairs", async () => {
      expect(allLocations.length).toBe(40);

      // Build adjacency list for independent BFS
      const adjacencyList = new Map<string, Set<string>>();
      for (const loc of allLocations) {
        adjacencyList.set(loc.id, new Set());
      }
      for (const edge of allEdges) {
        adjacencyList.get(edge.locationAId)!.add(edge.locationBId);
        adjacencyList.get(edge.locationBId)!.add(edge.locationAId);
      }

      // Pre-compute all BFS distances independently
      const independentDistances = new Map<string, Map<string, number>>();
      for (const loc of allLocations) {
        independentDistances.set(loc.id, independentBfs(loc.id, adjacencyList));
      }

      // Use fast-check to sample pairs of locations
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allLocations),
          fc.constantFrom(...allLocations),
          async (locA: LocationRecord, locB: LocationRecord) => {
            const matrixDistance = await getShortestPathDistance(
              locA.id,
              locB.id
            );
            const bfsDistance = independentDistances.get(locA.id)!.get(locB.id)!;

            expect(matrixDistance).toBe(bfsDistance);
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);
  });

  describe("Property 8: Distance range bounded by diameter", () => {
    // Feature: map-game-initialization, Property 8: Distance range bounded by diameter
    it("all distances are in [0, 6]", async () => {
      expect(allLocations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allLocations),
          fc.constantFrom(...allLocations),
          async (locA: LocationRecord, locB: LocationRecord) => {
            const distance = await getShortestPathDistance(locA.id, locB.id);

            expect(distance).toBeGreaterThanOrEqual(0);
            expect(distance).toBeLessThanOrEqual(6);

            // Self-distance should be 0
            if (locA.id === locB.id) {
              expect(distance).toBe(0);
            } else {
              expect(distance).toBeGreaterThanOrEqual(1);
            }
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);

    it("full matrix check: every entry is in [0, 6]", async () => {
      const matrix = await getDistanceMatrix();

      for (const [sourceId, row] of matrix) {
        for (const [targetId, distance] of row) {
          expect(distance).toBeGreaterThanOrEqual(0);
          expect(distance).toBeLessThanOrEqual(6);

          if (sourceId === targetId) {
            expect(distance).toBe(0);
          }
        }
      }
    }, 30000);
  });

  describe("Property 9: Unique distance vectors", () => {
    // Feature: map-game-initialization, Property 9: Unique distance vectors
    it("no two distinct locations share the same distance vector", async () => {
      const matrix = await getDistanceMatrix();

      // Create a canonical ordering of location IDs for consistent vector comparison
      const locationIds = [...matrix.keys()].sort();
      expect(locationIds.length).toBe(40);

      // Build distance vector string for each location
      const vectorStrings = new Map<string, string>();
      for (const locId of locationIds) {
        const row = matrix.get(locId)!;
        const vector = locationIds.map((targetId) => row.get(targetId) ?? -1);
        vectorStrings.set(locId, vector.join(","));
      }

      // Use fast-check to sample pairs of distinct locations and verify different vectors
      const locationPairs = allLocations.flatMap((a) =>
        allLocations
          .filter((b) => a.id < b.id)
          .map((b) => ({ a, b }))
      );

      fc.assert(
        fc.property(
          fc.constantFrom(...locationPairs),
          (pair: { a: LocationRecord; b: LocationRecord }) => {
            const vectorA = vectorStrings.get(pair.a.id)!;
            const vectorB = vectorStrings.get(pair.b.id)!;

            expect(vectorA).not.toBe(vectorB);
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);
  });
});
