// Feature: action-cards, Property 12: Origin Location Stability
// **Validates: Requirements 3.4, 11.1, 13.1**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveRoundEnd } from "@/lib/turn-engine/resolution/resolve-round-end";

/**
 * Property 12: Origin Location Stability
 *
 * For any `locate-the-mastermind` or `reveal-direction` play followed by any
 * number of MOVE actions by the same Player in the same Round, the resulting
 * Notebook entry's `locationId` equals the Player's Location at the moment the
 * card was played.
 *
 * The key insight: `resolveRoundEnd` reads `clue.originLocationId` from the
 * PendingClue record (captured at play time), NOT the player's current position
 * from `PlayerPosition`. This test verifies that the notebook entry uses
 * originLocationId regardless of subsequent player position changes.
 */

let prisma: PrismaClient;
let roomCounter = 0;

function uniqueRoomCode(): string {
  return `OLS${(++roomCounter).toString().padStart(3, "0")}`;
}

function uniquePlayerId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("Origin Location Stability — Property 12", () => {
  // **Validates: Requirements 3.4, 11.1, 13.1**

  let allLocations: { id: string; regionId: string }[];

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

    // Load all locations for use in tests
    allLocations = await prisma.location.findMany({
      select: { id: true, regionId: true },
    });
    expect(allLocations.length).toBeGreaterThan(0);
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * **Validates: Requirements 3.4, 11.1**
   *
   * For `locate-the-mastermind`: after playing the card at originLocation and
   * subsequently moving the player to a different currentLocation, the resolved
   * notebook entry's locationId equals originLocation (not currentLocation).
   */
  it("locate-the-mastermind notebook entry uses originLocationId even after player moves", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 39 }), // origin location index
        fc.integer({ min: 0, max: 39 }), // current (moved-to) location index
        fc.integer({ min: 0, max: 39 }), // mastermind location index
        fc.integer({ min: 1, max: 10 }), // round number
        async (
          originIdx: number,
          currentIdx: number,
          mastermindIdx: number,
          roundNumber: number
        ) => {
          // Ensure origin and current are different (player has moved)
          const originLocIdx = originIdx % allLocations.length;
          const currentLocIdx = currentIdx % allLocations.length;
          const mastermindLocIdx = mastermindIdx % allLocations.length;

          fc.pre(originLocIdx !== currentLocIdx);

          const originLocationId = allLocations[originLocIdx].id;
          const currentLocationId = allLocations[currentLocIdx].id;
          const mastermindLocationId = allLocations[mastermindLocIdx].id;

          const playerId = uniquePlayerId("ols1", 0);

          await prisma
            .$transaction(async (tx) => {
              // Set up room
              const room = await tx.room.create({
                data: {
                  code: uniqueRoomCode(),
                  status: "in-progress",
                },
              });

              // Create player
              await tx.roomPlayer.create({
                data: {
                  playerId,
                  displayName: "Player 1",
                  roomId: room.id,
                  turnPosition: 1,
                },
              });

              // Player's CURRENT position (after moving) is different from origin
              await tx.playerPosition.create({
                data: {
                  roomId: room.id,
                  playerId,
                  locationId: currentLocationId, // Player has moved here
                  skipNextTurn: false,
                },
              });

              // Mastermind location
              await tx.gameThreat.create({
                data: {
                  roomId: room.id,
                  locationId: mastermindLocationId,
                },
              });

              // Create a PendingClue with originLocationId captured at play time
              await tx.pendingClue.create({
                data: {
                  roomId: room.id,
                  playerId,
                  cardIdentifier: "locate-the-mastermind",
                  roundNumber,
                  originLocationId, // This is where the player WAS when they played the card
                  resolved: false,
                },
              });

              // Resolve round end
              await resolveRoundEnd(room.id, roundNumber, tx);

              // Verify: the notebook entry should use originLocationId, NOT currentLocationId
              const entries = await tx.notebookEntry.findMany({
                where: { roomId: room.id, playerId, entryType: "mastermind_distance" },
              });

              expect(entries).toHaveLength(1);
              const payload = entries[0].payload as {
                type: string;
                locationId: string;
                roundNumber: number;
                stepsAway: number;
              };

              // Core assertion: locationId in the entry matches originLocationId
              expect(payload.locationId).toBe(originLocationId);
              // It must NOT be the player's current position
              expect(payload.locationId).not.toBe(currentLocationId);

              throw new Error("ROLLBACK");
            })
            .catch((e) => {
              if (e.message !== "ROLLBACK") throw e;
            });
        }
      ),
      { numRuns: 30 }
    );
  }, 300000);

  /**
   * **Validates: Requirements 3.4, 13.1**
   *
   * For `reveal-direction`: after playing the card at originLocation and
   * subsequently moving the player to a different currentLocation, the resolved
   * notebook entry's locationId is derived from originLocation (adjacent to it
   * and one step closer to mastermind, or equal to originLocation when d=0).
   */
  it("reveal-direction notebook entry is derived from originLocationId even after player moves", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 39 }), // origin location index
        fc.integer({ min: 0, max: 39 }), // current (moved-to) location index
        fc.integer({ min: 0, max: 39 }), // mastermind location index
        fc.integer({ min: 1, max: 10 }), // round number
        fc.double({ min: 0, max: 0.99, noNaN: true }), // rng value
        async (
          originIdx: number,
          currentIdx: number,
          mastermindIdx: number,
          roundNumber: number,
          rngValue: number
        ) => {
          const originLocIdx = originIdx % allLocations.length;
          const currentLocIdx = currentIdx % allLocations.length;
          const mastermindLocIdx = mastermindIdx % allLocations.length;

          // Ensure origin and current differ (player has moved)
          fc.pre(originLocIdx !== currentLocIdx);

          const originLocationId = allLocations[originLocIdx].id;
          const currentLocationId = allLocations[currentLocIdx].id;
          const mastermindLocationId = allLocations[mastermindLocIdx].id;

          const playerId = uniquePlayerId("ols2", 0);

          await prisma
            .$transaction(async (tx) => {
              // Set up room
              const room = await tx.room.create({
                data: {
                  code: uniqueRoomCode(),
                  status: "in-progress",
                },
              });

              // Create player
              await tx.roomPlayer.create({
                data: {
                  playerId,
                  displayName: "Player 1",
                  roomId: room.id,
                  turnPosition: 1,
                },
              });

              // Player's CURRENT position is the moved-to location
              await tx.playerPosition.create({
                data: {
                  roomId: room.id,
                  playerId,
                  locationId: currentLocationId, // Player moved here after playing the card
                  skipNextTurn: false,
                },
              });

              // Mastermind location
              await tx.gameThreat.create({
                data: {
                  roomId: room.id,
                  locationId: mastermindLocationId,
                },
              });

              // Create a PendingClue with originLocationId captured at play time
              await tx.pendingClue.create({
                data: {
                  roomId: room.id,
                  playerId,
                  cardIdentifier: "reveal-direction",
                  roundNumber,
                  originLocationId, // Where the player was when card was played
                  resolved: false,
                },
              });

              // Resolve round end with fixed rng
              await resolveRoundEnd(room.id, roundNumber, tx, () => rngValue);

              // Verify: the notebook entry should be derived from originLocationId
              const entries = await tx.notebookEntry.findMany({
                where: { roomId: room.id, playerId, entryType: "mastermind_direction" },
              });

              expect(entries).toHaveLength(1);
              const payload = entries[0].payload as {
                type: string;
                locationId: string;
                roundNumber: number;
              };

              if (originLocationId === mastermindLocationId) {
                // d=0 case: revealed location equals origin (Req 13.4)
                expect(payload.locationId).toBe(originLocationId);
              } else {
                // d>0 case: revealed location must be adjacent to ORIGIN, not current position
                // Verify it's adjacent to the origin
                const adjacencies = await tx.adjacency.findMany({
                  where: {
                    OR: [
                      { locationAId: originLocationId },
                      { locationBId: originLocationId },
                    ],
                  },
                });

                const originNeighborIds = adjacencies.map((a) =>
                  a.locationAId === originLocationId ? a.locationBId : a.locationAId
                );

                // The revealed location must be a neighbor of ORIGIN or equal to origin (if d=0)
                expect(originNeighborIds).toContain(payload.locationId);
              }

              // The revealed location should NOT depend on currentLocationId
              // (unless currentLocationId happens to be a neighbor of origin too, which is fine)

              throw new Error("ROLLBACK");
            })
            .catch((e) => {
              if (e.message !== "ROLLBACK") throw e;
            });
        }
      ),
      { numRuns: 30 }
    );
  }, 300000);

  /**
   * **Validates: Requirements 3.4, 11.1, 13.1**
   *
   * Combined scenario: player plays both locate-the-mastermind AND reveal-direction
   * at one origin, then moves multiple times. Both notebook entries use the
   * original play location, proving stability across multiple clue types.
   */
  it("multiple clue cards played at same origin produce entries based on that origin after player moves", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 39 }), // origin location index
        fc.integer({ min: 0, max: 39 }), // final (moved-to) location index
        fc.integer({ min: 0, max: 39 }), // mastermind location index
        fc.integer({ min: 1, max: 10 }), // round number
        fc.double({ min: 0, max: 0.99, noNaN: true }), // rng value
        async (
          originIdx: number,
          finalIdx: number,
          mastermindIdx: number,
          roundNumber: number,
          rngValue: number
        ) => {
          const originLocIdx = originIdx % allLocations.length;
          const finalLocIdx = finalIdx % allLocations.length;
          const mastermindLocIdx = mastermindIdx % allLocations.length;

          // Player must have moved
          fc.pre(originLocIdx !== finalLocIdx);

          const originLocationId = allLocations[originLocIdx].id;
          const finalLocationId = allLocations[finalLocIdx].id;
          const mastermindLocationId = allLocations[mastermindLocIdx].id;

          const playerId = uniquePlayerId("ols3", 0);

          await prisma
            .$transaction(async (tx) => {
              const room = await tx.room.create({
                data: {
                  code: uniqueRoomCode(),
                  status: "in-progress",
                },
              });

              await tx.roomPlayer.create({
                data: {
                  playerId,
                  displayName: "Player 1",
                  roomId: room.id,
                  turnPosition: 1,
                },
              });

              // Player's CURRENT position after multiple moves
              await tx.playerPosition.create({
                data: {
                  roomId: room.id,
                  playerId,
                  locationId: finalLocationId, // Far from origin
                  skipNextTurn: false,
                },
              });

              await tx.gameThreat.create({
                data: {
                  roomId: room.id,
                  locationId: mastermindLocationId,
                },
              });

              // Both clue cards played at the SAME origin location
              await tx.pendingClue.create({
                data: {
                  roomId: room.id,
                  playerId,
                  cardIdentifier: "locate-the-mastermind",
                  roundNumber,
                  originLocationId,
                  resolved: false,
                },
              });

              await tx.pendingClue.create({
                data: {
                  roomId: room.id,
                  playerId,
                  cardIdentifier: "reveal-direction",
                  roundNumber,
                  originLocationId,
                  resolved: false,
                },
              });

              // Resolve round end
              await resolveRoundEnd(room.id, roundNumber, tx, () => rngValue);

              // Verify locate-the-mastermind entry
              const distanceEntries = await tx.notebookEntry.findMany({
                where: { roomId: room.id, playerId, entryType: "mastermind_distance" },
              });
              expect(distanceEntries).toHaveLength(1);
              const distPayload = distanceEntries[0].payload as {
                type: string;
                locationId: string;
                roundNumber: number;
                stepsAway: number;
              };
              expect(distPayload.locationId).toBe(originLocationId);

              // Verify reveal-direction entry
              const dirEntries = await tx.notebookEntry.findMany({
                where: { roomId: room.id, playerId, entryType: "mastermind_direction" },
              });
              expect(dirEntries).toHaveLength(1);
              const dirPayload = dirEntries[0].payload as {
                type: string;
                locationId: string;
                roundNumber: number;
              };

              if (originLocationId === mastermindLocationId) {
                // d=0: revealed location is origin itself
                expect(dirPayload.locationId).toBe(originLocationId);
              } else {
                // d>0: revealed location is adjacent to origin
                const adjacencies = await tx.adjacency.findMany({
                  where: {
                    OR: [
                      { locationAId: originLocationId },
                      { locationBId: originLocationId },
                    ],
                  },
                });
                const originNeighborIds = adjacencies.map((a) =>
                  a.locationAId === originLocationId ? a.locationBId : a.locationAId
                );
                expect(originNeighborIds).toContain(dirPayload.locationId);
              }

              throw new Error("ROLLBACK");
            })
            .catch((e) => {
              if (e.message !== "ROLLBACK") throw e;
            });
        }
      ),
      { numRuns: 20 }
    );
  }, 300000);
});
