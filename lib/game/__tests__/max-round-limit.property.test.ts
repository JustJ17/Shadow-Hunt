// Feature: win-detection-game-end, Property 3: maxRoundLimit validation
// **Validates: Requirements 1.6**

import fc from "fast-check";
import { initializeGame } from "@/lib/game/initialize-game";
import { TransactionClient } from "@/lib/game/types";

/**
 * Creates a minimal mock transaction client.
 * For valid maxRoundLimit values, the function proceeds to query locations.
 * We return an empty array to trigger NO_LOCATIONS_FOUND — this proves that
 * validation passed (the function did NOT return INVALID_ROUND_LIMIT).
 */
function createMockTx(): TransactionClient {
  return {
    location: {
      findMany: async () => [],
    },
    roomPlayer: {
      findMany: async () => [],
      createMany: async () => ({ count: 0 }),
    },
    gameTurn: {
      create: async () => ({}),
    },
    room: {
      update: async () => ({}),
      findUnique: async () => null,
    },
    gameThreat: {
      create: async () => ({}),
    },
    gameSpy: {
      create: async () => ({}),
      createMany: async () => ({ count: 0 }),
    },
    playerPosition: {
      createMany: async () => ({ count: 0 }),
    },
    gameEvent: {
      create: async () => ({}),
    },
  } as unknown as TransactionClient;
}

describe("maxRoundLimit Validation Property Tests", () => {
  // **Validates: Requirements 1.6**

  describe("Property 3: maxRoundLimit validation", () => {
    // For any integer value provided as maxRoundLimit, the system SHALL accept it
    // if and only if it is in the range [1, 100]. Values outside this range SHALL
    // be rejected during game initialization.

    it("valid integer values in [1, 100] are accepted (do not return INVALID_ROUND_LIMIT)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (maxRoundLimit: number) => {
            const tx = createMockTx();
            const result = await initializeGame("test-room-id", tx, {
              maxRoundLimit,
            });

            // The validation should pass — the result should NOT be
            // INVALID_ROUND_LIMIT. It will fail with NO_LOCATIONS_FOUND
            // since our mock returns no locations, but that proves the
            // maxRoundLimit validation itself succeeded.
            if (!result.success) {
              expect(result.code).not.toBe("INVALID_ROUND_LIMIT");
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    it("integer values < 1 are rejected with INVALID_ROUND_LIMIT", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -1000, max: 0 }),
          async (maxRoundLimit: number) => {
            const tx = createMockTx();
            const result = await initializeGame("test-room-id", tx, {
              maxRoundLimit,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_ROUND_LIMIT");
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    it("integer values > 100 are rejected with INVALID_ROUND_LIMIT", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 101, max: 10000 }),
          async (maxRoundLimit: number) => {
            const tx = createMockTx();
            const result = await initializeGame("test-room-id", tx, {
              maxRoundLimit,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_ROUND_LIMIT");
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    it("non-integer values (floats) are rejected with INVALID_ROUND_LIMIT", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate floats that are NOT integers — filter out integers
          fc.double({ min: -100, max: 200, noNaN: true }).filter(
            (n) => !Number.isInteger(n) && Number.isFinite(n)
          ),
          async (maxRoundLimit: number) => {
            const tx = createMockTx();
            const result = await initializeGame("test-room-id", tx, {
              maxRoundLimit,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_ROUND_LIMIT");
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    it("special numeric values (NaN, Infinity, -Infinity) are rejected with INVALID_ROUND_LIMIT", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(NaN, Infinity, -Infinity),
          async (maxRoundLimit: number) => {
            const tx = createMockTx();
            const result = await initializeGame("test-room-id", tx, {
              maxRoundLimit,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_ROUND_LIMIT");
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });
});
