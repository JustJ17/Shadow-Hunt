// Feature: game-panels
// Properties 8, 15, 16: Card metadata totality, bounds, and unknown fallback
// **Validates: Requirements 10.2, 10.5, 14.1**

import fc from "fast-check";
import { getCardMeta } from "@/lib/game-ui/card-metadata";
import { CARD_POOL } from "@/lib/turn-engine/cards/types";
import type { CardIdentifier } from "@/lib/turn-engine/cards/types";

const KNOWN_IDENTIFIERS: CardIdentifier[] = [...CARD_POOL];

describe("Card metadata — Property-based tests", () => {
  /**
   * Property 8: Card icon and metadata totality
   * **Validates: Requirements 10.2, 14.1**
   *
   * For any of the 10 CardIdentifier values, getCardMeta returns a displayName
   * that is not equal to the raw identifier string (i.e. it provides a curated
   * human-readable name, not a passthrough).
   */
  it("Property 8: every known CardIdentifier maps to a displayName distinct from the raw identifier", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_IDENTIFIERS),
        (identifier) => {
          const meta = getCardMeta(identifier);

          // displayName must not be the raw identifier
          expect(meta.displayName).not.toBe(identifier);

          // displayName must be non-empty
          expect(meta.displayName.length).toBeGreaterThan(0);

          // description must be non-empty
          expect(meta.description.length).toBeGreaterThan(0);

          // category must be one of the valid categories
          expect(["sabotage", "clue", "booster"]).toContain(meta.category);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15: Card metadata bounds
   * **Validates: Requirements 10.2**
   *
   * For any of the 10 known CardIdentifier values, getCardMeta returns a
   * displayName of at most 40 characters and a description of at most 120 characters.
   */
  it("Property 15: every known CardIdentifier has displayName ≤40 chars and description ≤120 chars", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_IDENTIFIERS),
        (identifier) => {
          const meta = getCardMeta(identifier);

          expect(meta.displayName.length).toBeLessThanOrEqual(40);
          expect(meta.description.length).toBeLessThanOrEqual(120);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16: Unknown card identifier fallback
   * **Validates: Requirements 10.5**
   *
   * For any string that is not one of the 10 known CardIdentifier values,
   * getCardMeta returns the raw string as displayName, "Unrecognised card"
   * as description, and "booster" as category.
   */
  it("Property 16: any unknown identifier returns raw string as displayName with fallback description and category", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 80 }).filter(
          (s) => !KNOWN_IDENTIFIERS.includes(s as CardIdentifier)
        ),
        (unknownId) => {
          const meta = getCardMeta(unknownId);

          // displayName is the raw identifier string
          expect(meta.displayName).toBe(unknownId);

          // description is the standard fallback
          expect(meta.description).toBe("Unrecognised card");

          // category defaults to booster
          expect(meta.category).toBe("booster");
        }
      ),
      { numRuns: 200 }
    );
  });
});
