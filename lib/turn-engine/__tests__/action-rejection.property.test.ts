// Feature: win-detection-game-end
// Property 6: Action rejection after game end
// **Validates: Requirements 4.1, 4.2**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { submitAction } from "@/lib/turn-engine/submit-action";
import type { ActionPayload } from "@/lib/turn-engine/types";

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
  return `AR${(++roomCounter).toString().padStart(4, "0")}`;
}

const TEST_PLAYER_A = "test-player-action-reject-a";
const TEST_PLAYER_B = "test-player-action-reject-b";

/**
 * Arbitrary for generating any valid ActionPayload.
 * Uses a location ID from the real DB locations for MOVE actions,
 * and a random string for USE_CARD cardId.
 */
function arbitraryActionPayload(
  locations: LocationRecord[]
): fc.Arbitrary<ActionPayload> {
  return fc.oneof(
    fc.record({
      actionType: fc.constant("MOVE" as const),
      targetLocationId: fc
        .integer({ min: 0, max: locations.length - 1 })
        .map((idx) => locations[idx].id),
    }),
    fc.record({
      actionType: fc.constant("SKIP" as const),
    }),
    fc.record({
      actionType: fc.constant("CAPTURE_ATTEMPT" as const),
    }),
    fc.record({
      actionType: fc.constant("USE_CARD" as const),
      cardId: fc.uuid(),
    })
  );
}

describe("Action Rejection Property Tests", () => {
  // **Validates: Requirements 4.1, 4.2**

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

  describe("Property 6: Action rejection after game end", () => {
    // For any valid action payload submitted to a room with status "finished",
    // system returns GAME_NOT_ACTIVE error and does not modify game state.

    it("any action payload submitted to a finished room returns GAME_NOT_ACTIVE", async () => {
      expect(allLocations.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          arbitraryActionPayload(allLocations),
          fc.integer({ min: 0, max: 39 }), // location index for player positions
          fc.integer({ min: 1, max: 100 }), // round number at which game ended
          async (
            action: ActionPayload,
            locationIdx: number,
            endRound: number
          ) => {
            const playerLocation =
              allLocations[locationIdx % allLocations.length];

            // Set up a finished game and verify rejection, then clean up
            const room = await prisma.room.create({
              data: {
                code: uniqueRoomCode(),
                status: "finished",
                maxRoundLimit: 20,
              },
            });

            try {
              // Create players
              await prisma.roomPlayer.createMany({
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
              await prisma.playerPosition.createMany({
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

              // Create a game_turns row (required for the SELECT FOR UPDATE lock)
              await prisma.gameTurn.create({
                data: {
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_A,
                  currentRound: endRound,
                  currentSlot: 1,
                  captureAttemptFlag: false,
                },
              });

              // Place Mastermind
              await prisma.gameThreat.create({
                data: {
                  roomId: room.id,
                  locationId: playerLocation.id,
                },
              });

              // Create a pre-existing GameResult (game already ended)
              await prisma.gameResult.create({
                data: {
                  roomId: room.id,
                  outcome: "win",
                  winnerId: TEST_PLAYER_B,
                  winLocationId: playerLocation.id,
                  mastermindLocationId: playerLocation.id,
                  roundNumber: endRound,
                },
              });

              // Record state before the action submission
              const eventCountBefore = await prisma.gameEvent.count({
                where: { roomId: room.id },
              });
              const turnBefore = await prisma.gameTurn.findFirst({
                where: { roomId: room.id },
              });

              // Submit the action to the finished room
              const result = await submitAction(
                room.id,
                TEST_PLAYER_A,
                action
              );

              // ASSERT: Result is GAME_NOT_ACTIVE error
              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("GAME_NOT_ACTIVE");
              }

              // ASSERT: No new events were created
              const eventCountAfter = await prisma.gameEvent.count({
                where: { roomId: room.id },
              });
              expect(eventCountAfter).toBe(eventCountBefore);

              // ASSERT: Turn state was not modified
              const turnAfter = await prisma.gameTurn.findFirst({
                where: { roomId: room.id },
              });
              expect(turnAfter!.currentPlayerId).toBe(
                turnBefore!.currentPlayerId
              );
              expect(turnAfter!.currentRound).toBe(turnBefore!.currentRound);
              expect(turnAfter!.currentSlot).toBe(turnBefore!.currentSlot);

              // ASSERT: Room status remains "finished"
              const roomAfter = await prisma.room.findUnique({
                where: { id: room.id },
                select: { status: true },
              });
              expect(roomAfter!.status).toBe("finished");
            } finally {
              // Cleanup: delete in reverse dependency order
              await prisma.gameResult.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.gameEvent.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.gameThreat.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.gameTurn.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.playerPosition.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.roomPlayer.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.room.delete({ where: { id: room.id } });
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 300000);

    it("action rejection applies equally to rooms that ended via draw", async () => {
      expect(allLocations.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          arbitraryActionPayload(allLocations),
          fc.integer({ min: 0, max: 39 }), // location index
          fc.integer({ min: 1, max: 100 }), // max round limit that was exceeded
          async (
            action: ActionPayload,
            locationIdx: number,
            maxRoundLimit: number
          ) => {
            const playerLocation =
              allLocations[locationIdx % allLocations.length];

            const room = await prisma.room.create({
              data: {
                code: uniqueRoomCode(),
                status: "finished",
                maxRoundLimit,
              },
            });

            try {
              await prisma.roomPlayer.createMany({
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

              await prisma.playerPosition.createMany({
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

              await prisma.gameTurn.create({
                data: {
                  roomId: room.id,
                  currentPlayerId: TEST_PLAYER_A,
                  currentRound: maxRoundLimit + 1,
                  currentSlot: 1,
                  captureAttemptFlag: false,
                },
              });

              await prisma.gameThreat.create({
                data: {
                  roomId: room.id,
                  locationId: playerLocation.id,
                },
              });

              // Game ended via draw
              await prisma.gameResult.create({
                data: {
                  roomId: room.id,
                  outcome: "draw",
                  mastermindLocationId: playerLocation.id,
                  roundNumber: maxRoundLimit + 1,
                  reason: "max-rounds-exceeded",
                },
              });

              // Submit action to draw-finished room
              const result = await submitAction(
                room.id,
                TEST_PLAYER_A,
                action
              );

              // ASSERT: Same GAME_NOT_ACTIVE rejection regardless of how game ended
              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("GAME_NOT_ACTIVE");
              }

              // ASSERT: No game state modifications
              const events = await prisma.gameEvent.findMany({
                where: { roomId: room.id },
              });
              expect(events).toHaveLength(0);

              const roomAfter = await prisma.room.findUnique({
                where: { id: room.id },
                select: { status: true },
              });
              expect(roomAfter!.status).toBe("finished");
            } finally {
              await prisma.gameResult.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.gameEvent.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.gameThreat.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.gameTurn.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.playerPosition.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.roomPlayer.deleteMany({
                where: { roomId: room.id },
              });
              await prisma.room.delete({ where: { id: room.id } });
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 300000);
  });
});
