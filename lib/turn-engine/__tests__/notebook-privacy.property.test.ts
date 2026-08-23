// Feature: action-cards, Property 20: Notebook Privacy
// **Validates: Requirements 15.9, 19.6**

import fc from "fast-check";
import { describe, it, expect, vi } from "vitest";

// Mock prisma so self-access test doesn't try a real DB connection
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notebookEntry: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));
import { getPlayerNotebook } from "@/lib/turn-engine/notebook";

/**
 * Property 20: Notebook Privacy
 *
 * For any Player pairs (A, B) with A != B, no request by A returns any
 * Notebook entry belonging to B, and any direct attempt to access B's
 * notebook is rejected.
 *
 * The getPlayerNotebook function has an access guard that throws before
 * any database query if requestingPlayerId !== playerId. This test
 * verifies that guard holds for all distinct player ID pairs.
 */
describe("Notebook Privacy - Property Tests", () => {
  // **Validates: Requirements 15.9, 19.6**

  describe("Property 20: Notebook Privacy", () => {
    it("any request by player A to read player B's notebook (A != B) is rejected with access denied", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // playerA (the requesting player)
          fc.uuid(), // playerB (the notebook owner)
          async (roomId, playerA, playerB) => {
            // Pre-condition: players must be distinct
            fc.pre(playerA !== playerB);

            // Player A attempts to access Player B's notebook
            await expect(
              getPlayerNotebook(roomId, playerB, playerA)
            ).rejects.toThrow("Access denied: cannot view another player's notebook");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("cross-player access is rejected regardless of room ID or player ID format", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // roomId (arbitrary format)
          fc.string({ minLength: 1, maxLength: 50 }), // playerA
          fc.string({ minLength: 1, maxLength: 50 }), // playerB
          async (roomId, playerA, playerB) => {
            // Pre-condition: players must be distinct
            fc.pre(playerA !== playerB);

            // The guard rejects before any DB call, regardless of ID format
            await expect(
              getPlayerNotebook(roomId, playerB, playerA)
            ).rejects.toThrow("Access denied: cannot view another player's notebook");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("same-player access does NOT throw access denied (guard allows self-access)", async () => {
      // This is a sanity check: verifying the guard is directional.
      // When A == B, the guard should NOT throw — it should proceed
      // to the DB query (which will throw a different error since we
      // have no real DB connection in unit tests, but importantly NOT
      // the "Access denied" error).
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // roomId
          fc.uuid(), // player (same for both)
          async (roomId, player) => {
            // Self-access should not throw "Access denied"
            // It will throw a different error (prisma not connected) but
            // the privacy guard should pass
            try {
              await getPlayerNotebook(roomId, player, player);
            } catch (error: unknown) {
              // Must NOT be an access denied error
              const message = error instanceof Error ? error.message : String(error);
              expect(message).not.toContain("Access denied");
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
