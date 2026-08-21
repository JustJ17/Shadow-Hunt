// Feature: movement-turn-actions, Property 16: Starting Positions at Distinct Hub Locations
// **Validates: Requirements 7.2**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assignStartingPositions } from "@/lib/turn-engine/player-positions";

let prisma: PrismaClient;

describe("Starting Positions Property Tests", () => {
  // **Validates: Requirements 7.2**

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Property 16: Starting Positions at Distinct Hub Locations", () => {
    it("each player starts at the Hub of a distinct Region, no two sharing a Region", async () => {
      // Load all regions with hubs to verify test preconditions
      const regions = await prisma.region.findMany({
        select: { id: true, hubLocationId: true },
      });
      const validRegions = regions.filter((r) => r.hubLocationId !== null);
      expect(validRegions.length).toBeGreaterThanOrEqual(4);

      // Load hub location IDs for verification
      const hubLocationIds = new Set(
        validRegions.map((r) => r.hubLocationId!)
      );

      // Load locations to build hub-to-region map for verification
      const locations = await prisma.location.findMany({
        where: { isHub: true },
        select: { id: true, regionId: true, isHub: true },
      });
      const locationRegionMap = new Map(
        locations.map((loc) => [loc.id, loc.regionId])
      );

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (playerCount: number) => {
            // Generate unique mock player IDs for this run
            const playerIds = Array.from(
              { length: playerCount },
              (_, i) =>
                `test-sp-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`
            );

            // Use a transaction that rolls back to avoid polluting the DB
            let positions: {
              playerId: string;
              locationId: string;
            }[] = [];

            try {
              await prisma.$transaction(async (tx) => {
                // Create a test room inside the transaction
                const room = await tx.room.create({
                  data: {
                    code: Math.random()
                      .toString(36)
                      .slice(2, 8)
                      .toUpperCase()
                      .padEnd(6, "X"),
                    status: "in-progress",
                  },
                });

                // Call assignStartingPositions
                await assignStartingPositions(room.id, playerIds, tx);

                // Fetch all created positions
                positions = await tx.playerPosition.findMany({
                  where: { roomId: room.id },
                  select: { playerId: true, locationId: true },
                });

                // Intentionally throw to rollback the transaction
                throw new Error("ROLLBACK_INTENDED");
              });
            } catch (err: any) {
              if (err.message !== "ROLLBACK_INTENDED") {
                throw err;
              }
            }

            // Verify each player has exactly one position
            expect(positions.length).toBe(playerCount);

            // Verify each player's position is a Hub location
            for (const pos of positions) {
              expect(hubLocationIds.has(pos.locationId)).toBe(true);
            }

            // Verify all player positions are in distinct regions
            const regionIds = positions.map(
              (p) => locationRegionMap.get(p.locationId)!
            );
            const uniqueRegions = new Set(regionIds);
            expect(uniqueRegions.size).toBe(playerCount);

            // Verify no two players share the same location
            const locationIds = positions.map((p) => p.locationId);
            const uniqueLocations = new Set(locationIds);
            expect(uniqueLocations.size).toBe(playerCount);
          }
        ),
        { numRuns: 20 }
      );
    }, 300000);
  });
});
