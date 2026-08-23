// Feature: win-detection-game-end
// Property 5: Exactly one GameResult per finished game
// **Validates: Requirements 2.3**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveCaptureAttempt } from "@/lib/turn-engine/resolution/resolve-capture";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import type { TurnState } from "@/lib/turn-engine/types";

let prisma: PrismaClient;

// Counter for unique room codes
let roomCounter = 0;

function uniqueRoomCode(): string {
  return `GU${(++roomCounter).toString().padStart(4, "0")}`;
}

const TEST_PLAYER_A = "test-player-uniqueness-a";
const TEST_PLAYER_B = "test-player-uniqueness-b";

describe("GameResult Uniqueness Property Tests", () => {
  // **Validates: Requirements 2.3**

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

  describe("Property 5: Exactly one GameResult per finished game", () => {
    // For any finished game session (whether ended by win or draw),
    // there SHALL exist exactly one GameResult record with that roomId.
    // Attempting to create a second GameResult for the same roomId
    // SHALL be prevented by the unique constraint.

    it("after a win, exactly one GameResult exists and a second insert is rejected by unique constraint", async () => {
      const locations = await prisma.location.findMany();
      expect(locations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 39 }), // location index for mastermind
          fc.integer({ min: 1, max: 100 }), // round number
          async (locIdx: number, roundNumber: number) => {
            const location = locations[locIdx];
            const playerId = `unique-win-${locIdx}-${roundNumber}-${Date.now()}`;

            await prisma
              .$transaction(async (tx) => {
                // Create an in-progress room
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                  },
                });

                // Place Mastermind
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: location.id,
                  },
                });

                // Place player at the SAME location (success case)
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId,
                    locationId: location.id,
                    skipNextTurn: false,
                  },
                });

                // Trigger a win via resolveCaptureAttempt
                const result = await resolveCaptureAttempt(
                  room.id,
                  playerId,
                  location.id,
                  roundNumber,
                  tx
                );
                expect(result.result).toBe("success");

                // Verify exactly one GameResult exists
                const results = await tx.gameResult.findMany({
                  where: { roomId: room.id },
                });
                expect(results).toHaveLength(1);
                expect(results[0].outcome).toBe("win");

                // Attempt to create a second GameResult for the same roomId
                // This should throw a unique constraint violation
                await expect(
                  tx.gameResult.create({
                    data: {
                      roomId: room.id,
                      outcome: "draw",
                      mastermindLocationId: location.id,
                      roundNumber: roundNumber + 1,
                      reason: "max-rounds-exceeded",
                    },
                  })
                ).rejects.toThrow();

                // Verify still exactly one GameResult
                const resultsAfter = await tx.gameResult.findMany({
                  where: { roomId: room.id },
                });
                expect(resultsAfter).toHaveLength(1);
                expect(resultsAfter[0].outcome).toBe("win");

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 100 }
      );
    }, 300000);

    it("after a draw, exactly one GameResult exists and a second insert is rejected by unique constraint", async () => {
      const locations = await prisma.location.findMany();
      expect(locations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }), // maxRoundLimit
          fc.integer({ min: 0, max: 39 }), // location index for mastermind
          async (maxRoundLimit: number, locIdx: number) => {
            const mastermindLocation = locations[locIdx];

            await prisma
              .$transaction(async (tx) => {
                // Create a room at the round limit
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                    maxRoundLimit,
                  },
                });

                // Create two players
                await tx.roomPlayer.createMany({
                  data: [
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_A,
                      displayName: "Player A",
                      turnPosition: 1,
                    },
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_B,
                      displayName: "Player B",
                      turnPosition: 2,
                    },
                  ],
                });

                // Create player positions
                await tx.playerPosition.createMany({
                  data: [
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_A,
                      locationId: mastermindLocation.id,
                      skipNextTurn: false,
                    },
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_B,
                      locationId: mastermindLocation.id,
                      skipNextTurn: false,
                    },
                  ],
                });

                // Place Mastermind
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLocation.id,
                  },
                });

                // Create GameTurn at the last player's turn at max round
                // Advancing will wrap to Player A + increment round past limit → draw
                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: maxRoundLimit,
                    currentSlot: 1,
                    captureAttemptFlag: false,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_B,
                  currentRound: maxRoundLimit,
                  currentSlot: 1,
                  captureAttemptFlag: false,
                  version: 0,
                };

                // Trigger a draw via advanceTurn
                const drawResult = await advanceTurn(room.id, turnState, tx);
                expect(drawResult.drawDetected).toBe(true);

                // Verify exactly one GameResult exists
                const results = await tx.gameResult.findMany({
                  where: { roomId: room.id },
                });
                expect(results).toHaveLength(1);
                expect(results[0].outcome).toBe("draw");

                // Attempt to create a second GameResult for the same roomId
                // This should throw a unique constraint violation
                await expect(
                  tx.gameResult.create({
                    data: {
                      roomId: room.id,
                      outcome: "win",
                      winnerId: TEST_PLAYER_A,
                      winLocationId: mastermindLocation.id,
                      mastermindLocationId: mastermindLocation.id,
                      roundNumber: maxRoundLimit,
                    },
                  })
                ).rejects.toThrow();

                // Verify still exactly one GameResult
                const resultsAfter = await tx.gameResult.findMany({
                  where: { roomId: room.id },
                });
                expect(resultsAfter).toHaveLength(1);
                expect(resultsAfter[0].outcome).toBe("draw");

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 100 }
      );
    }, 300000);

    it("for any finished game scenario (win or draw), count of GameResult records is always exactly 1", async () => {
      const locations = await prisma.location.findMany();
      expect(locations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          // Randomly choose win or draw scenario
          fc.boolean(), // true = win, false = draw
          fc.integer({ min: 0, max: 39 }), // location index
          fc.integer({ min: 1, max: 50 }), // round or maxRoundLimit
          async (isWin: boolean, locIdx: number, roundParam: number) => {
            const location = locations[locIdx];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                    maxRoundLimit: isWin ? 100 : roundParam,
                  },
                });

                await tx.roomPlayer.createMany({
                  data: [
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_A,
                      displayName: "Player A",
                      turnPosition: 1,
                    },
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_B,
                      displayName: "Player B",
                      turnPosition: 2,
                    },
                  ],
                });

                await tx.playerPosition.createMany({
                  data: [
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_A,
                      locationId: location.id,
                      skipNextTurn: false,
                    },
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_B,
                      locationId: location.id,
                      skipNextTurn: false,
                    },
                  ],
                });

                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: location.id,
                  },
                });

                if (isWin) {
                  // Win path: player captures at mastermind location
                  const result = await resolveCaptureAttempt(
                    room.id,
                    TEST_PLAYER_A,
                    location.id,
                    roundParam,
                    tx
                  );
                  expect(result.result).toBe("success");
                } else {
                  // Draw path: advance turn past maxRoundLimit
                  const gameTurn = await tx.gameTurn.create({
                    data: {
                      roomId: room.id,
                      currentPlayerId: TEST_PLAYER_B,
                      currentRound: roundParam, // equals maxRoundLimit
                      currentSlot: 1,
                      captureAttemptFlag: false,
                    },
                  });

                  const turnState: TurnState = {
                    id: gameTurn.id,
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: roundParam,
                    currentSlot: 1,
                    captureAttemptFlag: false,
                    version: 0,
                  };

                  const drawResult = await advanceTurn(room.id, turnState, tx);
                  expect(drawResult.drawDetected).toBe(true);
                }

                // Invariant: exactly one GameResult exists for this room
                const results = await tx.gameResult.findMany({
                  where: { roomId: room.id },
                });
                expect(results).toHaveLength(1);

                // Verify the outcome matches the scenario
                if (isWin) {
                  expect(results[0].outcome).toBe("win");
                  expect(results[0].winnerId).not.toBeNull();
                } else {
                  expect(results[0].outcome).toBe("draw");
                  expect(results[0].winnerId).toBeNull();
                }

                // Verify room is now "finished"
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
        { numRuns: 100 }
      );
    }, 300000);
  });
});
