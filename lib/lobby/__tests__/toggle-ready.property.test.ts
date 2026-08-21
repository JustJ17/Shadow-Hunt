import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomPlayer: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { toggleReady } from "../toggle-ready";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.roomPlayer.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.roomPlayer.update as ReturnType<typeof vi.fn>;

// Arbitraries
const validPlayerId = fc.uuid();
const validReadyState = fc.constantFrom("ready" as const, "not-ready" as const);
const nonWaitingStatus = fc.constantFrom(
  "in-progress" as const,
  "abandoned" as const
);

// Feature: lobby-player-join, Property 7: Ready toggle is an involution
describe("Ready toggle - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * For any player in a "waiting" room, toggling ready twice returns to the original state.
   * If initial state is "not-ready" → toggle → "ready" → toggle → "not-ready" (and vice versa).
   */
  it("Property 6: Ready toggle is idempotent (double-toggle returns to original)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validReadyState,
        async (playerId, initialState) => {
          const toggledState =
            initialState === "ready" ? "not-ready" : "ready";

          // First toggle: player has initialState
          mockFindUnique.mockResolvedValueOnce({
            id: "membership-1",
            playerId,
            readyState: initialState,
            room: { id: "room-1", status: "waiting" },
          });
          mockUpdate.mockResolvedValueOnce({
            id: "membership-1",
            playerId,
            readyState: toggledState,
          });

          const firstResult = await toggleReady({ playerId });

          expect(firstResult.success).toBe(true);
          if (firstResult.success) {
            expect(firstResult.newReadyState).toBe(toggledState);
          }

          // Second toggle: player now has toggledState
          mockFindUnique.mockResolvedValueOnce({
            id: "membership-1",
            playerId,
            readyState: toggledState,
            room: { id: "room-1", status: "waiting" },
          });
          mockUpdate.mockResolvedValueOnce({
            id: "membership-1",
            playerId,
            readyState: initialState,
          });

          const secondResult = await toggleReady({ playerId });

          expect(secondResult.success).toBe(true);
          if (secondResult.success) {
            // Double-toggle returns to the original state
            expect(secondResult.newReadyState).toBe(initialState);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * For any player in a room that is NOT in "waiting" status (e.g., "in-progress" or "abandoned"),
   * toggleReady returns an error with code GAME_ALREADY_STARTED.
   */
  it("Property 7: Only 'waiting' rooms allow readiness changes", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validReadyState,
        nonWaitingStatus,
        async (playerId, readyState, roomStatus) => {
          // Player is in a room that is not "waiting"
          mockFindUnique.mockResolvedValueOnce({
            id: "membership-1",
            playerId,
            readyState,
            room: { id: "room-1", status: roomStatus },
          });

          const result = await toggleReady({ playerId });

          // Should fail with GAME_ALREADY_STARTED
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.code).toBe("GAME_ALREADY_STARTED");
          }

          // Should NOT have called update
          expect(mockUpdate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
