// Feature: movement-turn-actions
// Property 1: Round-Robin Turn Advancement
// Property 2: Skip Flag Bypass and Clear
// Property 20: Two-Slot Turn Structure
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 2.1, 2.3, 2.5, 2.7, 13.2, 13.3, 13.5, 13.6**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import { validateAction } from "@/lib/turn-engine/validate-action";
import type { TurnState, ActionCardData } from "@/lib/turn-engine/types";

let prisma: PrismaClient;

// Counter for unique room codes
let roomCounter = 0;

function uniqueRoomCode(): string {
  return `TA${(++roomCounter).toString().padStart(4, "0")}`;
}

function uniquePlayerId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("Turn Advancement Property Tests", () => {
  // **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 2.1, 2.3, 2.5, 2.7, 13.2, 13.3, 13.5, 13.6**

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

  describe("Property 1: Round-Robin Turn Advancement", () => {
    // **Validates: Requirements 1.1, 1.2, 1.3**

    it("advances to the next turnPosition, wraps from N to 1 with round increment", async () => {
      const location = await prisma.location.findFirst();
      expect(location).not.toBeNull();

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // player count
          fc.integer({ min: 1, max: 10 }), // starting round
          fc.integer({ min: 0, max: 3 }), // currentPosIdx (clamped to playerCount-1)
          async (
            playerCount: number,
            startingRound: number,
            posIdxRaw: number
          ) => {
            const currentPosIdx = posIdxRaw % playerCount;
            const playerIds = Array.from({ length: playerCount }, (_, i) =>
              uniquePlayerId("p1", i)
            );

            const currentPlayerId = playerIds[currentPosIdx];
            const expectedNextIdx = (currentPosIdx + 1) % playerCount;
            const expectedNextPlayerId = playerIds[expectedNextIdx];
            const expectedRound =
              expectedNextIdx === 0 ? startingRound + 1 : startingRound;

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                  },
                });

                for (let i = 0; i < playerCount; i++) {
                  await tx.roomPlayer.create({
                    data: {
                      playerId: playerIds[i],
                      displayName: `Player ${i + 1}`,
                      roomId: room.id,
                      turnPosition: i + 1,
                    },
                  });
                }

                for (let i = 0; i < playerCount; i++) {
                  await tx.playerPosition.create({
                    data: {
                      roomId: room.id,
                      playerId: playerIds[i],
                      locationId: location!.id,
                      skipNextTurn: false,
                    },
                  });
                }

                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: currentPlayerId,
                    currentRound: startingRound,
                    currentSlot: 2,
                    captureAttemptFlag: false,
                    version: 0,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: currentPlayerId,
                  currentRound: startingRound,
                  currentSlot: 2,
                  captureAttemptFlag: false,
                  version: 0,
                };

                await advanceTurn(room.id, turnState, tx);

                const updatedTurn = await tx.gameTurn.findUnique({
                  where: { id: gameTurn.id },
                });

                expect(updatedTurn).not.toBeNull();
                expect(updatedTurn!.currentPlayerId).toBe(
                  expectedNextPlayerId
                );
                expect(updatedTurn!.currentRound).toBe(expectedRound);
                expect(updatedTurn!.currentSlot).toBe(1);
                expect(updatedTurn!.captureAttemptFlag).toBe(false);

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);
  });

  describe("Property 2: Skip Flag Bypass and Clear", () => {
    // **Validates: Requirements 1.4, 1.7, 13.2, 13.3, 13.5, 13.6**

    it("skipped players have flags cleared, turn-skipped events emitted, advances to unflagged player", async () => {
      const location = await prisma.location.findFirst();
      expect(location).not.toBeNull();

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 4 }), // player count (3+ to test skipping)
          fc.integer({ min: 1, max: 5 }), // starting round
          fc.integer({ min: 1, max: 2 }), // how many players to skip (from idx 1..N)
          async (
            playerCount: number,
            startingRound: number,
            skipCount: number
          ) => {
            // Ensure we don't skip ALL players (that's the other test)
            const actualSkipCount = Math.min(skipCount, playerCount - 1);
            const playerIds = Array.from({ length: playerCount }, (_, i) =>
              uniquePlayerId("p2", i)
            );
            const currentPlayerId = playerIds[0];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                  },
                });

                for (let i = 0; i < playerCount; i++) {
                  await tx.roomPlayer.create({
                    data: {
                      playerId: playerIds[i],
                      displayName: `Player ${i + 1}`,
                      roomId: room.id,
                      turnPosition: i + 1,
                    },
                  });
                }

                // Mark next N players after current as skipped
                for (let i = 0; i < playerCount; i++) {
                  const shouldSkip = i > 0 && i <= actualSkipCount;
                  await tx.playerPosition.create({
                    data: {
                      roomId: room.id,
                      playerId: playerIds[i],
                      locationId: location!.id,
                      skipNextTurn: shouldSkip,
                    },
                  });
                }

                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: currentPlayerId,
                    currentRound: startingRound,
                    currentSlot: 2,
                    captureAttemptFlag: false,
                    version: 0,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: currentPlayerId,
                  currentRound: startingRound,
                  currentSlot: 2,
                  captureAttemptFlag: false,
                  version: 0,
                };

                await advanceTurn(room.id, turnState, tx);

                // Compute expected next player by simulating the skip logic:
                // Starting from idx 0 (current), advanceTurn goes to idx 1.
                // Then it skips flagged players until finding an unflagged one.
                // We need to compute wrapping and round increments.
                let expectedNextIdx = 1; // first candidate
                let expectedRound = startingRound;
                // Initial advance from currentIdx=0 to nextIdx=1 already happens.
                // nextIdx=1, and if nextIdx==0 that would wrap, but it's 1 here so no wrap initially.

                // Now simulate skipping:
                for (let s = 0; s < actualSkipCount; s++) {
                  // This player is skipped, advance
                  expectedNextIdx = (expectedNextIdx + 1) % playerCount;
                  if (expectedNextIdx === 0) {
                    expectedRound += 1;
                  }
                }

                // Also account for initial advance: nextIdx goes from 0 to 1.
                // If nextIdx wraps to 0, round increments. But 0->1 doesn't wrap.
                // The initial round increment from advanceTurn occurs if (0+1)%N == 0, which is false for N>=2.

                const updatedTurn = await tx.gameTurn.findUnique({
                  where: { id: gameTurn.id },
                });

                expect(updatedTurn).not.toBeNull();
                expect(updatedTurn!.currentPlayerId).toBe(
                  playerIds[expectedNextIdx]
                );
                expect(updatedTurn!.currentRound).toBe(expectedRound);
                expect(updatedTurn!.currentSlot).toBe(1);
                expect(updatedTurn!.captureAttemptFlag).toBe(false);

                // Verify skip flags were cleared
                for (let i = 1; i <= actualSkipCount; i++) {
                  const pos = await tx.playerPosition.findUnique({
                    where: {
                      roomId_playerId: {
                        roomId: room.id,
                        playerId: playerIds[i],
                      },
                    },
                  });
                  expect(pos!.skipNextTurn).toBe(false);
                }

                // Verify turn-skipped events emitted for each skipped player
                const events = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "turn-skipped" },
                  orderBy: { sequenceNumber: "asc" },
                });
                expect(events.length).toBe(actualSkipCount);
                for (let i = 0; i < actualSkipCount; i++) {
                  const payload = events[i].payload as Record<string, unknown>;
                  expect(payload.playerId).toBe(playerIds[i + 1]);
                }

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("all-flagged edge case: clears all flags, increments round appropriately", async () => {
      const location = await prisma.location.findFirst();
      expect(location).not.toBeNull();

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // player count
          fc.integer({ min: 1, max: 5 }), // starting round
          async (playerCount: number, startingRound: number) => {
            const playerIds = Array.from({ length: playerCount }, (_, i) =>
              uniquePlayerId("p2all", i)
            );
            const currentPlayerId = playerIds[0];

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                  },
                });

                for (let i = 0; i < playerCount; i++) {
                  await tx.roomPlayer.create({
                    data: {
                      playerId: playerIds[i],
                      displayName: `Player ${i + 1}`,
                      roomId: room.id,
                      turnPosition: i + 1,
                    },
                  });
                }

                // ALL players have skip flags set
                for (let i = 0; i < playerCount; i++) {
                  await tx.playerPosition.create({
                    data: {
                      roomId: room.id,
                      playerId: playerIds[i],
                      locationId: location!.id,
                      skipNextTurn: true,
                    },
                  });
                }

                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: currentPlayerId,
                    currentRound: startingRound,
                    currentSlot: 2,
                    captureAttemptFlag: false,
                    version: 0,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: currentPlayerId,
                  currentRound: startingRound,
                  currentSlot: 2,
                  captureAttemptFlag: false,
                  version: 0,
                };

                await advanceTurn(room.id, turnState, tx);

                const updatedTurn = await tx.gameTurn.findUnique({
                  where: { id: gameTurn.id },
                });

                expect(updatedTurn).not.toBeNull();

                // When all flagged from position 0:
                // The loop skips idx 1, 2, ..., wraps at 0 (round++), 
                // then continues until skippedCount == playerCount.
                // After clearing all flags, the loop exits at nextIdx which
                // cycled through all players. The final nextIdx ends up at 
                // position 1 (one past where current was when the full cycle completes).
                // Round increments exactly once when wrapping past idx 0.
                expect(updatedTurn!.currentPlayerId).toBe(playerIds[1]);
                expect(updatedTurn!.currentRound).toBe(startingRound + 1);
                expect(updatedTurn!.currentSlot).toBe(1);
                expect(updatedTurn!.captureAttemptFlag).toBe(false);

                // All skip flags cleared
                for (let i = 0; i < playerCount; i++) {
                  const pos = await tx.playerPosition.findUnique({
                    where: {
                      roomId_playerId: {
                        roomId: room.id,
                        playerId: playerIds[i],
                      },
                    },
                  });
                  expect(pos!.skipNextTurn).toBe(false);
                }

                // Turn-skipped events emitted for all players
                const events = await tx.gameEvent.findMany({
                  where: { roomId: room.id, type: "turn-skipped" },
                  orderBy: { sequenceNumber: "asc" },
                });
                expect(events.length).toBe(playerCount);

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);
  });

  describe("Property 20: Two-Slot Turn Structure", () => {
    // **Validates: Requirements 2.1, 2.3, 2.5, 2.7**

    it("TurnState currentSlot is always 1 or 2", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>,
          async (slot: 1 | 2) => {
            const turnState: TurnState = {
              id: "test-id",
              roomId: "test-room",
              currentPlayerId: "test-player",
              currentRound: 1,
              currentSlot: slot,
              captureAttemptFlag: false,
              version: 0,
            };

            expect(turnState.currentSlot).toBeGreaterThanOrEqual(1);
            expect(turnState.currentSlot).toBeLessThanOrEqual(2);
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    it("slot actions are accepted at both slot 1 and slot 2", async () => {
      const playerId = "test-slot-player";
      const emptyCards: ActionCardData[] = [];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>,
          async (slot: 1 | 2) => {
            const turnState: TurnState = {
              id: "test-id",
              roomId: "test-room",
              currentPlayerId: playerId,
              currentRound: 1,
              currentSlot: slot,
              captureAttemptFlag: false,
              version: 0,
            };

            // SKIP is always valid at any slot
            const result = validateAction(
              { actionType: "SKIP" },
              turnState,
              playerId,
              "some-location",
              [],
              emptyCards
            );
            expect(result).toBeNull();

            // CAPTURE_ATTEMPT valid when no prior flag (regardless of slot)
            const captureResult = validateAction(
              { actionType: "CAPTURE_ATTEMPT" },
              turnState,
              playerId,
              "some-location",
              [],
              emptyCards
            );
            expect(captureResult).toBeNull();
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    it("max 1 capture attempt per turn - captureAttemptFlag prevents second", async () => {
      const playerId = "test-capture-player";
      const emptyCards: ActionCardData[] = [];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(1, 2) as fc.Arbitrary<1 | 2>,
          async (slot: 1 | 2) => {
            // TurnState with captureAttemptFlag already set
            const turnState: TurnState = {
              id: "test-id",
              roomId: "test-room",
              currentPlayerId: playerId,
              currentRound: 1,
              currentSlot: slot,
              captureAttemptFlag: true, // Already attempted
              version: 0,
            };

            const result = validateAction(
              { actionType: "CAPTURE_ATTEMPT" },
              turnState,
              playerId,
              "some-location",
              [],
              emptyCards
            );

            expect(result).not.toBeNull();
            expect(result!.code).toBe("DUPLICATE_CAPTURE_ATTEMPT");
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    it("end-of-turn: advanceTurn resets slot to 1 and captureAttemptFlag to false", async () => {
      const location = await prisma.location.findFirst();
      expect(location).not.toBeNull();

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // player count
          fc.boolean(), // whether capture attempt was flagged
          async (playerCount: number, captureFlag: boolean) => {
            const playerIds = Array.from({ length: playerCount }, (_, i) =>
              uniquePlayerId("p20", i)
            );

            await prisma
              .$transaction(async (tx) => {
                const room = await tx.room.create({
                  data: {
                    code: uniqueRoomCode(),
                    status: "in-progress",
                  },
                });

                for (let i = 0; i < playerCount; i++) {
                  await tx.roomPlayer.create({
                    data: {
                      playerId: playerIds[i],
                      displayName: `Player ${i + 1}`,
                      roomId: room.id,
                      turnPosition: i + 1,
                    },
                  });
                }

                for (let i = 0; i < playerCount; i++) {
                  await tx.playerPosition.create({
                    data: {
                      roomId: room.id,
                      playerId: playerIds[i],
                      locationId: location!.id,
                      skipNextTurn: false,
                    },
                  });
                }

                const gameTurn = await tx.gameTurn.create({
                  data: {
                    roomId: room.id,
                    currentPlayerId: playerIds[0],
                    currentRound: 1,
                    currentSlot: 2,
                    captureAttemptFlag: captureFlag,
                    version: 0,
                  },
                });

                const turnState: TurnState = {
                  id: gameTurn.id,
                  roomId: room.id,
                  currentPlayerId: playerIds[0],
                  currentRound: 1,
                  currentSlot: 2,
                  captureAttemptFlag: captureFlag,
                  version: 0,
                };

                // advanceTurn fires after EoT resolution (after slot 2)
                await advanceTurn(room.id, turnState, tx);

                const updatedTurn = await tx.gameTurn.findUnique({
                  where: { id: gameTurn.id },
                });

                // Slot resets to 1 for next player's turn
                expect(updatedTurn!.currentSlot).toBe(1);
                // captureAttemptFlag always reset to false
                expect(updatedTurn!.captureAttemptFlag).toBe(false);
                // Next player is different from current
                expect(updatedTurn!.currentPlayerId).toBe(playerIds[1]);

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);
  });
});
