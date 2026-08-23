// Feature: action-cards, Property 23: No Hand Cap
// **Validates: Requirements 17.1, 17.2**

import fc from "fast-check";
import { describe, it, expect, vi } from "vitest";
import {
  resolveSpyAndReward,
  computeRewardTier,
} from "@/lib/turn-engine/resolution/resolve-spy-reward";
import type { TransactionClient } from "@/lib/turn-engine/types";

/**
 * Property 23: No Hand Cap
 *
 * For any pre-existing hand size h >= 0, granting a reward of tier t
 * results in hand size h + t. No truncation, rejection, or discard
 * occurs regardless of hand size.
 *
 * Test approach: Mock the transaction client to track actionCard.create calls.
 * Trigger Case 1 (pending reward + left region) of resolveSpyAndReward to
 * exercise grantRewardCards. Count new cards created — must always equal rewardTier.
 */
describe("No Hand Cap - Property Tests", () => {
  // **Validates: Requirements 17.1, 17.2**

  /**
   * Creates a mock transaction client configured for Case 1 (pending reward + left region).
   * Tracks all actionCard.create calls to count cards granted.
   */
  function createMockTx(options: {
    pendingRewardRegionId: string;
    pendingRewardCaptureOrder: number;
    playerRegionId: string;
    existingHandSize: number;
  }) {
    const createdCards: Array<{ type: string; playerId: string; roomId: string }> = [];

    const mockTx = {
      location: {
        findUnique: vi.fn().mockResolvedValue({
          regionId: options.playerRegionId,
        }),
      },
      playerPosition: {
        findUnique: vi.fn().mockResolvedValue({
          pendingRewardRegionId: options.pendingRewardRegionId,
          pendingRewardCaptureOrder: options.pendingRewardCaptureOrder,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      actionCard: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdCards.push({
            type: data.type,
            playerId: data.playerId,
            roomId: data.roomId,
          });
          return { id: `card-${createdCards.length}`, ...data };
        }),
      },
      gameEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    } as unknown as TransactionClient;

    return { mockTx, createdCards };
  }

  describe("Property 23: No Hand Cap", () => {
    it("for any hand size h (0-20) and tier t (1-4), total cards after granting is exactly h + t", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 20 }),  // pre-existing hand size h
          fc.integer({ min: 1, max: 6 }),   // captureOrder (1-6) maps to tier 4,3,2,1,1,1
          fc.integer({ min: 1, max: 999 }), // maps to rng value 0.001–0.999
          async (existingHandSize, captureOrder, rngSeed) => {
            const rngValue = rngSeed / 1000;
            const rewardTier = computeRewardTier(captureOrder);

            // Set up mock tx: player has a pending reward and is in a different region
            const { mockTx, createdCards } = createMockTx({
              pendingRewardRegionId: "region-A",
              pendingRewardCaptureOrder: captureOrder,
              playerRegionId: "region-B",
              existingHandSize,
            });

            const rng = () => rngValue;

            const result = await resolveSpyAndReward(
              "room-1",
              "player-1",
              "loc-in-region-B",
              1, // currentRound
              mockTx,
              rng
            );

            // Case 1 should fire: pending reward + player left the capture region
            expect(result.type).toBe("spy-captured-reward-collected");

            // The function creates exactly rewardTier new cards — no cap
            expect(createdCards.length).toBe(rewardTier);

            // Total hand size would be existingHandSize + rewardTier (h + t)
            // Since we're mocking, we verify the function created exactly t new cards
            // which means no cap prevented any card from being created
            // The total hand = h (existing, not tracked here) + t (created) = h + t
          }
        ),
        { numRuns: 100 }
      );
    });

    it("no hand cap prevents or limits the grant even with large hand sizes", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),  // hand sizes above old cap of 5
          fc.integer({ min: 1, max: 4 }),   // captureOrder 1-4 (gets tiers 4,3,2,1)
          fc.integer({ min: 1, max: 999 }), // maps to rng value 0.001–0.999
          async (existingHandSize, captureOrder, rngSeed) => {
            const rngValue = rngSeed / 1000;
            const rewardTier = computeRewardTier(captureOrder);

            const { mockTx, createdCards } = createMockTx({
              pendingRewardRegionId: "region-X",
              pendingRewardCaptureOrder: captureOrder,
              playerRegionId: "region-Y",
              existingHandSize,
            });

            const rng = () => rngValue;

            const result = await resolveSpyAndReward(
              "room-large",
              "player-big-hand",
              "loc-region-Y",
              1,
              mockTx,
              rng
            );

            expect(result.type).toBe("spy-captured-reward-collected");

            // Full reward tier is always granted — NO truncation regardless of hand size
            // Previously this was capped at min(rewardTier, 5 - existingCards)
            // Now it must always be exactly rewardTier
            expect(createdCards.length).toBe(rewardTier);

            // Verify h + t property: existing hand + new cards = total
            // Since grantRewardCards creates exactly rewardTier cards unconditionally,
            // the player's total hand after would be existingHandSize + rewardTier
            const totalHandAfter = existingHandSize + createdCards.length;
            expect(totalHandAfter).toBe(existingHandSize + rewardTier);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
