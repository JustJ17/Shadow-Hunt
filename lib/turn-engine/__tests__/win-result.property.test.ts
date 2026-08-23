// Feature: win-detection-game-end
// Property 4: Win creates correct GameResult
// Property 9: Mastermind location revealed on both outcomes
// **Validates: Requirements 1.3, 2.1, 3.1, 5.1, 5.2**

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
  return `WR${(++roomCounter).toString().padStart(4, "0")}`;
}

function uniquePlayerId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("Win Result Property Tests", () => {
  // **Validates: Requirements 1.3, 2.1, 3.1, 5.1, 5.2**

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

  describe("Property 4: Win creates correct GameResult", () => {
    // **Validates: Requirements 2.1**
    // For any successful capture attempt (player location matches mastermind location),
    // system creates GameResult with outcome "win", correct winnerId, winLocationId
    // matching capture location, correct mastermindLocationId, and current round number.

    it("successful capture creates GameResult with all correct fields", async () => {
      const locations = await prisma.location.findMany();
      expect(locations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 39 }), // location index
          fc.integer({ min: 1, max: 100 }), // round number
          async (locIdx: number, roundNumber: number) => {
            const location = locations[locIdx];
            const playerId = uniquePlayerId("p4", locIdx);

            await prisma
              .$transaction(async (tx) => {
                // Create a test room in-progress
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
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

                // Place player at the SAME location (success case)
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId,
                    locationId: location.id,
                    skipNextTurn: false,
                  },
                });

                // Resolve capture — should succeed since player is at mastermind location
                const result = await resolveCaptureAttempt(
                  room.id,
                  playerId,
                  location.id,
                  roundNumber,
                  tx
                );

                // Verify capture succeeded
                expect(result.result).toBe("success");

                // Query the GameResult record created by resolveCaptureAttempt
                const gameResult = await tx.gameResult.findUnique({
                  where: { roomId: room.id },
                });

                // GameResult must exist
                expect(gameResult).not.toBeNull();

                // Verify all fields match expected values
                expect(gameResult!.outcome).toBe("win");
                expect(gameResult!.winnerId).toBe(playerId);
                expect(gameResult!.winLocationId).toBe(location.id);
                expect(gameResult!.mastermindLocationId).toBe(location.id);
                expect(gameResult!.roundNumber).toBe(roundNumber);

                // Verify room transitioned to finished
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

    it("GameResult winnerId and winLocationId always match the arguments passed to resolveCaptureAttempt", async () => {
      const locations = await prisma.location.findMany();
      expect(locations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 39 }), // location index
          fc.integer({ min: 1, max: 50 }), // round number
          fc.uuid(), // unique player ID per run
          async (locIdx: number, roundNumber: number, playerId: string) => {
            const location = locations[locIdx];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                  },
                });

                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: location.id,
                  },
                });

                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId,
                    locationId: location.id,
                    skipNextTurn: false,
                  },
                });

                const result = await resolveCaptureAttempt(
                  room.id,
                  playerId,
                  location.id,
                  roundNumber,
                  tx
                );

                expect(result.result).toBe("success");

                const gameResult = await tx.gameResult.findUnique({
                  where: { roomId: room.id },
                });

                expect(gameResult).not.toBeNull();
                // winnerId must match the playerId argument
                expect(gameResult!.winnerId).toBe(playerId);
                // winLocationId must match the playerLocationId argument
                expect(gameResult!.winLocationId).toBe(location.id);
                // mastermindLocationId must match the threat location
                expect(gameResult!.mastermindLocationId).toBe(location.id);
                // roundNumber must match the argument
                expect(gameResult!.roundNumber).toBe(roundNumber);

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

  describe("Property 9: Mastermind location revealed on both outcomes", () => {
    // **Validates: Requirements 1.3, 3.1, 5.1, 5.2**

    it("win event payload contains non-null mastermindLocationId matching GameThreat.locationId", async () => {
      // Get two locations for setup
      const locations = await prisma.location.findMany({ take: 5 });
      expect(locations.length).toBeGreaterThanOrEqual(2);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: Math.min(locations.length - 1, 4) }), // mastermind location index
          fc.integer({ min: 1, max: 10 }), // round number
          async (locationIdx: number, roundNumber: number) => {
            const mastermindLocation = locations[locationIdx];
            const playerIds = [
              uniquePlayerId("p9w", 0),
              uniquePlayerId("p9w", 1),
            ];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                  },
                });

                // Create players
                for (let i = 0; i < playerIds.length; i++) {
                  await tx.roomPlayer.create({
                    data: {
                      playerId: playerIds[i],
                      displayName: `Player ${i + 1}`,
                      roomId: room.id,
                      turnPosition: i + 1,
                    },
                  });
                }

                // Create player positions (player 0 is at the mastermind location for a successful capture)
                for (let i = 0; i < playerIds.length; i++) {
                  await tx.playerPosition.create({
                    data: {
                      roomId: room.id,
                      playerId: playerIds[i],
                      locationId: mastermindLocation.id,
                      skipNextTurn: false,
                    },
                  });
                }

                // Create GameThreat at the mastermind location
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLocation.id,
                  },
                });

                // Call resolveCaptureAttempt with player at mastermind location (success path)
                const result = await resolveCaptureAttempt(
                  room.id,
                  playerIds[0],
                  mastermindLocation.id, // player is at mastermind location -> win
                  roundNumber,
                  tx
                );

                // Verify the function return indicates success with mastermind location
                expect(result.result).toBe("success");
                expect(result.mastermindLocationId).toBe(
                  mastermindLocation.id
                );

                // Query the "game-won" event from the Event Feed
                const gameWonEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-won" },
                });

                expect(gameWonEvents.length).toBe(1);
                const eventPayload = gameWonEvents[0].payload as Record<
                  string,
                  unknown
                >;

                // Property: mastermindLocationId in event payload is non-null
                expect(eventPayload.mastermindLocationId).not.toBeNull();
                expect(eventPayload.mastermindLocationId).not.toBeUndefined();

                // Property: mastermindLocationId matches actual GameThreat.locationId
                expect(eventPayload.mastermindLocationId).toBe(
                  mastermindLocation.id
                );

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 100 }
      );
    }, 600000);

    it("draw event payload contains non-null mastermindLocationId matching GameThreat.locationId", async () => {
      const locations = await prisma.location.findMany({ take: 5 });
      expect(locations.length).toBeGreaterThanOrEqual(2);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: Math.min(locations.length - 1, 4) }), // mastermind location index
          fc.integer({ min: 0, max: Math.min(locations.length - 1, 4) }), // player location index (different from mastermind)
          fc.integer({ min: 1, max: 5 }), // maxRoundLimit
          async (
            mastermindLocIdx: number,
            playerLocIdx: number,
            maxRoundLimit: number
          ) => {
            const mastermindLocation = locations[mastermindLocIdx];
            // Use a different location for the player start (ensure it's not the mastermind)
            const playerLocation =
              locations[
                playerLocIdx === mastermindLocIdx
                  ? (playerLocIdx + 1) % locations.length
                  : playerLocIdx
              ];
            const playerIds = [
              uniquePlayerId("p9d", 0),
              uniquePlayerId("p9d", 1),
            ];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                    maxRoundLimit,
                  },
                });

                // Create players
                for (let i = 0; i < playerIds.length; i++) {
                  await tx.roomPlayer.create({
                    data: {
                      playerId: playerIds[i],
                      displayName: `Player ${i + 1}`,
                      roomId: room.id,
                      turnPosition: i + 1,
                    },
                  });
                }

                // Create player positions
                for (let i = 0; i < playerIds.length; i++) {
                  await tx.playerPosition.create({
                    data: {
                      roomId: room.id,
                      playerId: playerIds[i],
                      locationId: playerLocation.id,
                      skipNextTurn: false,
                    },
                  });
                }

                // Create GameThreat at the mastermind location
                await tx.gameThreat.create({
                  data: {
                    roomId: room.id,
                    locationId: mastermindLocation.id,
                  },
                });

                // Create GameTurn at the last player's turn in the max round
                // so advanceTurn wraps and increments round past maxRoundLimit
                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: playerIds[playerIds.length - 1], // last player
                    currentRound: maxRoundLimit, // at the limit
                    currentSlot: 2,
                    captureAttemptFlag: false,
                    version: 0,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: playerIds[playerIds.length - 1],
                  currentRound: maxRoundLimit,
                  currentSlot: 2,
                  captureAttemptFlag: false,
                  version: 0,
                };

                // Call advanceTurn - should detect draw (round will exceed maxRoundLimit)
                const drawResult = await advanceTurn(room.id, turnState, tx);

                // Verify draw was detected
                expect(drawResult.drawDetected).toBe(true);

                // Query the "game-draw" event from the Event Feed
                const gameDrawEvents = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "game-draw" },
                });

                expect(gameDrawEvents.length).toBe(1);
                const eventPayload = gameDrawEvents[0].payload as Record<
                  string,
                  unknown
                >;

                // Property: mastermindLocationId in event payload is non-null
                expect(eventPayload.mastermindLocationId).not.toBeNull();
                expect(eventPayload.mastermindLocationId).not.toBeUndefined();

                // Property: mastermindLocationId matches actual GameThreat.locationId
                expect(eventPayload.mastermindLocationId).toBe(
                  mastermindLocation.id
                );

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 100 }
      );
    }, 600000);
  });
});
