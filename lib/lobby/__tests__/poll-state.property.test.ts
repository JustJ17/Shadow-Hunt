import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomPlayer: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/lobby/disconnection", () => ({
  processDisconnections: vi.fn().mockResolvedValue(undefined),
}));

import { pollState } from "../poll-state";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.roomPlayer.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.roomPlayer.update as ReturnType<typeof vi.fn>;

// Arbitraries
const validPlayerId = fc.uuid();
const validRoomCode = fc
  .array(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), {
    minLength: 6,
    maxLength: 6,
  })
  .map((chars) => chars.join(""));
const validRoomStatus = fc.constantFrom(
  "waiting" as const,
  "in-progress" as const,
  "abandoned" as const
);
const validVisibility = fc.constantFrom("public" as const, "private" as const);
const validDisplayName = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);
const validReadyState = fc.constantFrom("ready" as const, "not-ready" as const);
const validPlayerStatus = fc.constantFrom(
  "connected" as const,
  "disconnected" as const
);

// Generate a room player record
const roomPlayerArb = fc.record({
  id: fc.uuid(),
  playerId: fc.uuid(),
  displayName: validDisplayName,
  isHost: fc.boolean(),
  readyState: validReadyState,
  status: validPlayerStatus,
  turnPosition: fc.option(fc.integer({ min: 1, max: 4 }), { nil: null }),
});

// Generate a list of 1-4 players where exactly one is host
const playersArb = fc
  .array(roomPlayerArb, { minLength: 1, maxLength: 4 })
  .map((players) => {
    // Ensure exactly one host
    const withNoHost = players.map((p) => ({ ...p, isHost: false }));
    withNoHost[0].isHost = true;
    return withNoHost;
  });

// Feature: lobby-player-join, Property 12: Poll response completeness
describe("Poll state - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 8.1, 8.2, 9.1, 9.2**
   *
   * For any player in a room, pollState returns success with a valid LobbyState
   * containing the correct roomCode, status, players, and hostId.
   */
  it("Property: Poll always returns current room state faithfully", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validRoomCode,
        validRoomStatus,
        validVisibility,
        playersArb,
        async (playerId, roomCode, roomStatus, visibility, players) => {
          // Ensure the polling player is one of the room players
          players[0].playerId = playerId;

          const roomId = "room-id-1";

          mockFindUnique.mockResolvedValue({
            playerId,
            roomId,
            room: {
              id: roomId,
              code: roomCode,
              status: roomStatus,
              visibility,
              players,
            },
          });

          mockUpdate.mockResolvedValue({});

          const result = await pollState({ playerId });

          expect(result.success).toBe(true);

          if (result.success) {
            // Room code matches
            expect(result.state.roomCode).toBe(roomCode);

            // Status matches
            expect(result.state.status).toBe(roomStatus);

            // Visibility matches
            expect(result.state.visibility).toBe(visibility);

            // Player list has correct length
            expect(result.state.players).toHaveLength(players.length);

            // Each player has the expected fields
            for (const player of result.state.players) {
              expect(player).toHaveProperty("id");
              expect(player).toHaveProperty("displayName");
              expect(player).toHaveProperty("isHost");
              expect(player).toHaveProperty("readyState");
              expect(player).toHaveProperty("status");
              expect(player).toHaveProperty("turnPosition");
              expect(["ready", "not-ready"]).toContain(player.readyState);
              expect(["connected", "disconnected"]).toContain(player.status);
            }

            // hostId is the playerId of the host player
            const host = players.find((p) => p.isHost);
            expect(result.state.hostId).toBe(host!.playerId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.2, 9.1, 9.2**
   *
   * pollState calls update with lastActivityAt and status="connected" (reconnection handling).
   */
  it("Property: Poll updates lastActivityAt and status to connected", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validRoomCode,
        validRoomStatus,
        validVisibility,
        playersArb,
        async (playerId, roomCode, roomStatus, visibility, players) => {
          players[0].playerId = playerId;

          const roomId = "room-id-1";

          mockFindUnique.mockResolvedValue({
            playerId,
            roomId,
            room: {
              id: roomId,
              code: roomCode,
              status: roomStatus,
              visibility,
              players,
            },
          });

          mockUpdate.mockResolvedValue({});

          await pollState({ playerId });

          // Verify update was called with the correct arguments
          expect(mockUpdate).toHaveBeenCalledWith({
            where: { playerId },
            data: {
              lastActivityAt: expect.any(Date),
              status: "connected",
              disconnectedAt: null,
            },
          });

          // Verify the lastActivityAt is recent (within 1 second of now)
          const updateCall = mockUpdate.mock.calls[0][0];
          const updatedTime = updateCall.data.lastActivityAt as Date;
          const now = new Date();
          expect(now.getTime() - updatedTime.getTime()).toBeLessThan(1000);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.2, 9.1, 9.2**
   *
   * If player is not in any room, returns NOT_IN_ROOM error.
   */
  it("Property: Poll returns NOT_IN_ROOM when player has no membership", async () => {
    await fc.assert(
      fc.asyncProperty(validPlayerId, async (playerId) => {
        // No membership found
        mockFindUnique.mockResolvedValue(null);

        const result = await pollState({ playerId });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.code).toBe("NOT_IN_ROOM");
        }

        // Should NOT have called update
        expect(mockUpdate).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
