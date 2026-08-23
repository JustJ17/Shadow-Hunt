// Feature: action-cards
// Property 22: Reward Composition
// **Validates: Requirements 16.2, 16.3, 16.4, 1.9**
//
// For any Capture_Order value 1-6, the granted card count equals the tier (4, 3, 2, 1, 1, 1),
// exactly one granted card has Card_Identifier `locate-the-mastermind`, and every granted
// Card_Identifier belongs to the Card_Pool (no legacy types).

import fc from "fast-check";
import { describe, it, expect, vi } from "vitest";
import {
  resolveSpyAndReward,
  computeRewardTier,
} from "@/lib/turn-engine/resolution/resolve-spy-reward";
import { CARD_POOL, LEGACY_CARD_TYPES } from "@/lib/turn-engine/cards/types";

// --- Mock Transaction Builder ---

/**
 * Creates a mock transaction client that sets up Case 1 (pending reward + left region)
 * and tracks all actionCard.create calls for assertion.
 */
function makeMockTx(captureOrder: number) {
  const createdCards: Array<{ roomId: string; playerId: string; type: string; consumed: boolean }> = [];

  const tx = {
    location: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        // Player is in regionB (different from pending reward region)
        return Promise.resolve({ id: where.id, regionId: "region-b" });
      }),
    },
    playerPosition: {
      findUnique: vi.fn().mockResolvedValue({
        roomId: "room-1",
        playerId: "player-1",
        locationId: "loc-b-1",
        skipNextTurn: false,
        pendingRewardRegionId: "region-a", // Pending reward in region-a
        pendingRewardCaptureOrder: captureOrder,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    actionCard: {
      create: vi.fn().mockImplementation(({ data }: any) => {
        createdCards.push(data);
        return Promise.resolve({ id: `card-${createdCards.length}`, ...data });
      }),
    },
    gameEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    gameSpy: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
    },
    notebookEntry: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as any;

  return { tx, createdCards };
}

// --- Arbitraries ---

/** Capture order ranging from 1 to 6 (all valid values in the game) */
const arbCaptureOrder = fc.integer({ min: 1, max: 6 });

/** RNG value in [0, 1) — simulates Math.random outputs */
const arbRngValue = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });

/** Sequence of RNG values for deterministic testing (up to 4 needed for max reward tier) */
const arbRngSequence = fc.array(arbRngValue, { minLength: 4, maxLength: 4 });

describe("Property 22: Reward Composition", () => {
  // **Validates: Requirements 16.2, 16.3, 16.4, 1.9**

  describe("granted card count equals the tier for capture orders 1-6", () => {
    it("for any capture order 1-6, the number of granted cards matches computeRewardTier", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbCaptureOrder,
          arbRngSequence,
          async (captureOrder, rngValues) => {
            const { tx, createdCards } = makeMockTx(captureOrder);

            // Create a deterministic rng that cycles through provided values
            let rngIndex = 0;
            const rng = () => {
              const value = rngValues[rngIndex % rngValues.length];
              rngIndex++;
              return value;
            };

            const result = await resolveSpyAndReward(
              "room-1",
              "player-1",
              "loc-b-1", // Player is in region-b (different from pending reward region-a)
              1,
              tx,
              rng
            );

            // Must trigger Case 1 (reward collected)
            expect(result.type).toBe("spy-captured-reward-collected");

            // Card count must equal the tier
            const expectedTier = computeRewardTier(captureOrder);
            expect(createdCards.length).toBe(expectedTier);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("tier mapping: 1->4, 2->3, 3->2, 4->1, 5->1, 6->1", () => {
      fc.assert(
        fc.property(arbCaptureOrder, (captureOrder) => {
          const tier = computeRewardTier(captureOrder);
          const expected: Record<number, number> = {
            1: 4,
            2: 3,
            3: 2,
            4: 1,
            5: 1,
            6: 1,
          };
          expect(tier).toBe(expected[captureOrder]);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("exactly one locate-the-mastermind card is guaranteed", () => {
    it("for any capture order and rng values, exactly one card is locate-the-mastermind", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbCaptureOrder,
          arbRngSequence,
          async (captureOrder, rngValues) => {
            const { tx, createdCards } = makeMockTx(captureOrder);

            let rngIndex = 0;
            const rng = () => {
              const value = rngValues[rngIndex % rngValues.length];
              rngIndex++;
              return value;
            };

            await resolveSpyAndReward("room-1", "player-1", "loc-b-1", 1, tx, rng);

            // Exactly one locate-the-mastermind card
            const locateCards = createdCards.filter(
              (c) => c.type === "locate-the-mastermind"
            );
            expect(locateCards.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("even single-card rewards (capture order 4-6) contain locate-the-mastermind", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 4, max: 6 }),
          arbRngSequence,
          async (captureOrder, rngValues) => {
            const { tx, createdCards } = makeMockTx(captureOrder);

            let rngIndex = 0;
            const rng = () => {
              const value = rngValues[rngIndex % rngValues.length];
              rngIndex++;
              return value;
            };

            await resolveSpyAndReward("room-1", "player-1", "loc-b-1", 1, tx, rng);

            // Single-card reward
            expect(createdCards.length).toBe(1);
            expect(createdCards[0].type).toBe("locate-the-mastermind");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("all granted cards belong to CARD_POOL (no legacy types)", () => {
    it("for any capture order and rng values, every card type is in CARD_POOL", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbCaptureOrder,
          arbRngSequence,
          async (captureOrder, rngValues) => {
            const { tx, createdCards } = makeMockTx(captureOrder);

            let rngIndex = 0;
            const rng = () => {
              const value = rngValues[rngIndex % rngValues.length];
              rngIndex++;
              return value;
            };

            await resolveSpyAndReward("room-1", "player-1", "loc-b-1", 1, tx, rng);

            // Every card type must be in CARD_POOL
            for (const card of createdCards) {
              expect(CARD_POOL).toContain(card.type);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("no legacy card types are ever granted regardless of rng values", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbCaptureOrder,
          arbRngSequence,
          async (captureOrder, rngValues) => {
            const { tx, createdCards } = makeMockTx(captureOrder);

            let rngIndex = 0;
            const rng = () => {
              const value = rngValues[rngIndex % rngValues.length];
              rngIndex++;
              return value;
            };

            await resolveSpyAndReward("room-1", "player-1", "loc-b-1", 1, tx, rng);

            // No legacy types
            for (const card of createdCards) {
              expect(LEGACY_CARD_TYPES).not.toContain(card.type);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("duplicates are allowed within a single reward", () => {
    it("when rng selects the same index repeatedly, duplicate cards are granted", async () => {
      // Use a fixed rng that always returns 0 (selecting first card from CARD_POOL)
      const { tx, createdCards } = makeMockTx(1); // capture order 1 -> 4 cards

      const rng = () => 0; // Always picks index 0 from CARD_POOL

      await resolveSpyAndReward("room-1", "player-1", "loc-b-1", 1, tx, rng);

      // 4 cards total: 1 guaranteed locate-the-mastermind + 3 from CARD_POOL[0]
      expect(createdCards.length).toBe(4);

      // The first card is always locate-the-mastermind (guaranteed)
      expect(createdCards[0].type).toBe("locate-the-mastermind");

      // The remaining 3 cards should all be CARD_POOL[0] (since rng always returns 0)
      // Math.floor(0 * 10) = 0, so CARD_POOL[0] = "close-all-roads"
      const remainingCards = createdCards.slice(1);
      for (const card of remainingCards) {
        expect(card.type).toBe(CARD_POOL[0]);
      }
    });
  });
});
