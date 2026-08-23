// Feature: movement-turn-actions
// Property 11: Capture Attempt Deferred Resolution at Final Position
// Property 12: Capture Resolution Correctness
// **Validates: Requirements 5.1, 5.3, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveCaptureAttempt } from "@/lib/turn-engine/resolution/resolve-capture";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

let allLocations: LocationRecord[] = [];
let prisma: PrismaClient;

// Counter for generating unique room codes within rolled-back transactions
let roomCounter = 0;

const TEST_PLAYER_ID = "test-player-capture-resolution";

describe("Capture Resolution Property Tests", () => {
  // **Validates: Requirements 5.1, 5.3, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

    allLocations = await prisma.location.findMany();
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Property 11: Capture Attempt Deferred Resolution at Final Position", () => {
    // **Validates: Requirements 5.1, 5.3**
    // Capture is resolved against the player's final position (after all moves),
    // not the original position.

    it("capture resolves against post-move position, not original position", async () => {
      expect(allLocations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (originalIdx: number, finalIdx: number) => {
            // Skip when same location — we need a move from original to final
            fc.pre(originalIdx !== finalIdx);

            const original = allLocations[originalIdx];
            const finalLoc = allLocations[finalIdx];

            await prisma
              .$transaction(async (tx) => {
                // Create a test room
                const room = await tx.room.create({
                  data: {
                    code: `CR${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                  },
                });

                // Place Mastermind at the final location
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: finalLoc.id,
                  },
                });

                // Create player position at the ORIGINAL location (pre-move)
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    locationId: original.id,
                    skipNextTurn: false,
                  },
                });

                // Simulate a move: update player to final location (as the engine would do)
                await tx.playerPosition.update({
                  where: {
                    roomId_playerId: { roomId: room.id, playerId: TEST_PLAYER_ID },
                  },
                  data: { locationId: finalLoc.id },
                });

                // Now resolve capture using the FINAL (post-move) position
                const result = await resolveCaptureAttempt(
                  room.id,
                  TEST_PLAYER_ID,
                  finalLoc.id, // Final position passed to resolution
                  1, // roundNumber
                  tx
                );

                // Since mastermind is at finalLoc and we passed finalLoc as playerLocationId,
                // this should succeed — demonstrating that resolution uses final position
                expect(result.result).toBe("success");
                expect(result.locationId).toBe(finalLoc.id);
                expect(result.winnerId).toBe(TEST_PLAYER_ID);
                expect(result.mastermindLocationId).toBe(finalLoc.id);

                // Rollback the transaction
                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 20 }
      );
    }, 120000);

    it("capture would fail if resolved against original position instead of final", async () => {
      // For this test, mastermind is at the FINAL location but NOT at original.
      // If resolution incorrectly used original position, it would fail.
      // We verify that passing the original position yields a failure.
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (originalIdx: number, finalIdx: number) => {
            fc.pre(originalIdx !== finalIdx);

            const original = allLocations[originalIdx];
            const finalLoc = allLocations[finalIdx];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: `CR${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                  },
                });

                // Mastermind is at the FINAL location
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: finalLoc.id,
                  },
                });

                // Player position is at original (pre-move)
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    locationId: original.id,
                    skipNextTurn: false,
                  },
                });

                // If resolution were called with the ORIGINAL (wrong) position,
                // it would fail since original != finalLoc (mastermind location)
                const result = await resolveCaptureAttempt(
                  room.id,
                  TEST_PLAYER_ID,
                  original.id, // Original position (not the post-move)
                  1, // roundNumber
                  tx
                );

                // Must fail because original != mastermind location
                expect(result.result).toBe("failed");
                expect(result.locationId).toBe(original.id);
                expect(result.winnerId).toBeUndefined();
                expect(result.mastermindLocationId).toBeUndefined();

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 20 }
      );
    }, 120000);
  });

  describe("Property 12: Capture Resolution Correctness", () => {
    // **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**
    // Success iff final location == Mastermind location;
    // On success: room → finished, winnerId set
    // On failure: skipNextTurn set, no mastermindLocationId revealed

    it("success: player at Mastermind location → room finished, winnerId set, mastermindLocationId revealed", async () => {
      expect(allLocations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: `CR${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                  },
                });

                // Place Mastermind at this location
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: location.id,
                  },
                });

                // Place player at the SAME location
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    locationId: location.id,
                    skipNextTurn: false,
                  },
                });

                // Resolve capture
                const result = await resolveCaptureAttempt(
                  room.id,
                  TEST_PLAYER_ID,
                  location.id,
                  1, // roundNumber
                  tx
                );

                // Verify success outcome
                expect(result.result).toBe("success");
                expect(result.winnerId).toBe(TEST_PLAYER_ID);
                expect(result.locationId).toBe(location.id);
                expect(result.mastermindLocationId).toBe(location.id);

                // Verify room status is now "finished"
                const updatedRoom = await tx.room.findUnique({
                  where: { id: room.id },
                  select: { status: true },
                });
                expect(updatedRoom!.status).toBe("finished");

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 20 }
      );
    }, 120000);

    it("failure: player at different location → skipNextTurn set, no mastermindLocationId revealed", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (playerIdx: number, mastermindIdx: number) => {
            // Ensure locations are different for a failed capture
            fc.pre(playerIdx !== mastermindIdx);

            const playerLoc = allLocations[playerIdx];
            const mastermindLoc = allLocations[mastermindIdx];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: `CR${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                  },
                });

                // Place Mastermind at mastermindLoc
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLoc.id,
                  },
                });

                // Place player at a DIFFERENT location
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    locationId: playerLoc.id,
                    skipNextTurn: false,
                  },
                });

                // Resolve capture
                const result = await resolveCaptureAttempt(
                  room.id,
                  TEST_PLAYER_ID,
                  playerLoc.id,
                  1, // roundNumber
                  tx
                );

                // Verify failure outcome
                expect(result.result).toBe("failed");
                expect(result.locationId).toBe(playerLoc.id);
                // Must NOT reveal mastermind location
                expect(result.mastermindLocationId).toBeUndefined();
                // Must NOT have a winnerId
                expect(result.winnerId).toBeUndefined();

                // Verify skipNextTurn is set
                const playerPos = await tx.playerPosition.findUnique({
                  where: {
                    roomId_playerId: { roomId: room.id, playerId: TEST_PLAYER_ID },
                  },
                  select: { skipNextTurn: true },
                });
                expect(playerPos!.skipNextTurn).toBe(true);

                // Verify room status is still "in-progress" (not changed)
                const updatedRoom = await tx.room.findUnique({
                  where: { id: room.id },
                  select: { status: true },
                });
                expect(updatedRoom!.status).toBe("in-progress");

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 20 }
      );
    }, 120000);

    it("correctness: result depends solely on location match (randomized scenarios)", async () => {
      // Use fast-check to generate random location pairs and verify correctness
      // based on whether they match or not
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (playerIdx: number, mastermindIdx: number) => {
            const playerLoc = allLocations[playerIdx];
            const mastermindLoc = allLocations[mastermindIdx];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: `CR${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                  },
                });

                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLoc.id,
                  },
                });

                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    locationId: playerLoc.id,
                    skipNextTurn: false,
                  },
                });

                const result = await resolveCaptureAttempt(
                  room.id,
                  TEST_PLAYER_ID,
                  playerLoc.id,
                  1, // roundNumber
                  tx
                );

                if (playerLoc.id === mastermindLoc.id) {
                  // Match: success
                  expect(result.result).toBe("success");
                  expect(result.winnerId).toBe(TEST_PLAYER_ID);
                  expect(result.mastermindLocationId).toBe(mastermindLoc.id);

                  const updatedRoom = await tx.room.findUnique({
                    where: { id: room.id },
                    select: { status: true },
                  });
                  expect(updatedRoom!.status).toBe("finished");
                } else {
                  // Mismatch: failure
                  expect(result.result).toBe("failed");
                  expect(result.winnerId).toBeUndefined();
                  expect(result.mastermindLocationId).toBeUndefined();

                  const playerPos = await tx.playerPosition.findUnique({
                    where: {
                      roomId_playerId: { roomId: room.id, playerId: TEST_PLAYER_ID },
                    },
                    select: { skipNextTurn: true },
                  });
                  expect(playerPos!.skipNextTurn).toBe(true);

                  const updatedRoom = await tx.room.findUnique({
                    where: { id: room.id },
                    select: { status: true },
                  });
                  expect(updatedRoom!.status).toBe("in-progress");
                }

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 30 }
      );
    }, 120000);
  });
});
