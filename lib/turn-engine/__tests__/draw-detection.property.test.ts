// Feature: win-detection-game-end
// Property 1: Draw triggers exactly when round exceeds limit on an active game
// Property 2: Draw never fires on an already-finished game
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 5.3**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import { TurnState } from "@/lib/turn-engine/types";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

let allLocations: LocationRecord[] = [];
let prisma: PrismaClient;

let roomCounter = 0;

const TEST_PLAYER_A = "test-player-draw-detect-a";
const TEST_PLAYER_B = "test-player-draw-detect-b";

describe("Draw Detection Property Tests", () => {
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

  describe("Property 1: Draw triggers exactly when round exceeds limit on an active game", () => {
    // **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    // For any game state where room is "in-progress" and advanceTurn increments
    // the round counter beyond maxRoundLimit, the system SHALL:
    // - Transition room status to "finished"
    // - Create a GameResult with outcome "draw"
    // - Emit a "game-draw" event
    // - Return { drawDetected: true }

    it("draw triggers when last player's turn wraps round past maxRoundLimit", async () => {
      expect(allLocations.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          // maxRoundLimit in [1, 50] (smaller range for fast testing)
          fc.integer({ min: 1, max: 50 }),
          // location index for mastermind placement
          fc.integer({ min: 0, max: 39 }),
          async (maxRoundLimit: number, locationIdx: number) => {
            const mastermindLocation =
              allLocations[locationIdx % allLocations.length];

            // Set currentRound to exactly maxRoundLimit.
            // Player B is the last player (turnPosition: 2).
            // When advanceTurn moves past Player B, it wraps to Player A
            // and increments round to maxRoundLimit + 1 > maxRoundLimit → draw.
            const currentRound = maxRoundLimit;

            await prisma
              .$transaction(async (tx) => {
                // Create an active ("in-progress") room
                const room = await tx.room.create({
                  data: {
                    code: `DD${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                    maxRoundLimit,
                  },
                });

                // Create two players in round-robin order
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

                // Create player positions (required by advanceTurn skip logic)
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

                // Place Mastermind (required for draw event payload)
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLocation.id,
                  },
                });

                // Create GameTurn with Player B as current (last in order)
                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: currentRound,
                    currentSlot: 1,
                    captureAttemptFlag: false,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_B,
                  currentRound: currentRound,
                  currentSlot: 1,
                  captureAttemptFlag: false,
                  version: 0,
                };

                // Call advanceTurn — should detect draw
                const result = await advanceTurn(room.id, turnState, tx);

                // ASSERT: drawDetected is true with correct draw event data
                expect(result.drawDetected).toBe(true);
                expect(result.drawEvent).toBeDefined();
                expect(result.drawEvent!.roundNumber).toBe(
                  maxRoundLimit + 1
                );
                expect(result.drawEvent!.mastermindLocationId).toBe(
                  mastermindLocation.id
                );

                // ASSERT: Room status transitioned to "finished"
                const updatedRoom = await tx.room.findUnique({
                  where: { id: room.id },
                  select: { status: true },
                });
                expect(updatedRoom!.status).toBe("finished");

                // ASSERT: GameResult created with outcome "draw"
                const gameResult = await tx.gameResult.findUnique({
                  where: { roomId: room.id },
                });
                expect(gameResult).not.toBeNull();
                expect(gameResult!.outcome).toBe("draw");
                expect(gameResult!.roundNumber).toBe(maxRoundLimit + 1);
                expect(gameResult!.mastermindLocationId).toBe(
                  mastermindLocation.id
                );
                expect(gameResult!.winnerId).toBeNull();
                expect(gameResult!.winLocationId).toBeNull();
                expect(gameResult!.reason).toBe("max-rounds-exceeded");

                // ASSERT: "game-draw" event emitted
                const drawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });
                expect(drawEvents).toHaveLength(1);
                const drawEvent = drawEvents[0];
                expect(
                  (drawEvent.payload as Record<string, unknown>)
                    .mastermindLocationId
                ).toBe(mastermindLocation.id);
                expect(
                  (drawEvent.payload as Record<string, unknown>).roundNumber
                ).toBe(maxRoundLimit + 1);
                expect(
                  (drawEvent.payload as Record<string, unknown>).reason
                ).toBe("max-rounds-exceeded");

                // Rollback transaction
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

    it("draw does NOT trigger when round does not exceed maxRoundLimit", async () => {
      // Complementary property: when advanceTurn wraps the round to a value
      // still <= maxRoundLimit, no draw fires and the game continues normally.
      await fc.assert(
        fc.asyncProperty(
          // maxRoundLimit in [2, 100] (at least 2 so wrapping to round 2 is within limit)
          fc.integer({ min: 2, max: 100 }),
          fc.integer({ min: 0, max: 39 }),
          async (maxRoundLimit: number, locationIdx: number) => {
            const mastermindLocation =
              allLocations[locationIdx % allLocations.length];

            // currentRound is strictly less than maxRoundLimit, so wrapping
            // to currentRound + 1 stays within limit
            const currentRound = maxRoundLimit - 1;

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: `DD${(++roomCounter).toString().padStart(4, "0")}`,
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

                // Player B is last; advancing wraps to Player A, round becomes currentRound + 1
                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: currentRound,
                    currentSlot: 1,
                    captureAttemptFlag: false,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_B,
                  currentRound: currentRound,
                  currentSlot: 1,
                  captureAttemptFlag: false,
                  version: 0,
                };

                // Call advanceTurn — should NOT detect draw
                const result = await advanceTurn(room.id, turnState, tx);

                // ASSERT: drawDetected is false
                expect(result.drawDetected).toBe(false);
                expect(result.drawEvent).toBeUndefined();

                // ASSERT: Room status remains "in-progress"
                const updatedRoom = await tx.room.findUnique({
                  where: { id: room.id },
                  select: { status: true },
                });
                expect(updatedRoom!.status).toBe("in-progress");

                // ASSERT: No GameResult created
                const gameResult = await tx.gameResult.findUnique({
                  where: { roomId: room.id },
                });
                expect(gameResult).toBeNull();

                // ASSERT: No "game-draw" event emitted
                const drawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });
                expect(drawEvents).toHaveLength(0);

                // ASSERT: GameTurn updated to next player (normal advancement)
                const updatedTurn = await tx.gameTurn.findUnique({
                  where: { id: gameTurn.id },
                });
                expect(updatedTurn!.currentPlayerId).toBe(TEST_PLAYER_A);
                expect(updatedTurn!.currentRound).toBe(currentRound + 1);

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

  describe("Property 2: Draw never fires on an already-finished game", () => {
    // **Validates: Requirements 1.7, 5.3**
    // For any game state where room status is already "finished",
    // calling advanceTurn does NOT emit "game-draw" event,
    // does NOT create GameResult, and does NOT modify room status.

    it("advanceTurn on a finished room returns { drawDetected: false } without side effects", async () => {
      expect(allLocations.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          // maxRoundLimit in [1, 100]
          fc.integer({ min: 1, max: 100 }),
          // currentRound guaranteed to exceed maxRoundLimit (draw would trigger if room were active)
          fc.integer({ min: 1, max: 50 }),
          // location index for mastermind placement
          fc.integer({ min: 0, max: 39 }),
          async (
            maxRoundLimit: number,
            roundOffset: number,
            locationIdx: number
          ) => {
            // Ensure currentRound exceeds maxRoundLimit so draw WOULD fire on an active game
            const currentRound = maxRoundLimit + roundOffset;
            const mastermindLocation =
              allLocations[locationIdx % allLocations.length];

            await prisma
              .$transaction(async (tx) => {
                // Create a room that is ALREADY finished (e.g., from a prior capture)
                const room = await tx.room.create({
                  data: {
                    code: `DG${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "finished",
                    maxRoundLimit,
                  },
                });

                // Create two players for round-robin
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

                // Place Mastermind (needed in case draw detection incorrectly proceeds)
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLocation.id,
                  },
                });

                // Create GameTurn with a round that exceeds maxRoundLimit
                // (Player B is current, so advancing wraps to Player A → new round)
                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: currentRound,
                    currentSlot: 1,
                    captureAttemptFlag: false,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_B,
                  currentRound: currentRound,
                  currentSlot: 1,
                  captureAttemptFlag: false,
                  version: 0,
                };

                // Count events before advanceTurn
                const eventsBefore = await tx.gameEvent.count({
                  where: { roomId: room.id },
                });

                // Count game results before advanceTurn
                const resultsBefore = await tx.gameResult.count({
                  where: { roomId: room.id },
                });

                // Call advanceTurn - should bail out immediately due to finished status
                const result = await advanceTurn(room.id, turnState, tx);

                // ASSERT: drawDetected must be false
                expect(result.drawDetected).toBe(false);
                expect(result.drawEvent).toBeUndefined();

                // ASSERT: No "game-draw" event emitted
                const eventsAfter = await tx.gameEvent.count({
                  where: { roomId: room.id },
                });
                expect(eventsAfter).toBe(eventsBefore);

                // Specifically check no game-draw event exists
                const drawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });
                expect(drawEvents).toHaveLength(0);

                // ASSERT: No GameResult created
                const resultsAfter = await tx.gameResult.count({
                  where: { roomId: room.id },
                });
                expect(resultsAfter).toBe(resultsBefore);

                // ASSERT: Room status unchanged (still "finished")
                const updatedRoom = await tx.room.findUnique({
                  where: { id: room.id },
                  select: { status: true },
                });
                expect(updatedRoom!.status).toBe("finished");

                // Rollback
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

    it("advanceTurn on a finished room with existing GameResult does not create duplicate", async () => {
      // Edge case: room already has a GameResult (from prior win) — advanceTurn must not try to create another
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: 39 }),
          async (maxRoundLimit: number, locationIdx: number) => {
            const currentRound = maxRoundLimit + 5; // Would exceed limit
            const mastermindLocation =
              allLocations[locationIdx % allLocations.length];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: `DG${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "finished",
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

                // Pre-existing GameResult from a win
                await tx.gameResult.create({
                  data: {
                    roomId: room.id,
                    outcome: "win",
                    winnerId: TEST_PLAYER_A,
                    winLocationId: mastermindLocation.id,
                    mastermindLocationId: mastermindLocation.id,
                    roundNumber: currentRound - 1,
                  },
                });

                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: TEST_PLAYER_B,
                    currentRound: currentRound,
                    currentSlot: 1,
                    captureAttemptFlag: false,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_B,
                  currentRound: currentRound,
                  currentSlot: 1,
                  captureAttemptFlag: false,
                  version: 0,
                };

                // Call advanceTurn
                const result = await advanceTurn(room.id, turnState, tx);

                // Must not fire draw
                expect(result.drawDetected).toBe(false);
                expect(result.drawEvent).toBeUndefined();

                // Must still have exactly one GameResult (the pre-existing win)
                const results = await tx.gameResult.findMany({
                  where: { roomId: room.id },
                });
                expect(results).toHaveLength(1);
                expect(results[0].outcome).toBe("win");

                // No draw events
                const drawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });
                expect(drawEvents).toHaveLength(0);

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
