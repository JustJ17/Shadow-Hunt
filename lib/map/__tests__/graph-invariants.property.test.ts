// Feature: map-game-initialization, Property 12: Seed idempotency
// Feature: map-game-initialization, Property 2: No self-loops
// Feature: map-game-initialization, Property 4: Canonical edge ordering
// Feature: map-game-initialization, Property 3: Minimum adjacency degree
// Feature: map-game-initialization, Property 6: Full graph connectivity

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

describe("Graph Invariants Property Tests", () => {
  // **Validates: Requirements 1.3, 1.6, 1.7, 4.1, 4.3, 11.4, 11.5, 11.6**

  describe("Property 12: Seed idempotency", () => {
    // Feature: map-game-initialization, Property 12: Seed idempotency
    it("re-upserting all regions leaves counts unchanged (idempotent)", async () => {
      // Record counts before re-running upserts
      const regionCountBefore = await prisma.region.count();
      const locationCountBefore = await prisma.location.count();
      const adjacencyCountBefore = await prisma.adjacency.count();

      // Re-upsert all regions (simulating seed re-run)
      const regionNames = [
        "Europe",
        "Asia",
        "Africa",
        "North America",
        "South America",
        "Oceania",
      ];
      for (const name of regionNames) {
        await prisma.region.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }

      // Re-upsert a sample of locations (simulating seed re-run)
      const sampleLocations = await prisma.location.findMany({ take: 10 });
      for (const loc of sampleLocations) {
        await prisma.location.upsert({
          where: { name: loc.name },
          update: { isHub: loc.isHub, regionId: loc.regionId },
          create: {
            name: loc.name,
            regionId: loc.regionId,
            isHub: loc.isHub,
          },
        });
      }

      // Verify counts remain the same after re-upserts
      const regionCountAfter = await prisma.region.count();
      const locationCountAfter = await prisma.location.count();
      const adjacencyCountAfter = await prisma.adjacency.count();

      expect(regionCountAfter).toBe(regionCountBefore);
      expect(locationCountAfter).toBe(locationCountBefore);
      expect(adjacencyCountAfter).toBe(adjacencyCountBefore);

      // Assert expected totals
      expect(regionCountAfter).toBe(6);
      expect(locationCountAfter).toBe(40);
      expect(adjacencyCountAfter).toBe(72);
    }, 30000);
  });

  describe("Property 2: No self-loops", () => {
    // Feature: map-game-initialization, Property 2: No self-loops
    it("for any edge, endpoints are distinct", () => {
      expect(allEdges.length).toBeGreaterThan(0);

      fc.assert(
        fc.property(fc.constantFrom(...allEdges), (edge: Edge) => {
          expect(edge.locationAId).not.toBe(edge.locationBId);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 4: Canonical edge ordering", () => {
    // Feature: map-game-initialization, Property 4: Canonical edge ordering
    it("for any edge, locationAId < locationBId lexicographically", () => {
      expect(allEdges.length).toBeGreaterThan(0);

      fc.assert(
        fc.property(fc.constantFrom(...allEdges), (edge: Edge) => {
          expect(edge.locationAId < edge.locationBId).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 3: Minimum adjacency degree", () => {
    // Feature: map-game-initialization, Property 3: Minimum adjacency degree
    it("every location has degree >= 2", () => {
      expect(allLocations.length).toBeGreaterThan(0);

      // Compute degree for each location
      const degreeMap = new Map<string, number>();
      for (const loc of allLocations) {
        degreeMap.set(loc.id, 0);
      }
      for (const edge of allEdges) {
        degreeMap.set(
          edge.locationAId,
          (degreeMap.get(edge.locationAId) ?? 0) + 1
        );
        degreeMap.set(
          edge.locationBId,
          (degreeMap.get(edge.locationBId) ?? 0) + 1
        );
      }

      fc.assert(
        fc.property(
          fc.constantFrom(...allLocations),
          (location: LocationRecord) => {
            const degree = degreeMap.get(location.id) ?? 0;
            expect(degree).toBeGreaterThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 6: Full graph connectivity", () => {
    // Feature: map-game-initialization, Property 6: Full graph connectivity
    it("BFS from any node reaches all 40 nodes", () => {
      expect(allLocations.length).toBe(40);

      // Build adjacency list
      const adjacencyList = new Map<string, Set<string>>();
      for (const loc of allLocations) {
        adjacencyList.set(loc.id, new Set());
      }
      for (const edge of allEdges) {
        adjacencyList.get(edge.locationAId)!.add(edge.locationBId);
        adjacencyList.get(edge.locationBId)!.add(edge.locationAId);
      }

      fc.assert(
        fc.property(
          fc.constantFrom(...allLocations),
          (startLocation: LocationRecord) => {
            // BFS from startLocation
            const visited = new Set<string>();
            const queue: string[] = [startLocation.id];
            visited.add(startLocation.id);

            while (queue.length > 0) {
              const current = queue.shift()!;
              const neighbors = adjacencyList.get(current) ?? new Set();
              for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                  visited.add(neighbor);
                  queue.push(neighbor);
                }
              }
            }

            expect(visited.size).toBe(40);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
