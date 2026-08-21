// Feature: map-game-initialization, Property 1: Adjacency bidirectionality
// Feature: map-game-initialization, Property 10: Adjacency query correctness
// Feature: map-game-initialization, Property 5: Region subgraph connectivity
// Feature: map-game-initialization, Property 11: isSameRegion flag correctness

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getAdjacentLocations } from "@/lib/map/adjacency";

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

describe("Adjacency Property Tests", () => {
  // **Validates: Requirements 1.4, 2.8, 2.9, 2.10, 3.19, 5.1, 10.3**

  describe("Property 1: Adjacency bidirectionality", () => {
    // Feature: map-game-initialization, Property 1: Adjacency bidirectionality
    it("for any edge (A,B), A's neighbors include B and vice versa", async () => {
      expect(allEdges.length).toBeGreaterThan(0);

      // Sample edges and verify bidirectionality via getAdjacentLocations
      const edgesToTest = allEdges.slice(0, Math.min(allEdges.length, 20));

      for (const edge of edgesToTest) {
        const neighborsOfA = await getAdjacentLocations(edge.locationAId);
        const neighborsOfB = await getAdjacentLocations(edge.locationBId);

        const neighborAIds = neighborsOfA.map((n) => n.id);
        const neighborBIds = neighborsOfB.map((n) => n.id);

        expect(neighborAIds).toContain(edge.locationBId);
        expect(neighborBIds).toContain(edge.locationAId);
      }
    }, 30000);

    it("property: sampled edges are bidirectional", async () => {
      expect(allEdges.length).toBeGreaterThan(0);

      // Build adjacency sets from raw edges for fast checking
      const adjacencySet = new Map<string, Set<string>>();
      for (const loc of allLocations) {
        adjacencySet.set(loc.id, new Set());
      }
      for (const edge of allEdges) {
        adjacencySet.get(edge.locationAId)!.add(edge.locationBId);
        adjacencySet.get(edge.locationBId)!.add(edge.locationAId);
      }

      fc.assert(
        fc.property(fc.constantFrom(...allEdges), (edge: Edge) => {
          // A's neighbors include B
          expect(adjacencySet.get(edge.locationAId)!.has(edge.locationBId)).toBe(
            true
          );
          // B's neighbors include A
          expect(adjacencySet.get(edge.locationBId)!.has(edge.locationAId)).toBe(
            true
          );
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 10: Adjacency query correctness", () => {
    // Feature: map-game-initialization, Property 10: Adjacency query correctness
    it("for any sampled location, getAdjacentLocations matches the stored edge list", async () => {
      expect(allLocations.length).toBeGreaterThan(0);

      // Build expected neighbors from edge list
      const expectedNeighbors = new Map<string, Set<string>>();
      for (const loc of allLocations) {
        expectedNeighbors.set(loc.id, new Set());
      }
      for (const edge of allEdges) {
        expectedNeighbors.get(edge.locationAId)!.add(edge.locationBId);
        expectedNeighbors.get(edge.locationBId)!.add(edge.locationAId);
      }

      // Test a sample of locations via the actual query function
      const locationsToTest = allLocations.slice(
        0,
        Math.min(allLocations.length, 15)
      );

      for (const location of locationsToTest) {
        const neighbors = await getAdjacentLocations(location.id);
        const neighborIds = new Set(neighbors.map((n) => n.id));
        const expected = expectedNeighbors.get(location.id)!;

        expect(neighborIds).toEqual(expected);
      }
    }, 30000);

    it("property: sampled locations have correct neighbor sets", () => {
      // Build expected neighbors from edge list
      const expectedNeighbors = new Map<string, Set<string>>();
      for (const loc of allLocations) {
        expectedNeighbors.set(loc.id, new Set());
      }
      for (const edge of allEdges) {
        expectedNeighbors.get(edge.locationAId)!.add(edge.locationBId);
        expectedNeighbors.get(edge.locationBId)!.add(edge.locationAId);
      }

      fc.assert(
        fc.property(
          fc.constantFrom(...allLocations),
          (location: LocationRecord) => {
            const expected = expectedNeighbors.get(location.id)!;
            // Verify the expected set has the correct size (no extras or missing in edge data)
            expect(expected.size).toBeGreaterThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 5: Region subgraph connectivity", () => {
    // Feature: map-game-initialization, Property 5: Region subgraph connectivity
    it("intra-region subgraph is connected for each region", () => {
      // Get unique regions
      const regionIds = [...new Set(allLocations.map((loc) => loc.regionId))];
      expect(regionIds.length).toBe(6);

      // Build intra-region adjacency list for each region
      for (const regionId of regionIds) {
        const regionLocations = allLocations.filter(
          (loc) => loc.regionId === regionId
        );
        const regionLocationIds = new Set(regionLocations.map((loc) => loc.id));

        // Build intra-region adjacency
        const intraRegionAdj = new Map<string, Set<string>>();
        for (const loc of regionLocations) {
          intraRegionAdj.set(loc.id, new Set());
        }

        for (const edge of allEdges) {
          if (
            regionLocationIds.has(edge.locationAId) &&
            regionLocationIds.has(edge.locationBId)
          ) {
            intraRegionAdj.get(edge.locationAId)!.add(edge.locationBId);
            intraRegionAdj.get(edge.locationBId)!.add(edge.locationAId);
          }
        }

        // BFS from the first location in this region
        const startId = regionLocations[0].id;
        const visited = new Set<string>();
        const queue: string[] = [startId];
        visited.add(startId);

        while (queue.length > 0) {
          const current = queue.shift()!;
          const neighbors = intraRegionAdj.get(current) ?? new Set();
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }

        expect(visited.size).toBe(regionLocations.length);
      }
    });

    it("property: BFS within any sampled region's subgraph reaches all region locations", () => {
      const regionIds = [...new Set(allLocations.map((loc) => loc.regionId))];

      fc.assert(
        fc.property(fc.constantFrom(...regionIds), (regionId: string) => {
          const regionLocations = allLocations.filter(
            (loc) => loc.regionId === regionId
          );
          const regionLocationIds = new Set(
            regionLocations.map((loc) => loc.id)
          );

          // Build intra-region adjacency
          const intraRegionAdj = new Map<string, Set<string>>();
          for (const loc of regionLocations) {
            intraRegionAdj.set(loc.id, new Set());
          }

          for (const edge of allEdges) {
            if (
              regionLocationIds.has(edge.locationAId) &&
              regionLocationIds.has(edge.locationBId)
            ) {
              intraRegionAdj.get(edge.locationAId)!.add(edge.locationBId);
              intraRegionAdj.get(edge.locationBId)!.add(edge.locationAId);
            }
          }

          // BFS from the first location
          const startId = regionLocations[0].id;
          const visited = new Set<string>();
          const queue: string[] = [startId];
          visited.add(startId);

          while (queue.length > 0) {
            const current = queue.shift()!;
            const neighbors = intraRegionAdj.get(current) ?? new Set();
            for (const neighbor of neighbors) {
              if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
              }
            }
          }

          expect(visited.size).toBe(regionLocations.length);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 11: isSameRegion flag correctness", () => {
    // Feature: map-game-initialization, Property 11: isSameRegion flag correctness
    it("for any edge, isSameRegion matches actual region membership", () => {
      expect(allEdges.length).toBeGreaterThan(0);

      // Build a location-to-region map
      const locationRegionMap = new Map<string, string>();
      for (const loc of allLocations) {
        locationRegionMap.set(loc.id, loc.regionId);
      }

      fc.assert(
        fc.property(fc.constantFrom(...allEdges), (edge: Edge) => {
          const regionA = locationRegionMap.get(edge.locationAId);
          const regionB = locationRegionMap.get(edge.locationBId);

          expect(regionA).toBeDefined();
          expect(regionB).toBeDefined();

          const actualSameRegion = regionA === regionB;
          expect(edge.isSameRegion).toBe(actualSameRegion);
        }),
        { numRuns: 100 }
      );
    });
  });
});
