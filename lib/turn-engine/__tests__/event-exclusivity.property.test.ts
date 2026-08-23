// Feature: win-detection-game-end
// Property 7: Event mutual exclusivity
// **Validates: Requirements 5.3**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveCaptureAttempt } from "@/lib/turn-engine/resolution/resolve-capture";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import type { TurnState } from "@/lib/turn-engine/types";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

let allLocations: LocationRecord[] = [];
let prisma: PrismaClient;

let roomCounter = 0;

function uniqueRoomCode(): string {
  return `EX${(++roomCounter).toString().padStart(4, "0")}`;
}

const TEST_PLAYER_A = "test-player-excl-a";
const TEST_PLAYER_B = "test-player-excl-b";

describe("Event Mutual Exclusivity Property Tests", () => {
  // **Validates: Requirements 5.3**

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

  describe("Property 7: Event mutual exclusivity", () => {
    // For any finished game session, the Event Feed contains at most one of
    // "game-won" or "game-draw" events, never both.

    it("win path: exactly 1 game-won event and 0 game-draw events", async () => {
      expect(allLocations.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 39 }), // location index for mastermind
          fc.integer({ min: 1, max: 100 }), // round number
          async (locationIdx: number, roundNumber: number) => {
            const mastermindLocation =
              allLocations[locationIdx % allLocations.length];

            await prisma
              .$transaction(async (tx) => {
                // Create an active room
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                    maxRoundLimit: 20,
                  },
                });

                // Create players
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

                // Place Mastermind at the same location as Player A (so capture succeeds)
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLocation.id,
                  },
                });

                // Resolve capture — player A is at mastermind location → win
                const result = await resolveCaptureAttempt(
                  room.id,
                  TEST_PLAYER_A,
                  mastermindLocation.id,
                  roundNumber,
                  tx
                );

                // Verify the capture succeeded
                expect(result.result).toBe("success");

                // ASSERT: Exactly 1 "game-won" event exists
                const wonEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-won" },
                });
                expect(wonEvents).toHaveLength(1);

                // ASSERT: 0 "game-draw" events exist
                const drawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });
                expect(drawEvents).toHaveLength(0);

                // ASSERT: Mutual exclusivity — count of (game-won + game-draw) === 1
                const endEvents = await tx.gameEvent.findMany({
                  where: {
                    roomId: room.id,
                    type: { in: ["game-won", "game-draw"] },
                  },
                });
                expect(endEvents).toHaveLength(1);
                expect(endEvents[0].type).toBe("game-won");

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

    it("draw path: exactly 1 game-draw event and 0 game-won events", async () => {
      expect(allLocations.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 39 }), // mastermind location index
          fc.integer({ min: 0, max: 39 }), // player location index (different from mastermind)
          fc.integer({ min: 1, max: 50 }), // maxRoundLimit
          async (
            mastermindLocIdx: number,
            playerLocIdx: number,
            maxRoundLimit: number
          ) => {
            const mastermindLocation =
              allLocations[mastermindLocIdx % allLocations.length];
            // Ensure player is NOT at the mastermind location (no accidental win)
            const playerLocation =
              allLocations[
                playerLocIdx === mastermindLocIdx
                  ? (playerLocIdx + 1) % allLocations.length
                  : playerLocIdx % allLocations.length
              ];

            await prisma
              .$transaction(async (tx) => {
                // Create an active room at exactly the maxRoundLimit
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                    maxRoundLimit,
                  },
                });

                // Create players
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

                // Create player positions (players NOT at mastermind location)
                await tx.playerPosition.createMany({
                  data: [
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_A,
                      locationId: playerLocation.id,
                      skipNextTurn: false,
                    },
                    {
                      roomId: room.id,
                      playerId: TEST_PLAYER_B,
                      locationId: playerLocation.id,
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

                // Create GameTurn with Player B (last) at current round = maxRoundLimit
                // Advancing past Player B wraps to Player A → new round > maxRoundLimit → draw
                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: maxRoundLimit,
                    actionsRemaining: 2,
                    actionBudget: 2,
                    captureAttemptFlag: false,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_B,
                  currentRound: maxRoundLimit,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  isExtraTurn: false,
                  version: 0,
                };

                // Call advanceTurn — should trigger draw
                const drawResult = await advanceTurn(room.id, turnState, tx);

                // Verify draw was detected
                expect(drawResult.drawDetected).toBe(true);

                // ASSERT: Exactly 1 "game-draw" event exists
                const drawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });
                expect(drawEvents).toHaveLength(1);

                // ASSERT: 0 "game-won" events exist
                const wonEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-won" },
                });
                expect(wonEvents).toHaveLength(0);

                // ASSERT: Mutual exclusivity — count of (game-won + game-draw) === 1
                const endEvents = await tx.gameEvent.findMany({
                  where: {
                    roomId: room.id,
                    type: { in: ["game-won", "game-draw"] },
                  },
                });
                expect(endEvents).toHaveLength(1);
                expect(endEvents[0].type).toBe("game-draw");

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

    it("win followed by advanceTurn does not produce a game-draw event (guard clause)", async () => {
      // This tests the critical interplay: after a win, if advanceTurn were
      // called (hypothetically), the guard on room status prevents a second
      // end-game event. This proves mutual exclusivity even when both paths
      // could theoretically fire on the same room.
      expect(allLocations.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 39 }), // location index
          fc.integer({ min: 1, max: 50 }), // maxRoundLimit
          async (locationIdx: number, maxRoundLimit: number) => {
            const mastermindLocation =
              allLocations[locationIdx % allLocations.length];

            await prisma
              .$transaction(async (tx) => {
                // Create a room where a win can occur AND the round would
                // otherwise trigger a draw (both conditions met)
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                    maxRoundLimit,
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

                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLocation.id,
                  },
                });

                // Set current round at maxRoundLimit — so wrapping would exceed it
                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: maxRoundLimit,
                    actionsRemaining: 2,
                    actionBudget: 2,
                    captureAttemptFlag: false,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_B,
                  currentRound: maxRoundLimit,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  isExtraTurn: false,
                  version: 0,
                };

                // First: resolve a successful capture → room becomes "finished" with "game-won" event
                const captureResult = await resolveCaptureAttempt(
                  room.id,
                  TEST_PLAYER_A,
                  mastermindLocation.id,
                  maxRoundLimit,
                  tx
                );
                expect(captureResult.result).toBe("success");

                // Now: call advanceTurn on the already-finished room
                // (simulating a scenario where both paths could fire)
                const drawResult = await advanceTurn(room.id, turnState, tx);

                // The guard clause should prevent draw from firing
                expect(drawResult.drawDetected).toBe(false);

                // ASSERT: Exactly 1 "game-won" event
                const wonEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-won" },
                });
                expect(wonEvents).toHaveLength(1);

                // ASSERT: 0 "game-draw" events
                const drawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });
                expect(drawEvents).toHaveLength(0);

                // ASSERT: Total end-game events is exactly 1
                const endEvents = await tx.gameEvent.findMany({
                  where: {
                    roomId: room.id,
                    type: { in: ["game-won", "game-draw"] },
                  },
                });
                expect(endEvents).toHaveLength(1);

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
