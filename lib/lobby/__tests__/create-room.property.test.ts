import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomPlayer: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/lobby/room-code", () => ({
  generateRoomCode: vi.fn(),
}));

import { createRoom } from "../create-room";
import { prisma } from "@/lib/prisma";
import { generateRoomCode } from "../room-code";

const mockFindUnique = prisma.roomPlayer.findUnique as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockGenerateRoomCode = generateRoomCode as ReturnType<typeof vi.fn>;

// Arbitraries
const validDisplayName = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);
const validPlayerId = fc.uuid();
const validVisibility = fc.constantFrom("public" as const, "private" as const);

// Feature: lobby-player-join, Property 1: Room creation produces valid initial state
describe("Room creation - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
   *
   * For any valid playerId and displayName (1-30 chars, non-whitespace-only):
   * - Result has success: true
   * - roomCode matches /^[A-Z0-9]{6}$/
   * - State has exactly 1 player
   * - That player is host, readyState is "not-ready", status is "connected"
   * - Room status is "waiting", hostId matches playerId
   */
  it("Property 1: Room creation produces valid initial state", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validDisplayName,
        validVisibility,
        async (playerId, displayName, visibility) => {
          // No existing membership
          mockFindUnique.mockResolvedValue(null);

          // Generate a valid room code
          const fakeCode = "ABC123";
          mockGenerateRoomCode.mockResolvedValue(fakeCode);

          // Mock transaction to execute the callback with a mock tx
          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              room: {
                create: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: fakeCode,
                  status: "waiting",
                  visibility,
                  playerCount: 1,
                }),
              },
              roomPlayer: {
                create: vi.fn().mockResolvedValue({
                  id: "player-record-id-1",
                  playerId,
                  displayName: displayName.trim(),
                  roomId: "room-id-1",
                  isHost: true,
                  readyState: "not-ready",
                  status: "connected",
                  turnPosition: null,
                }),
              },
            };
            return cb(mockTx);
          });

          const result = await createRoom({ playerId, displayName, visibility });

          // Result has success: true
          expect(result.success).toBe(true);

          if (result.success) {
            // roomCode matches /^[A-Z0-9]{6}$/
            expect(result.roomCode).toMatch(/^[A-Z0-9]{6}$/);

            // State has exactly 1 player
            expect(result.state.players).toHaveLength(1);

            // That player is host, readyState is "not-ready", status is "connected"
            const player = result.state.players[0];
            expect(player.isHost).toBe(true);
            expect(player.readyState).toBe("not-ready");
            expect(player.status).toBe("connected");
            expect(player.turnPosition).toBeNull();

            // Room status is "waiting"
            expect(result.state.status).toBe("waiting");

            // hostId matches playerId
            expect(result.state.hostId).toBe(playerId);

            // Visibility matches input
            expect(result.state.visibility).toBe(visibility);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.5, 2.5, 2.6**
   *
   * If a player already has a membership, createRoom returns MUST_LEAVE_CURRENT_ROOM error.
   */
  it("Property 2: Single-room constraint", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validDisplayName,
        validVisibility,
        async (playerId, displayName, visibility) => {
          // Player already has an existing membership
          mockFindUnique.mockResolvedValue({
            id: "existing-membership-id",
            playerId,
            roomId: "existing-room-id",
          });

          const result = await createRoom({ playerId, displayName, visibility });

          // Should fail with MUST_LEAVE_CURRENT_ROOM
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.code).toBe("MUST_LEAVE_CURRENT_ROOM");
          }

          // Should NOT have called generateRoomCode or transaction
          expect(mockGenerateRoomCode).not.toHaveBeenCalled();
          expect(mockTransaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
