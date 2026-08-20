import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomPlayer: { findUnique: vi.fn(), update: vi.fn() },
    room: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { startGame } from "../start-game";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.roomPlayer.findUnique as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

// Arbitraries
const validPlayerId = fc.uuid();
const playerCount = fc.integer({ min: 2, max: 4 });

function makePlayers(count: number, hostPlayerId: string) {
  const players = [];
  const baseTime = new Date("2024-01-01T00:00:00Z").getTime();

  for (let i = 0; i < count; i++) {
    players.push({
      id: `player-record-${i}`,
      playerId: i === 0 ? hostPlayerId : `other-player-${i}`,
      displayName: `Player ${i}`,
      isHost: i === 0,
      readyState: i === 0 ? "not-ready" : "ready", // Non-host players are ready
      status: "connected",
      turnPosition: null,
      joinedAt: new Date(baseTime + i * 1000),
    });
  }

  return players;
}

// Feature: lobby-player-join, Property 10: Turn positions form a valid permutation
// Feature: lobby-player-join, Property 12: Only host can start the game
describe("Game start - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 8.1, 8.2**
   *
   * Property 10: On successful game start with N players, turn positions
   * are a permutation of 1..N (all unique, sequential, covering all positions).
   */
  it("Property 10: Game start assigns unique sequential turn positions", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        playerCount,
        async (hostPlayerId, count) => {
          const players = makePlayers(count, hostPlayerId);

          mockFindUnique.mockResolvedValue({
            id: "membership-host",
            playerId: hostPlayerId,
            isHost: true,
            room: {
              id: "room-id-1",
              code: "ABC123",
              status: "waiting",
              playerCount: count,
              players,
            },
          });

          // Mock the transaction to execute the callback
          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              room: { update: vi.fn().mockResolvedValue({}) },
              roomPlayer: { update: vi.fn().mockResolvedValue({}) },
            };
            return cb(mockTx);
          });

          const result = await startGame({ playerId: hostPlayerId });

          expect(result.success).toBe(true);
          if (result.success) {
            const { turnOrder } = result;

            // Should have exactly N entries
            expect(turnOrder).toHaveLength(count);

            // Extract positions
            const positions = turnOrder.map((t) => t.position);

            // All positions should be unique
            const uniquePositions = new Set(positions);
            expect(uniquePositions.size).toBe(count);

            // Positions should be exactly 1..N
            const sorted = [...positions].sort((a, b) => a - b);
            const expected = Array.from({ length: count }, (_, i) => i + 1);
            expect(sorted).toEqual(expected);

            // All player IDs should be present
            const playerIds = turnOrder.map((t) => t.playerId);
            const expectedPlayerIds = players.map((p) => p.playerId);
            expect([...playerIds].sort()).toEqual([...expectedPlayerIds].sort());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 4.3, 5.3**
   *
   * Property 12: If the requesting player is not the host, startGame
   * returns NOT_HOST error.
   */
  it("Property 12: Only host can start the game", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        playerCount,
        async (playerId, count) => {
          const hostPlayerId = "actual-host-id";
          const players = makePlayers(count, hostPlayerId);

          // The requesting player is NOT the host
          mockFindUnique.mockResolvedValue({
            id: "membership-non-host",
            playerId,
            isHost: false,
            room: {
              id: "room-id-1",
              code: "ABC123",
              status: "waiting",
              playerCount: count,
              players,
            },
          });

          const result = await startGame({ playerId });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.code).toBe("NOT_HOST");
          }

          // Transaction should NOT have been called
          expect(mockTransaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 4.1**
   *
   * If fewer than 2 players are in the room, startGame returns
   * INSUFFICIENT_PLAYERS error.
   */
  it("Property additional: Insufficient players prevents game start", async () => {
    await fc.assert(
      fc.asyncProperty(validPlayerId, async (hostPlayerId) => {
        // Room with only 1 player (the host)
        const players = [
          {
            id: "player-record-0",
            playerId: hostPlayerId,
            displayName: "Host",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
            joinedAt: new Date("2024-01-01T00:00:00Z"),
          },
        ];

        mockFindUnique.mockResolvedValue({
          id: "membership-host",
          playerId: hostPlayerId,
          isHost: true,
          room: {
            id: "room-id-1",
            code: "ABC123",
            status: "waiting",
            playerCount: 1,
            players,
          },
        });

        const result = await startGame({ playerId: hostPlayerId });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.code).toBe("INSUFFICIENT_PLAYERS");
        }

        // Transaction should NOT have been called
        expect(mockTransaction).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * If any non-host player is not ready, startGame returns
   * PLAYERS_NOT_READY error.
   */
  it("Property additional: Non-ready players prevent game start", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        playerCount,
        fc.integer({ min: 1, max: 3 }),
        async (hostPlayerId, count, notReadyIndex) => {
          const players = makePlayers(count, hostPlayerId);

          // Set at least one non-host player to "not-ready"
          const nonHostPlayers = players.filter((p) => !p.isHost);
          if (nonHostPlayers.length === 0) return; // skip edge case

          const targetIndex = notReadyIndex % nonHostPlayers.length;
          nonHostPlayers[targetIndex].readyState = "not-ready";

          mockFindUnique.mockResolvedValue({
            id: "membership-host",
            playerId: hostPlayerId,
            isHost: true,
            room: {
              id: "room-id-1",
              code: "ABC123",
              status: "waiting",
              playerCount: count,
              players,
            },
          });

          const result = await startGame({ playerId: hostPlayerId });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.code).toBe("PLAYERS_NOT_READY");
          }

          // Transaction should NOT have been called
          expect(mockTransaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
