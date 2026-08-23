// Feature: action-cards
// Property 8: Extra Turn Count and Order Restoration
// **Validates: Requirements 10.2, 10.6, 10.7**
//
// For any k `extra-turn` plays by Player P in a single turn, P takes exactly k
// Extra_Turns before turn order advances. After all Extra_Turns complete, the
// next Player in turn order is the same Player who would hold the turn had no
// Extra_Turn been granted.

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceTurn } from "@/lib/turn-engine/advance-turn";
import type { TurnState } from "@/lib/turn-engine/types";

let prisma: PrismaClient;

let roomCounter = 0;

function uniqueRoomCode(): string {
  return `ET8-${(++roomCounter).toString().padStart(4, "0")}`;
}

function uniquePlayerId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("Property 8: Extra Turn Count and Order Restoration", () => {
  // **Validates: Requirements 10.2, 10.6, 10.7**

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

  it("player with k pending extra turns takes exactly k extra turns, then normal order resumes", async () => {
    const location = await prisma.location.findFirst();
    expect(location).not.toBeNull();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }), // player count
        fc.integer({ min: 1, max: 5 }), // starting round
        fc.integer({ min: 0, max: 3 }), // current player index (clamped)
        fc.integer({ min: 1, max: 4 }), // k = number of pending extra turns
        async (
          playerCount: number,
          startingRound: number,
          posIdxRaw: number,
          k: number
        ) => {
          const currentPosIdx = posIdxRaw % playerCount;
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            uniquePlayerId("p8", i)
          );
          const currentPlayerId = playerIds[currentPosIdx];

          // The expected next player after all extra turns complete is the same
          // as if no extra turns were granted: the next player in round-robin order.
          const expectedNextIdx = (currentPosIdx + 1) % playerCount;
          const expectedNextPlayerId = playerIds[expectedNextIdx];

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
                  currentPlayerId: currentPlayerId,
                  currentRound: startingRound,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  version: 0,
                },
              });

              const baseTurnState: TurnState = {
                id: gameTurn.id,
                roomId: room.id,
                currentPlayerId: currentPlayerId,
                currentRound: startingRound,
                actionsRemaining: 2,
                actionBudget: 2,
                captureAttemptFlag: false,
                isExtraTurn: false,
                version: 0,
              };

              // Call advanceTurn k times — each should grant an extra turn
              // to the same player (decrementing pendingExtraTurns each time)
              for (let call = 0; call < k; call++) {
                // Re-read turn state for each call (it updates in place)
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

                // After each extra turn call, the current player should still
                // be the same player (extra turn granted to same player)
                const updatedTurn = await tx.gameTurn.findUniqueOrThrow({
                  where: { id: gameTurn.id },
                });

                expect(updatedTurn.currentPlayerId).toBe(currentPlayerId);
                expect(updatedTurn.isExtraTurn).toBe(true);
                expect(updatedTurn.currentRound).toBe(startingRound);
                expect(updatedTurn.captureAttemptFlag).toBe(false);
                expect(updatedTurn.actionsRemaining).toBe(2);
              }

              // Verify pendingExtraTurns is now 0
              const posAfterExtra = await tx.playerPosition.findUniqueOrThrow({
                where: {
                  roomId_playerId: {
                    roomId: room.id,
                    playerId: currentPlayerId,
                  },
                },
              });
              expect(posAfterExtra.pendingExtraTurns).toBe(0);

              // (k+1)th call: should advance to the next player in turn order
              const turnBeforeFinal = await tx.gameTurn.findUniqueOrThrow({
                where: { id: gameTurn.id },
              });
              const finalTurnState: TurnState = {
                id: turnBeforeFinal.id,
                roomId: room.id,
                currentPlayerId: turnBeforeFinal.currentPlayerId,
                currentRound: turnBeforeFinal.currentRound,
                actionsRemaining: turnBeforeFinal.actionsRemaining,
                actionBudget: turnBeforeFinal.actionBudget,
                captureAttemptFlag: turnBeforeFinal.captureAttemptFlag,
                isExtraTurn: turnBeforeFinal.isExtraTurn,
                version: turnBeforeFinal.version,
              };

              await advanceTurn(room.id, finalTurnState, tx);

              const finalTurn = await tx.gameTurn.findUniqueOrThrow({
                where: { id: gameTurn.id },
              });

              // The next player should be the same player as if no extra turns
              // had been granted (normal round-robin advancement)
              expect(finalTurn.currentPlayerId).toBe(expectedNextPlayerId);
              expect(finalTurn.isExtraTurn).toBe(false);
              expect(finalTurn.captureAttemptFlag).toBe(false);
              expect(finalTurn.actionsRemaining).toBe(2);

              // Round should only increment if wrapping occurred (nextIdx === 0)
              const expectedRound =
                expectedNextIdx === 0 ? startingRound + 1 : startingRound;
              expect(finalTurn.currentRound).toBe(expectedRound);

              // Verify extra-turn-started events were emitted for each extra turn
              const extraTurnEvents = await tx.gameEvent.findMany({
                where: { roomId: room.id, type: "extra-turn-started" },
                orderBy: { sequenceNumber: "asc" },
              });
              expect(extraTurnEvents.length).toBe(k);
              for (const evt of extraTurnEvents) {
                const payload = evt.payload as Record<string, unknown>;
                expect(payload.playerId).toBe(currentPlayerId);
                expect(payload.roundNumber).toBe(startingRound);
              }

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

  it("multiple extra-turn plays accumulate and are consumed one at a time", async () => {
    const location = await prisma.location.findFirst();
    expect(location).not.toBeNull();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 4 }), // player count
        fc.integer({ min: 2, max: 4 }), // k = number of extra turns
        async (playerCount: number, k: number) => {
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            uniquePlayerId("p8m", i)
          );
          const currentPlayerId = playerIds[0]; // first player

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
                  currentPlayerId: currentPlayerId,
                  currentRound: 1,
                  actionsRemaining: 2,
                  actionBudget: 2,
                  captureAttemptFlag: false,
                  version: 0,
                },
              });

              // Verify that pendingExtraTurns decrements by exactly 1 per call
              for (let call = 0; call < k; call++) {
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

                // After each call, pendingExtraTurns should have decremented
                const pos = await tx.playerPosition.findUniqueOrThrow({
                  where: {
                    roomId_playerId: {
                      roomId: room.id,
                      playerId: currentPlayerId,
                    },
                  },
                });
                expect(pos.pendingExtraTurns).toBe(k - (call + 1));
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
});
