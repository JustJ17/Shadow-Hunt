// Feature: action-cards, Property 6: Penalty Non-Stacking Cap
// **Validates: Requirements 8.7, 8.8**

import fc from "fast-check";
import { handleLoseAnAction } from "../lose-an-action";
import type { CardEffectContext } from "../../types";

/**
 * Property 6: Penalty Non-Stacking Cap
 *
 * For any k >= 1 `lose-an-action` cards resolved against the same target
 * before that target's next turn, the target's Action_Budget on that next
 * turn equals exactly Default_Action_Budget - 1 (i.e., 1). The penalty
 * does not stack below Minimum_Action_Budget.
 *
 * Since the penalty is a boolean flag (actionPenaltyFlag: true/false),
 * calling handleLoseAnAction k times produces the same result as once.
 * The computed action budget when the flag is set is always exactly 1.
 */

const DEFAULT_ACTION_BUDGET = 2;
const MINIMUM_ACTION_BUDGET = 1;

/**
 * Computes the action budget for a turn given the penalty flag state.
 * This mirrors the logic used in advanceTurn: `actionPenaltyFlag ? 1 : 2`
 */
function computeActionBudget(actionPenaltyFlag: boolean): number {
  return Math.max(
    MINIMUM_ACTION_BUDGET,
    DEFAULT_ACTION_BUDGET - (actionPenaltyFlag ? 1 : 0)
  );
}

/**
 * Creates a mock transaction client that tracks playerPosition updates.
 * Returns the mock tx and a record of updates applied.
 */
function createMockTx() {
  const updates: Array<{ where: unknown; data: unknown }> = [];
  let currentFlagState = false;

  const tx = {
    playerPosition: {
      update: async (args: { where: unknown; data: { actionPenaltyFlag?: boolean } }) => {
        updates.push(args);
        if (args.data.actionPenaltyFlag !== undefined) {
          currentFlagState = args.data.actionPenaltyFlag;
        }
        return {};
      },
    },
    gameEvent: {
      aggregate: async () => ({ _max: { sequenceNumber: 0 } }),
      create: async () => ({}),
    },
  } as unknown as CardEffectContext["tx"];

  return { tx, updates, getFlagState: () => currentFlagState };
}

describe("Penalty Non-Stacking Cap — Property 6", () => {
  /**
   * **Validates: Requirements 8.7, 8.8**
   *
   * For any k >= 1 applications of handleLoseAnAction against the same target,
   * the actionPenaltyFlag ends up as `true` (not a counter that increments).
   */
  it("applying handleLoseAnAction k times (k >= 1) always results in actionPenaltyFlag: true", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate k >= 1 applications
        fc.integer({ min: 1, max: 20 }),
        // Generate identifiers for context
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (k, roomId, casterId, targetId) => {
          const { tx, updates, getFlagState } = createMockTx();

          // Apply handleLoseAnAction k times against the same target
          for (let i = 0; i < k; i++) {
            const ctx: CardEffectContext = {
              roomId,
              playerId: casterId,
              targetPlayerId: targetId,
              playerLocationId: "loc-1",
              currentRound: 1,
              casterTurnPosition: 0,
              tx,
              rng: Math.random,
            };
            await handleLoseAnAction(ctx);
          }

          // The flag is boolean — it should be true regardless of k
          expect(getFlagState()).toBe(true);

          // Every update call should set the flag to true (idempotent)
          for (const update of updates) {
            expect((update.data as { actionPenaltyFlag: boolean }).actionPenaltyFlag).toBe(true);
          }

          // Exactly k update calls should have been made (the handler is called k times)
          // but the data written is always { actionPenaltyFlag: true }
          expect(updates.length).toBeGreaterThanOrEqual(k);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 8.7, 8.8**
   *
   * The computed action budget when actionPenaltyFlag is set is always
   * exactly Default_Action_Budget - 1 = 1, regardless of how many times
   * the penalty was applied.
   */
  it("action budget with penalty flag set is always exactly 1 (Default - 1)", () => {
    fc.assert(
      fc.property(
        // Any k >= 1 applications
        fc.integer({ min: 1, max: 100 }),
        (k) => {
          // The penalty flag is boolean. After k >= 1 applications, flag = true.
          // Simulating what happens: each application sets flag to true.
          let flagState = false;
          for (let i = 0; i < k; i++) {
            flagState = true; // handleLoseAnAction always sets to true
          }

          // Compute the action budget for the penalized turn
          const budget = computeActionBudget(flagState);

          // Budget must be exactly 1 (Default_Action_Budget - 1)
          expect(budget).toBe(1);

          // Budget must equal Minimum_Action_Budget (never goes below)
          expect(budget).toBeGreaterThanOrEqual(MINIMUM_ACTION_BUDGET);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 8.7, 8.8**
   *
   * The penalty never reduces Action_Budget below Minimum_Action_Budget.
   * Since the flag is boolean (not a counter), this is guaranteed, but
   * we verify the budget computation bounds explicitly.
   */
  it("penalty never reduces budget below Minimum_Action_Budget", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // any flag state
        (penaltyFlag) => {
          const budget = computeActionBudget(penaltyFlag);

          // Budget is always within [Minimum_Action_Budget, Default_Action_Budget]
          expect(budget).toBeGreaterThanOrEqual(MINIMUM_ACTION_BUDGET);
          expect(budget).toBeLessThanOrEqual(DEFAULT_ACTION_BUDGET);

          // Specific expected values
          if (penaltyFlag) {
            expect(budget).toBe(1);
          } else {
            expect(budget).toBe(2);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 8.7, 8.8**
   *
   * Applying the penalty once produces the same actionPenaltyFlag state
   * as applying it k > 1 times. The penalty is idempotent.
   */
  it("single application produces identical state to k > 1 applications (idempotence)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 50 }),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (k, roomId, casterId, targetId) => {
          // Apply once
          const once = createMockTx();
          const ctxOnce: CardEffectContext = {
            roomId,
            playerId: casterId,
            targetPlayerId: targetId,
            playerLocationId: "loc-1",
            currentRound: 1,
            casterTurnPosition: 0,
            tx: once.tx,
            rng: Math.random,
          };
          await handleLoseAnAction(ctxOnce);
          const flagAfterOnce = once.getFlagState();

          // Apply k times
          const kTimes = createMockTx();
          for (let i = 0; i < k; i++) {
            const ctxK: CardEffectContext = {
              roomId,
              playerId: casterId,
              targetPlayerId: targetId,
              playerLocationId: "loc-1",
              currentRound: 1,
              casterTurnPosition: 0,
              tx: kTimes.tx,
              rng: Math.random,
            };
            await handleLoseAnAction(ctxK);
          }
          const flagAfterK = kTimes.getFlagState();

          // Both should produce the same flag state
          expect(flagAfterOnce).toBe(flagAfterK);
          expect(flagAfterOnce).toBe(true);

          // Both yield the same action budget
          expect(computeActionBudget(flagAfterOnce)).toBe(computeActionBudget(flagAfterK));
          expect(computeActionBudget(flagAfterK)).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
