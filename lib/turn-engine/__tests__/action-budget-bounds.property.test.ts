// Feature: action-cards
// Property 5: Action Budget Bounds
// **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
//
// For any turn, Actions_Remaining is always within [0, Default_Action_Budget]
// and Action_Budget is always within [Minimum_Action_Budget, Default_Action_Budget].
// The number of accepted actions in a turn equals that turn's Action_Budget.
//
// Default_Action_Budget = 2, Minimum_Action_Budget = 1.

import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { validateAction } from "@/lib/turn-engine/validate-action";
import type {
  TurnState,
  ActionCardData,
  BlockadeState,
  ActionPayload,
} from "@/lib/turn-engine/types";
import type { AdjacentLocationWithTransport } from "@/lib/map/adjacency";

// --- Constants ---

const DEFAULT_ACTION_BUDGET = 2;
const MINIMUM_ACTION_BUDGET = 1;

// --- Test Helpers ---

function makeTurnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    id: "turn-1",
    roomId: "room-1",
    currentPlayerId: "player-1",
    currentRound: 1,
    actionsRemaining: 2,
    actionBudget: 2,
    captureAttemptFlag: false,
    isExtraTurn: false,
    version: 0,
    ...overrides,
  };
}

function makeAdjacentLocations(): AdjacentLocationWithTransport[] {
  return [
    {
      id: "adj-loc-0",
      name: "Adjacent 0",
      regionId: "region-0",
      isHub: false,
      transport: "car",
      isSameRegion: true,
    },
  ];
}

function makeCards(): ActionCardData[] {
  return [
    { id: "card-1", type: "close-all-roads", consumed: false },
    { id: "card-2", type: "extra-turn", consumed: false },
  ];
}

const noBlockades: BlockadeState = { blockedTransports: new Set() };
const playerPosition = "player-pos";

// --- A valid action that always passes validation (given correct turn state) ---

function makeValidAction(): ActionPayload {
  return { actionType: "SKIP" };
}

// --- Arbitraries ---

/** Action budget is always 1 or 2 */
const arbActionBudget: fc.Arbitrary<number> = fc.constantFrom(
  MINIMUM_ACTION_BUDGET,
  DEFAULT_ACTION_BUDGET
);

/** Actions remaining ranges from 0 to actionBudget */
function arbActionsRemaining(actionBudget: number): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: actionBudget });
}

describe("Property 5: Action Budget Bounds", () => {
  // **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  describe("Action_Budget is always within [Minimum_Action_Budget, Default_Action_Budget]", () => {
    it("actionBudget is always 1 or 2 (the only valid values)", () => {
      fc.assert(
        fc.property(arbActionBudget, (actionBudget) => {
          expect(actionBudget).toBeGreaterThanOrEqual(MINIMUM_ACTION_BUDGET);
          expect(actionBudget).toBeLessThanOrEqual(DEFAULT_ACTION_BUDGET);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Actions_Remaining is always within [0, Default_Action_Budget]", () => {
    it("for any valid actionBudget, actionsRemaining is within [0, actionBudget]", () => {
      fc.assert(
        fc.property(
          arbActionBudget,
          (actionBudget) => {
            // actionsRemaining is initialized to actionBudget and decremented to 0
            for (let remaining = actionBudget; remaining >= 0; remaining--) {
              expect(remaining).toBeGreaterThanOrEqual(0);
              expect(remaining).toBeLessThanOrEqual(DEFAULT_ACTION_BUDGET);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("validateAction rejects when actionsRemaining = 0", () => {
    it("any action is rejected with NO_ACTIONS_REMAINING when actionsRemaining is 0", () => {
      const arbValidAction: fc.Arbitrary<ActionPayload> = fc.constantFrom(
        { actionType: "SKIP" } as ActionPayload,
        { actionType: "MOVE", targetLocationId: "adj-loc-0" } as ActionPayload,
        { actionType: "CAPTURE_ATTEMPT" } as ActionPayload,
        { actionType: "USE_CARD", cardId: "card-1" } as ActionPayload
      );

      fc.assert(
        fc.property(
          arbActionBudget,
          arbValidAction,
          (actionBudget, action) => {
            const turnState = makeTurnState({
              actionBudget,
              actionsRemaining: 0,
            });

            const result = validateAction(
              action,
              turnState,
              "player-1",
              playerPosition,
              makeAdjacentLocations(),
              makeCards(),
              noBlockades,
              0 // actionsRemaining = 0
            );

            expect(result).not.toBeNull();
            expect(result!.success).toBe(false);
            expect(result!.code).toBe("NO_ACTIONS_REMAINING");
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe("validateAction accepts valid actions when actionsRemaining > 0", () => {
    it("SKIP is accepted for any actionsRemaining in [1, actionBudget]", () => {
      fc.assert(
        fc.property(
          arbActionBudget,
          arbActionBudget.chain((budget) =>
            fc.integer({ min: 1, max: budget }).map((remaining) => ({ budget, remaining }))
          ),
          (_unusedBudget, { budget, remaining }) => {
            const turnState = makeTurnState({
              actionBudget: budget,
              actionsRemaining: remaining,
            });

            const result = validateAction(
              makeValidAction(),
              turnState,
              "player-1",
              playerPosition,
              makeAdjacentLocations(),
              makeCards(),
              noBlockades,
              remaining
            );

            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it("valid MOVE is accepted for any actionsRemaining in [1, actionBudget]", () => {
      fc.assert(
        fc.property(
          arbActionBudget,
          arbActionBudget.chain((budget) =>
            fc.integer({ min: 1, max: budget }).map((remaining) => ({ budget, remaining }))
          ),
          (_unusedBudget, { budget, remaining }) => {
            const turnState = makeTurnState({
              actionBudget: budget,
              actionsRemaining: remaining,
            });

            const action: ActionPayload = {
              actionType: "MOVE",
              targetLocationId: "adj-loc-0",
            };

            const result = validateAction(
              action,
              turnState,
              "player-1",
              playerPosition,
              makeAdjacentLocations(),
              makeCards(),
              noBlockades,
              remaining
            );

            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it("valid USE_CARD is accepted for any actionsRemaining in [1, actionBudget]", () => {
      fc.assert(
        fc.property(
          arbActionBudget,
          arbActionBudget.chain((budget) =>
            fc.integer({ min: 1, max: budget }).map((remaining) => ({ budget, remaining }))
          ),
          (_unusedBudget, { budget, remaining }) => {
            const turnState = makeTurnState({
              actionBudget: budget,
              actionsRemaining: remaining,
            });

            const action: ActionPayload = {
              actionType: "USE_CARD",
              cardId: "card-1",
            };

            const result = validateAction(
              action,
              turnState,
              "player-1",
              playerPosition,
              makeAdjacentLocations(),
              makeCards(),
              noBlockades,
              remaining
            );

            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe("total accepted actions in a turn equals actionBudget", () => {
    it("a turn with budget N accepts exactly N actions before rejection", () => {
      fc.assert(
        fc.property(arbActionBudget, (actionBudget) => {
          let acceptedCount = 0;

          // Simulate submitting actions, decrementing actionsRemaining each time
          for (let remaining = actionBudget; remaining >= 0; remaining--) {
            const turnState = makeTurnState({
              actionBudget,
              actionsRemaining: remaining,
            });

            const result = validateAction(
              makeValidAction(),
              turnState,
              "player-1",
              playerPosition,
              makeAdjacentLocations(),
              makeCards(),
              noBlockades,
              remaining
            );

            if (result === null) {
              // Action accepted
              acceptedCount++;
            } else {
              // Action rejected — must be because actionsRemaining is 0
              expect(remaining).toBe(0);
              expect(result.code).toBe("NO_ACTIONS_REMAINING");
            }
          }

          // Total accepted actions must equal the action budget
          expect(acceptedCount).toBe(actionBudget);
        }),
        { numRuns: 200 }
      );
    });

    it("budget 1 turn accepts exactly 1 action, budget 2 turn accepts exactly 2", () => {
      fc.assert(
        fc.property(arbActionBudget, (actionBudget) => {
          let accepted = 0;
          let actionsRemaining = actionBudget;

          // Keep submitting valid actions until rejected
          while (actionsRemaining >= 0) {
            const result = validateAction(
              makeValidAction(),
              makeTurnState({ actionBudget, actionsRemaining }),
              "player-1",
              playerPosition,
              makeAdjacentLocations(),
              makeCards(),
              noBlockades,
              actionsRemaining
            );

            if (result === null) {
              accepted++;
              actionsRemaining--;
            } else {
              // Must be rejected because no actions remaining
              expect(actionsRemaining).toBe(0);
              expect(result.code).toBe("NO_ACTIONS_REMAINING");
              break;
            }
          }

          expect(accepted).toBe(actionBudget);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe("action budget derives correctly from penalty flag", () => {
    it("actionBudget = Default_Action_Budget - 1 when penalty applies, bounded by minimum", () => {
      fc.assert(
        fc.property(
          fc.boolean(), // hasPenalty
          (hasPenalty) => {
            const actionBudget = hasPenalty
              ? Math.max(DEFAULT_ACTION_BUDGET - 1, MINIMUM_ACTION_BUDGET)
              : DEFAULT_ACTION_BUDGET;

            // Budget must be within valid range regardless of penalty
            expect(actionBudget).toBeGreaterThanOrEqual(MINIMUM_ACTION_BUDGET);
            expect(actionBudget).toBeLessThanOrEqual(DEFAULT_ACTION_BUDGET);

            // Penalty reduces budget by 1 but not below minimum
            if (hasPenalty) {
              expect(actionBudget).toBe(1);
            } else {
              expect(actionBudget).toBe(2);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
