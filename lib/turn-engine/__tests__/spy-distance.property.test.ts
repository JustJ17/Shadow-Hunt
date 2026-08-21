// Feature: movement-turn-actions, Property 14: Spy Distance Uses Car/Boat Subgraph Only
// **Validates: Requirements 9.7**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  computeSpyDistance,
  resetSpyDistanceMatrix,
} from "@/lib/turn-engine/spy-distance";
import { getShortestPathDistance } from "@/lib/map/distance";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

interface Edge {
  id: string;
  locationAId: string;
  locationBId: string;
  isSameRegion: boolean;
  transport: string;
}

let allLocations: LocationRecord[] = [];
let allEdges: Edge[] = [];
let prisma: PrismaClient;

/**
 * Independent BFS implementation for verification against the car/boat subgraph.
 */
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

describe("Spy Distance Property Tests", () => {
  // **Validates: Requirements 9.7**

  let carBoatAdjacencyList: Map<string, Set<string>>;
  let independentDistances: Map<string, Map<string, number>>;
  let locationsByRegion: Map<string, LocationRecord[]>;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

    allLocations = await prisma.location.findMany();
    allEdges = await prisma.adjacency.findMany();

    // Group locations by region (spy distance is computed within a region)
    locationsByRegion = new Map<string, LocationRecord[]>();
    for (const loc of allLocations) {
      const group = locationsByRegion.get(loc.regionId) ?? [];
      group.push(loc);
      locationsByRegion.set(loc.regionId, group);
    }

    // Build car/boat-only adjacency list for independent verification
    carBoatAdjacencyList = new Map<string, Set<string>>();
    for (const loc of allLocations) {
      carBoatAdjacencyList.set(loc.id, new Set());
    }
    for (const edge of allEdges) {
      if (edge.transport === "car" || edge.transport === "boat") {
        carBoatAdjacencyList.get(edge.locationAId)!.add(edge.locationBId);
        carBoatAdjacencyList.get(edge.locationBId)!.add(edge.locationAId);
      }
    }

    // Pre-compute independent BFS distances over car/boat subgraph
    independentDistances = new Map<string, Map<string, number>>();
    for (const loc of allLocations) {
      independentDistances.set(
        loc.id,
        independentBfs(loc.id, carBoatAdjacencyList)
      );
    }

    // Reset the spy distance matrix to ensure fresh computation against DB
    resetSpyDistanceMatrix();
  }, 30000);

  afterAll(async () => {
    resetSpyDistanceMatrix();
    await prisma.$disconnect();
  });

  describe("Property 14: Spy Distance Uses Car/Boat Subgraph Only", () => {
    it("spy distance >= full-graph distance for same-region location pairs (plane shortcuts excluded)", async () => {
      expect(allLocations.length).toBe(40);

      // Build pairs of locations within the same region
      // (spy distance is only computed within a region per Requirement 9.6)
      const sameRegionPairs: { a: LocationRecord; b: LocationRecord }[] = [];
      for (const regionLocations of locationsByRegion.values()) {
        for (const a of regionLocations) {
          for (const b of regionLocations) {
            sameRegionPairs.push({ a, b });
          }
        }
      }

      expect(sameRegionPairs.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...sameRegionPairs),
          async (pair: { a: LocationRecord; b: LocationRecord }) => {
            const spyDist = await computeSpyDistance(pair.a.id, pair.b.id);
            const fullDist = await getShortestPathDistance(
              pair.a.id,
              pair.b.id
            );

            // Spy distance uses car/boat only, so it should be >= full-graph distance
            // (full graph includes plane shortcuts that can reduce distance)
            expect(spyDist).toBeGreaterThanOrEqual(fullDist);
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);

    it("spy distance matches independent BFS over car/boat-only subgraph", async () => {
      expect(allLocations.length).toBe(40);

      const sameRegionPairs: { a: LocationRecord; b: LocationRecord }[] = [];
      for (const regionLocations of locationsByRegion.values()) {
        for (const a of regionLocations) {
          for (const b of regionLocations) {
            sameRegionPairs.push({ a, b });
          }
        }
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...sameRegionPairs),
          async (pair: { a: LocationRecord; b: LocationRecord }) => {
            const spyDist = await computeSpyDistance(pair.a.id, pair.b.id);
            const expectedDist = independentDistances
              .get(pair.a.id)!
              .get(pair.b.id);

            // The spy distance module should produce the same result as
            // an independent BFS over the car/boat-only subgraph
            expect(spyDist).toBe(expectedDist);
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);

    it("spy distance is symmetric: computeSpyDistance(a, b) === computeSpyDistance(b, a)", async () => {
      const sameRegionPairs: { a: LocationRecord; b: LocationRecord }[] = [];
      for (const regionLocations of locationsByRegion.values()) {
        for (const a of regionLocations) {
          for (const b of regionLocations) {
            if (a.id < b.id) {
              sameRegionPairs.push({ a, b });
            }
          }
        }
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...sameRegionPairs),
          async (pair: { a: LocationRecord; b: LocationRecord }) => {
            const distAB = await computeSpyDistance(pair.a.id, pair.b.id);
            const distBA = await computeSpyDistance(pair.b.id, pair.a.id);

            expect(distAB).toBe(distBA);
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);

    it("spy distance to self is 0", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allLocations),
          async (loc: LocationRecord) => {
            const dist = await computeSpyDistance(loc.id, loc.id);
            expect(dist).toBe(0);
          }
        ),
        { numRuns: 40 }
      );
    }, 30000);
  });
});
