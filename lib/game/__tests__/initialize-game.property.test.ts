// Feature: map-game-initialization, Property 13: Exactly one threat
// Feature: map-game-initialization, Property 14: One spy per region

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { initializeGame } from "@/lib/game/initialize-game";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

interface RegionRecord {
  id: string;
  name: string;
}

let prisma: PrismaClient;
let allLocations: LocationRecord[] = [];
let allRegions: RegionRecord[] = [];
let locationIdSet: Set<string>;
let regionLocationMap: Map<string, Set<string>>; // regionId -> set of locationIds

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter });

  allLocations = await prisma.location.findMany();
  allRegions = await prisma.region.findMany();

  locationIdSet = new Set(allLocations.map((l) => l.id));

  // Build a map of regionId -> set of locationIds belonging to that region
  regionLocationMap = new Map();
  for (const location of allLocations) {
    const existing = regionLocationMap.get(location.regionId);
    if (existing) {
      existing.add(location.id);
    } else {
      regionLocationMap.set(location.regionId, new Set([location.id]));
    }
  }
}, 30000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Game Initialization Property Tests", () => {
  // **Validates: Requirements 7.1, 8.1, 8.2, 9.1, 9.2**

  describe("Property 13: Exactly one threat", () => {
    // Feature: map-game-initialization, Property 13: Exactly one threat
    it("initializeGame creates exactly 1 GameThreat with a valid locationId from the 40 locations", async () => {
      expect(allLocations.length).toBe(40);
      expect(allRegions.length).toBe(6);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (seed) => {
            // Create a unique room for this iteration
            const roomCode = `T${seed.toString().padStart(5, "0")}`;
            const room = await prisma.room.create({
              data: {
                code: roomCode,
                status: "waiting",
                visibility: "private",
                playerCount: 0,
              },
            });

            try {
              // Run initializeGame inside a transaction
              const result = await prisma.$transaction(async (tx) => {
                return initializeGame(room.id, tx);
              });

              // Assert success
              expect(result.success).toBe(true);
              if (!result.success) return;

              // Query gameThreat for this room
              const threats = await prisma.gameThreat.findMany({
                where: { roomId: room.id },
              });

              // Exactly 1 threat
              expect(threats.length).toBe(1);

              // Valid locationId from the 40 locations
              expect(locationIdSet.has(threats[0].locationId)).toBe(true);

              // Result matches the DB record
              expect(result.threatLocationId).toBe(threats[0].locationId);
            } finally {
              // Clean up: delete the room (cascade deletes game state)
              await prisma.room.delete({ where: { id: room.id } });
            }
          }
        ),
        { numRuns: 15 }
      );
    }, 60000);
  });

  describe("Property 14: One spy per region", () => {
    // Feature: map-game-initialization, Property 14: One spy per region
    it("initializeGame creates exactly 6 GameSpy records, one per region, each with a locationId belonging to that region", async () => {
      expect(allLocations.length).toBe(40);
      expect(allRegions.length).toBe(6);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 101, max: 200 }),
          async (seed) => {
            // Create a unique room for this iteration
            const roomCode = `S${seed.toString().padStart(5, "0")}`;
            const room = await prisma.room.create({
              data: {
                code: roomCode,
                status: "waiting",
                visibility: "private",
                playerCount: 0,
              },
            });

            try {
              // Run initializeGame inside a transaction
              const result = await prisma.$transaction(async (tx) => {
                return initializeGame(room.id, tx);
              });

              // Assert success
              expect(result.success).toBe(true);
              if (!result.success) return;

              // Query gameSpies for this room
              const spies = await prisma.gameSpy.findMany({
                where: { roomId: room.id },
              });

              // Exactly 6 spies
              expect(spies.length).toBe(6);

              // Each spy has a unique regionId
              const spyRegionIds = spies.map((s) => s.regionId);
              const uniqueRegionIds = new Set(spyRegionIds);
              expect(uniqueRegionIds.size).toBe(6);

              // All region IDs correspond to actual regions
              const allRegionIds = new Set(allRegions.map((r) => r.id));
              for (const regionId of spyRegionIds) {
                expect(allRegionIds.has(regionId)).toBe(true);
              }

              // Each spy's locationId belongs to a location in that spy's region
              for (const spy of spies) {
                const regionLocs = regionLocationMap.get(spy.regionId);
                expect(regionLocs).toBeDefined();
                expect(regionLocs!.has(spy.locationId)).toBe(true);
              }

              // Result spy placements match the DB records
              expect(result.spyPlacements.length).toBe(6);
            } finally {
              // Clean up: delete the room (cascade deletes game state)
              await prisma.room.delete({ where: { id: room.id } });
            }
          }
        ),
        { numRuns: 15 }
      );
    }, 60000);
  });
});
