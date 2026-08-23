// Feature: action-cards, Property 7: Extra Turn Round Invariance
// **Validates: Requirements 10.5**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import type { TurnState } from "@/lib/turn-engine/types";

/**
 * Property 7: Extra Turn Round Invariance
 *
 * For any sequence of turns containing k `extra-turn` card plays, the Round
 * number after all turns complete equals the Round number of an equivalent
 * sequence with zero `extra-turn` plays. Extra Turns never increment the Round.
 *
 * Specifically:
 * - When advanceTurn is called and the current player has pendingExtraTurns > 0,
 *   the gameTurn.currentRound remains unchanged.
 * - The round only increments during normal turn advancement when turn order
 *   wraps from the last player back to the first.
 * - Multiple consecutive extra turns for the same player never change the round.
 */

let prisma: PrismaClient;
let roomCounter = 0;

function uniqueRoomCode(): string {
  return `ETRI${(++roomCounter).toString().padStart(4, "0")}`;
}

function uniquePlayerId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("Extra Turn Round Invariance — Property 7", () => {
  // **Validates: Requirements 10.5**

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

  /**
   * **Validates: Requirements 10.5**
   *
   * When a player has pendingExtraTurns > 0, calling advanceTurn grants an
   * extra turn to that same player without changing the round number.
   */
  it("advanceTurn with pendingExtraTurns > 0 keeps the same round number", async () => {
    const location = await prisma.location.findFirst();
    expect(location).not.toBeNull();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }), // player count
        fc.integer({ min: 1, max: 10 }), // starting round
        fc.integer({ min: 1, max: 5 }), // pendingExtraTurns
        fc.integer({ min: 0, max: 3 }), // currentPosIdx (clamped to playerCount-1)
        async (
          playerCount: number,
          startingRound: number,
          pendingExtraTurns: number,
          posIdxRaw: number
        ) => {
          const currentPosIdx = posIdxRaw % playerCount;
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            uniquePlayerId("etri1", i)
          );
          const currentPlayerId = playerIds[currentPosIdx];

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
                    pendingExtraTurns:
                      playerIds[i] === currentPlayerId ? pendingExtraTurns : 0,
                  },
                });
              }

              const gameTurn = await tx.gameTurn.create({
                data: {
                  roomId: room.id,
                  currentPlayerId,
                  currentRound: startingRound,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  version: 0,
                },
              });

              const turnState: TurnState = {
                id: gameTurn.id,
                roomId: room.id,
                currentPlayerId,
                currentRound: startingRound,
                actionsRemaining: 2,
                actionBudget: 2,
                captureAttemptFlag: false,
                isExtraTurn: false,
                version: 0,
              };

              await advanceTurn(room.id, turnState, tx);

              const updatedTurn = await tx.gameTurn.findUnique({
                where: { id: gameTurn.id },
              });

              // Round number MUST remain unchanged during an extra turn
              expect(updatedTurn!.currentRound).toBe(startingRound);
              // The same player keeps the turn
              expect(updatedTurn!.currentPlayerId).toBe(currentPlayerId);
              // isExtraTurn flag should be set
              expect(updatedTurn!.isExtraTurn).toBe(true);

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

  /**
   * **Validates: Requirements 10.5**
   *
   * Consuming all k extra turns one by one never increments the round.
   * After all extra turns are consumed, the round number is the same as
   * when the first extra turn was granted.
   */
  it("consuming k extra turns sequentially never changes the round number", async () => {
    const location = await prisma.location.findFirst();
    expect(location).not.toBeNull();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }), // player count
        fc.integer({ min: 1, max: 8 }), // starting round
        fc.integer({ min: 1, max: 4 }), // k extra turns to consume
        async (
          playerCount: number,
          startingRound: number,
          k: number
        ) => {
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            uniquePlayerId("etri2", i)
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

              for (let i = 0; i < playerCount; i++) {
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: playerIds[i],
                    locationId: location!.id,
                    skipNextTurn: false,
                    pendingExtraTurns:
                      playerIds[i] === currentPlayerId ? k : 0,
                  },
                });
              }

              const gameTurn = await tx.gameTurn.create({
                data: {
                  roomId: room.id,
                  currentPlayerId,
                  currentRound: startingRound,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  version: 0,
                },
              });

              // Simulate consuming all k extra turns one by one
              for (let i = 0; i < k; i++) {
                const currentTurn = await tx.gameTurn.findUniqueOrThrow({
                  where: { id: gameTurn.id },
                });

                const turnState: TurnState = {
                  id: currentTurn.id,
                  roomId: room.id,
                  currentPlayerId: currentTurn.currentPlayerId,
                  currentRound: currentTurn.currentRound,
                  actionsRemaining: currentTurn.actionsRemaining,
                  actionBudget: currentTurn.actionBudget,
                  captureAttemptFlag: currentTurn.captureAttemptFlag,
                  isExtraTurn: currentTurn.isExtraTurn,
                  version: currentTurn.version,
                };

                await advanceTurn(room.id, turnState, tx);

                // After each extra turn consumption, round must stay the same
                const updatedTurn = await tx.gameTurn.findUniqueOrThrow({
                  where: { id: gameTurn.id },
                });
                expect(updatedTurn.currentRound).toBe(startingRound);
                expect(updatedTurn.currentPlayerId).toBe(currentPlayerId);
              }

              // After consuming all extra turns, the player still has the turn
              // but pendingExtraTurns should now be 0
              const finalPosition = await tx.playerPosition.findUniqueOrThrow({
                where: {
                  roomId_playerId: { roomId: room.id, playerId: currentPlayerId },
                },
              });
              expect(finalPosition.pendingExtraTurns).toBe(0);

              // The round number never changed
              const finalTurn = await tx.gameTurn.findUniqueOrThrow({
                where: { id: gameTurn.id },
              });
              expect(finalTurn.currentRound).toBe(startingRound);

              throw new Error("ROLLBACK");
            })
            .catch((e) => {
              if (e.message !== "ROLLBACK") throw e;
            });
        }
      ),
      { numRuns: 15 }
    );
  }, 300000);

  /**
   * **Validates: Requirements 10.5**
   *
   * Comparison: a normal turn advancement that wraps from the last player
   * DOES increment the round. This confirms that extra turns are special-cased
   * to avoid round incrementing while normal wrapping still works.
   */
  it("normal advancement wrapping from last player increments round (control case)", async () => {
    const location = await prisma.location.findFirst();
    expect(location).not.toBeNull();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }), // player count
        fc.integer({ min: 1, max: 10 }), // starting round
        async (playerCount: number, startingRound: number) => {
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            uniquePlayerId("etri3", i)
          );
          // Last player in turn order
          const lastPlayerId = playerIds[playerCount - 1];

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
                    pendingExtraTurns: 0, // No extra turns
                  },
                });
              }

              const gameTurn = await tx.gameTurn.create({
                data: {
                  roomId: room.id,
                  currentPlayerId: lastPlayerId,
                  currentRound: startingRound,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  version: 0,
                },
              });

              const turnState: TurnState = {
                id: gameTurn.id,
                roomId: room.id,
                currentPlayerId: lastPlayerId,
                currentRound: startingRound,
                actionsRemaining: 2,
                actionBudget: 2,
                captureAttemptFlag: false,
                isExtraTurn: false,
                version: 0,
              };

              await advanceTurn(room.id, turnState, tx);

              const updatedTurn = await tx.gameTurn.findUnique({
                where: { id: gameTurn.id },
              });

              // Round DOES increment when wrapping from last to first player
              expect(updatedTurn!.currentRound).toBe(startingRound + 1);
              // First player takes over
              expect(updatedTurn!.currentPlayerId).toBe(playerIds[0]);
              // Extra turn flag is NOT set
              expect(updatedTurn!.isExtraTurn).toBe(false);

              throw new Error("ROLLBACK");
            })
            .catch((e) => {
              if (e.message !== "ROLLBACK") throw e;
            });
        }
      ),
      { numRuns: 15 }
    );
  }, 300000);

  /**
   * **Validates: Requirements 10.5**
   *
   * When the LAST player in turn order has extra turns, those extra turns
   * must complete (same round) before the round increments. Only after all
   * extra turns are consumed does the normal advancement wrap and increment.
   */
  it("last player extra turns complete before round increments", async () => {
    const location = await prisma.location.findFirst();
    expect(location).not.toBeNull();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }), // player count
        fc.integer({ min: 1, max: 5 }), // starting round
        fc.integer({ min: 1, max: 3 }), // k extra turns for last player
        async (
          playerCount: number,
          startingRound: number,
          k: number
        ) => {
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            uniquePlayerId("etri4", i)
          );
          const lastPlayerId = playerIds[playerCount - 1];

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
                    pendingExtraTurns:
                      playerIds[i] === lastPlayerId ? k : 0,
                  },
                });
              }

              const gameTurn = await tx.gameTurn.create({
                data: {
                  roomId: room.id,
                  currentPlayerId: lastPlayerId,
                  currentRound: startingRound,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  version: 0,
                },
              });

              // Consume all k extra turns — round should stay the same
              for (let i = 0; i < k; i++) {
                const currentTurn = await tx.gameTurn.findUniqueOrThrow({
                  where: { id: gameTurn.id },
                });

                const turnState: TurnState = {
                  id: currentTurn.id,
                  roomId: room.id,
                  currentPlayerId: currentTurn.currentPlayerId,
                  currentRound: currentTurn.currentRound,
                  actionsRemaining: currentTurn.actionsRemaining,
                  actionBudget: currentTurn.actionBudget,
                  captureAttemptFlag: currentTurn.captureAttemptFlag,
                  isExtraTurn: currentTurn.isExtraTurn,
                  version: currentTurn.version,
                };

                await advanceTurn(room.id, turnState, tx);

                const updatedTurn = await tx.gameTurn.findUniqueOrThrow({
                  where: { id: gameTurn.id },
                });

                // Round must NOT have changed during extra turns
                expect(updatedTurn.currentRound).toBe(startingRound);
                expect(updatedTurn.currentPlayerId).toBe(lastPlayerId);
                expect(updatedTurn.isExtraTurn).toBe(true);
              }

              // Now call advanceTurn one more time — extra turns exhausted,
              // normal advancement wraps from last to first → round increments
              const turnAfterExtras = await tx.gameTurn.findUniqueOrThrow({
                where: { id: gameTurn.id },
              });

              const finalTurnState: TurnState = {
                id: turnAfterExtras.id,
                roomId: room.id,
                currentPlayerId: turnAfterExtras.currentPlayerId,
                currentRound: turnAfterExtras.currentRound,
                actionsRemaining: turnAfterExtras.actionsRemaining,
                actionBudget: turnAfterExtras.actionBudget,
                captureAttemptFlag: turnAfterExtras.captureAttemptFlag,
                isExtraTurn: turnAfterExtras.isExtraTurn,
                version: turnAfterExtras.version,
              };

              await advanceTurn(room.id, finalTurnState, tx);

              const afterNormalAdvance = await tx.gameTurn.findUniqueOrThrow({
                where: { id: gameTurn.id },
              });

              // NOW the round increments (wrapping from last to first)
              expect(afterNormalAdvance.currentRound).toBe(startingRound + 1);
              expect(afterNormalAdvance.currentPlayerId).toBe(playerIds[0]);
              expect(afterNormalAdvance.isExtraTurn).toBe(false);

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
