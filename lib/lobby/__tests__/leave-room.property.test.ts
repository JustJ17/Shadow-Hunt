import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomPlayer: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    room: { delete: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { leaveRoom } from "../leave-room";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.roomPlayer.findUnique as ReturnType<typeof vi.fn>;
const mockRoomDelete = prisma.room.delete as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

// Arbitraries
const validPlayerId = fc.uuid();
const playerCountWithOthers = fc.integer({ min: 2, max: 4 });

function makePlayers(
  count: number,
  hostPlayerId: string,
  readyStates?: string[]
) {
  const players = [];
  const baseTime = new Date("2024-01-01T00:00:00Z").getTime();

  for (let i = 0; i < count; i++) {
    players.push({
      id: `player-record-${i}`,
      playerId: i === 0 ? hostPlayerId : `other-player-${i}`,
      displayName: `Player ${i}`,
      isHost: i === 0,
      readyState: readyStates ? readyStates[i] : "ready",
      status: "connected",
      turnPosition: null,
      joinedAt: new Date(baseTime + i * 1000), // Each player joined 1s apart
    });
  }

  return players;
}

// Feature: lobby-player-join, Property 5: Player count arithmetic (leave subset)
// Feature: lobby-player-join, Property 8: Membership changes reset readiness (leave subset)
// Feature: lobby-player-join, Property 9: Host transfer preserves room continuity
// Feature: lobby-player-join, Property 11: Cannot leave during active game
describe("Room leaving - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 6.1, 7.1**
   *
   * For any non-host player leaving a room in "waiting" status,
   * the transaction decrements the player count by exactly 1.
   */
  it("Property 5: Player count arithmetic (leave subset) - non-host leave decrements count by 1", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        playerCountWithOthers,
        async (playerId, totalPlayers) => {
          const hostPlayerId = "host-player-id";
          const players = makePlayers(totalPlayers, hostPlayerId);

          // The leaving player is a non-host
          const leavingPlayer = {
            id: "leaving-record",
            playerId,
            displayName: "Leaving Player",
            isHost: false,
            readyState: "ready",
            status: "connected",
            turnPosition: null,
            joinedAt: new Date("2024-01-01T01:00:00Z"),
          };

          const allPlayers = [...players, leavingPlayer];

          // Mock: player found in room, not host
          mockFindUnique.mockResolvedValue({
            id: leavingPlayer.id,
            playerId,
            isHost: false,
            room: {
              id: "room-id-1",
              code: "ABC123",
              status: "waiting",
              playerCount: allPlayers.length,
              players: allPlayers,
            },
          });

          let decrementValue: number | undefined;

          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              roomPlayer: {
                delete: vi.fn().mockResolvedValue({}),
                updateMany: vi.fn().mockResolvedValue({ count: totalPlayers }),
              },
              room: {
                update: vi.fn().mockImplementation(({ data }) => {
                  if (data.playerCount?.decrement) {
                    decrementValue = data.playerCount.decrement;
                  }
                  return Promise.resolve({});
                }),
              },
            };
            return cb(mockTx);
          });

          const result = await leaveRoom({ playerId });

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.roomDeleted).toBe(false);
            // Verify player count was decremented by exactly 1
            expect(decrementValue).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.4, 7.2**
   *
   * On any successful leave, the transaction resets all remaining players'
   * readyState to "not-ready" via updateMany.
   */
  it("Property 8: Membership changes reset readiness (leave subset) - remaining players readiness reset", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        playerCountWithOthers,
        fc.array(fc.constantFrom("ready", "not-ready"), {
          minLength: 2,
          maxLength: 4,
        }),
        async (playerId, totalPlayers, readyStates) => {
          const hostPlayerId = "host-player-id";
          const states = readyStates.slice(0, totalPlayers);
          while (states.length < totalPlayers) {
            states.push("ready");
          }

          const players = makePlayers(totalPlayers, hostPlayerId, states);

          // The leaving player is a non-host
          const leavingPlayer = {
            id: "leaving-record",
            playerId,
            displayName: "Leaving Player",
            isHost: false,
            readyState: "ready",
            status: "connected",
            turnPosition: null,
            joinedAt: new Date("2024-01-01T01:00:00Z"),
          };

          const allPlayers = [...players, leavingPlayer];

          mockFindUnique.mockResolvedValue({
            id: leavingPlayer.id,
            playerId,
            isHost: false,
            room: {
              id: "room-id-1",
              code: "ABC123",
              status: "waiting",
              playerCount: allPlayers.length,
              players: allPlayers,
            },
          });

          let updateManyCalledWith: unknown;

          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              roomPlayer: {
                delete: vi.fn().mockResolvedValue({}),
                updateMany: vi.fn().mockImplementation((args) => {
                  updateManyCalledWith = args;
                  return Promise.resolve({ count: totalPlayers });
                }),
              },
              room: {
                update: vi.fn().mockResolvedValue({}),
              },
            };
            return cb(mockTx);
          });

          const result = await leaveRoom({ playerId });

          expect(result.success).toBe(true);
          if (result.success) {
            // Verify updateMany was called to reset readyState to "not-ready"
            expect(updateManyCalledWith).toBeDefined();
            const call = updateManyCalledWith as {
              where: { roomId: string; playerId: { not: string } };
              data: { readyState: string };
            };
            expect(call.data.readyState).toBe("not-ready");
            // Verify it targets remaining players (not the leaving player)
            expect(call.where.playerId.not).toBe(playerId);
            expect(call.where.roomId).toBe("room-id-1");
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.1, 6.2, 6.4, 6.5**
   *
   * When host leaves with others remaining, the earliest joiner becomes
   * the new host with readyState "not-ready". The room is not deleted.
   */
  it("Property 9: Host transfer preserves room continuity", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        fc.integer({ min: 2, max: 4 }),
        async (hostPlayerId, totalPlayers) => {
          const baseTime = new Date("2024-01-01T00:00:00Z").getTime();

          // Build players: index 0 is the host who is leaving
          const players = [];
          for (let i = 0; i < totalPlayers; i++) {
            players.push({
              id: `player-record-${i}`,
              playerId: i === 0 ? hostPlayerId : `other-player-${i}`,
              displayName: `Player ${i}`,
              isHost: i === 0,
              readyState: i === 0 ? "not-ready" : "ready",
              status: "connected",
              turnPosition: null,
              joinedAt: new Date(baseTime + i * 1000),
            });
          }

          // The earliest joiner among non-host players is at index 1
          const expectedNewHost = players[1];

          mockFindUnique.mockResolvedValue({
            id: players[0].id,
            playerId: hostPlayerId,
            isHost: true,
            room: {
              id: "room-id-1",
              code: "ABC123",
              status: "waiting",
              playerCount: totalPlayers,
              players,
            },
          });

          let hostUpdateCalledWith: unknown;
          let deleteCalledWith: unknown;

          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              roomPlayer: {
                delete: vi.fn().mockImplementation((args) => {
                  deleteCalledWith = args;
                  return Promise.resolve({});
                }),
                update: vi.fn().mockImplementation((args) => {
                  hostUpdateCalledWith = args;
                  return Promise.resolve({});
                }),
                updateMany: vi.fn().mockResolvedValue({ count: totalPlayers - 1 }),
              },
              room: {
                update: vi.fn().mockResolvedValue({}),
              },
            };
            return cb(mockTx);
          });

          const result = await leaveRoom({ playerId: hostPlayerId });

          expect(result.success).toBe(true);
          if (result.success) {
            // Room is NOT deleted
            expect(result.roomDeleted).toBe(false);

            // The leaving host's record was deleted
            expect(deleteCalledWith).toBeDefined();
            const deleteCall = deleteCalledWith as {
              where: { id: string };
            };
            expect(deleteCall.where.id).toBe(players[0].id);

            // The earliest joiner becomes the new host with readyState "not-ready"
            expect(hostUpdateCalledWith).toBeDefined();
            const updateCall = hostUpdateCalledWith as {
              where: { id: string };
              data: { isHost: boolean; readyState: string };
            };
            expect(updateCall.where.id).toBe(expectedNewHost.id);
            expect(updateCall.data.isHost).toBe(true);
            expect(updateCall.data.readyState).toBe("not-ready");
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.4**
   *
   * For any player in a room with status "in-progress", attempting to leave
   * always returns CANNOT_LEAVE_ACTIVE_GAME error.
   */
  it("Property 11: Cannot leave during active game", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        fc.boolean(),
        fc.integer({ min: 2, max: 4 }),
        async (playerId, isHost, totalPlayers) => {
          const players = Array.from({ length: totalPlayers }, (_, i) => ({
            id: `player-record-${i}`,
            playerId: i === 0 ? playerId : `other-player-${i}`,
            displayName: `Player ${i}`,
            isHost: i === 0 ? isHost : i === 1 ? !isHost : false,
            readyState: "ready",
            status: "connected",
            turnPosition: i + 1,
            joinedAt: new Date(`2024-01-01T00:0${i}:00Z`),
          }));

          // Room is "in-progress"
          mockFindUnique.mockResolvedValue({
            id: players[0].id,
            playerId,
            isHost,
            room: {
              id: "room-id-1",
              code: "ABC123",
              status: "in-progress",
              playerCount: totalPlayers,
              players,
            },
          });

          const result = await leaveRoom({ playerId });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.code).toBe("CANNOT_LEAVE_ACTIVE_GAME");
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
