// Feature: action-cards, Property 2: Blockade Window Totality
// **Validates: Requirements 5.1, 5.3, 5.4, 5.7**

import fc from "fast-check";
import { isWithinBlockadeWindow } from "../blockade-utils";

/**
 * Property 2: Blockade Window Totality
 *
 * For any Blockade B and for any turn T by a non-caster player P,
 * a MOVE on B's Transport_Type is rejected if and only if Turn_Ordinal(T)
 * lies strictly inside Blockade_Window(B).
 *
 * Blockade_Window is defined as:
 *   Turn_Ordinal strictly > (creationRound, casterTurnPosition)
 *   AND strictly < (creationRound + 1, casterTurnPosition)
 *
 * We verify that isWithinBlockadeWindow returns true iff the current turn
 * ordinal is strictly between creation and expiry in lexicographic order.
 */
describe("Blockade Window Totality - Property Tests", () => {
  /**
   * Helper: lexicographic comparison of turn ordinals (round, position).
   * This is an independent reference implementation for verifying correctness.
   */
  function isStrictlyInside(
    creationRound: number,
    casterTurnPosition: number,
    currentRound: number,
    currentTurnPosition: number
  ): boolean {
    // Creation ordinal: (creationRound, casterTurnPosition)
    // Expiry ordinal: (creationRound + 1, casterTurnPosition)
    // Current must be strictly after creation AND strictly before expiry

    const afterCreation =
      currentRound > creationRound ||
      (currentRound === creationRound && currentTurnPosition > casterTurnPosition);

    const beforeExpiry =
      currentRound < creationRound + 1 ||
      (currentRound === creationRound + 1 && currentTurnPosition < casterTurnPosition);

    return afterCreation && beforeExpiry;
  }

  it("isWithinBlockadeWindow returns true iff turn ordinal is strictly inside the window", () => {
    fc.assert(
      fc.property(
        // Blockade parameters: creationRound and casterTurnPosition
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 5 }),
        // Current turn parameters: currentRound and currentTurnPosition
        fc.integer({ min: 1, max: 52 }),
        fc.integer({ min: 0, max: 5 }),
        (creationRound, casterTurnPosition, currentRound, currentTurnPosition) => {
          const result = isWithinBlockadeWindow(
            creationRound,
            casterTurnPosition,
            currentRound,
            currentTurnPosition
          );

          const expected = isStrictlyInside(
            creationRound,
            casterTurnPosition,
            currentRound,
            currentTurnPosition
          );

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it("the caster's own turn (creation ordinal) is never inside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 5 }),
        (creationRound, casterTurnPosition) => {
          // The creation turn itself is NOT inside the window (strictly greater required)
          const result = isWithinBlockadeWindow(
            creationRound,
            casterTurnPosition,
            creationRound,
            casterTurnPosition
          );
          expect(result).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("the caster's next normal turn (expiry ordinal) is never inside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 5 }),
        (creationRound, casterTurnPosition) => {
          // The caster's next turn at (creationRound + 1, casterTurnPosition) is outside
          const result = isWithinBlockadeWindow(
            creationRound,
            casterTurnPosition,
            creationRound + 1,
            casterTurnPosition
          );
          expect(result).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("turns in the same round after the caster are inside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 4 }),
        // Ensure the current position is strictly after the caster in the same round
        fc.integer({ min: 1, max: 5 }),
        (creationRound, casterTurnPosition, offset) => {
          const currentTurnPosition = casterTurnPosition + offset;
          // Same round, position strictly after caster -> inside window
          const result = isWithinBlockadeWindow(
            creationRound,
            casterTurnPosition,
            creationRound,
            currentTurnPosition
          );
          expect(result).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("turns in the next round before the caster position are inside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 5 }),
        // Ensure position is strictly before the caster in the next round
        fc.integer({ min: 0, max: 4 }),
        (creationRound, casterTurnPosition, currentTurnPosition) => {
          fc.pre(currentTurnPosition < casterTurnPosition);
          // Next round, position strictly before caster -> inside window
          const result = isWithinBlockadeWindow(
            creationRound,
            casterTurnPosition,
            creationRound + 1,
            currentTurnPosition
          );
          expect(result).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("turns two or more rounds after creation are always outside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        (creationRound, casterTurnPosition, roundOffset, currentTurnPosition) => {
          const currentRound = creationRound + roundOffset;
          // Two or more rounds later -> always outside (expiry is creationRound + 1)
          const result = isWithinBlockadeWindow(
            creationRound,
            casterTurnPosition,
            currentRound,
            currentTurnPosition
          );
          expect(result).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("turns before the creation round are always outside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        (creationRound, casterTurnPosition, roundOffset, currentTurnPosition) => {
          const currentRound = creationRound - roundOffset;
          fc.pre(currentRound >= 1);
          // Before creation round -> always outside
          const result = isWithinBlockadeWindow(
            creationRound,
            casterTurnPosition,
            currentRound,
            currentTurnPosition
          );
          expect(result).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});
