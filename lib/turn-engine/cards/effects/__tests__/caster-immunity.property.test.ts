// Feature: action-cards
// Property 1: Caster Immunity Invariant
// **Validates: Requirements 4.4, 6.3, 6.4, 6.5**

import fc from "fast-check";
import {
  computeBlockedTransports,
  isWithinBlockadeWindow,
} from "@/lib/turn-engine/cards/effects/blockade-utils";
import type { TransportType } from "@/lib/map/types";

const TRANSPORT_TYPES: TransportType[] = ["car", "plane", "boat"];

/**
 * Arbitrary that generates a turn ordinal (round, turnPosition) that falls
 * strictly within a blockade window defined by (creationRound, casterTurnPosition).
 *
 * Blockade_Window: Turn_Ordinal strictly greater than (creationRound, casterTurnPos)
 * AND strictly less than (creationRound + 1, casterTurnPos).
 *
 * Valid ordinals within the window:
 * - Same round as creation, with turnPosition > casterTurnPosition
 * - Next round (creationRound + 1), with turnPosition < casterTurnPosition
 */
function arbTurnWithinWindow(creationRound: number, casterTurnPosition: number) {
  // We need to generate either:
  // Case A: (creationRound, pos) where pos > casterTurnPosition
  // Case B: (creationRound + 1, pos) where pos < casterTurnPosition
  return fc.oneof(
    // Case A: same round, later position (only valid if caster isn't at max)
    fc
      .integer({ min: casterTurnPosition + 1, max: casterTurnPosition + 10 })
      .map((pos) => ({ round: creationRound, turnPosition: pos })),
    // Case B: next round, earlier position (only valid if casterTurnPosition > 0)
    ...(casterTurnPosition > 0
      ? [
          fc
            .integer({ min: 0, max: casterTurnPosition - 1 })
            .map((pos) => ({ round: creationRound + 1, turnPosition: pos })),
        ]
      : [])
  );
}

describe("Caster Immunity Invariant — Property 1", () => {
  /**
   * **Validates: Requirements 4.4, 6.3, 6.4, 6.5**
   *
   * For any Blockade B and for any MOVE action by B's Blockade_Caster
   * on B's Transport_Type during B's Blockade_Window, the MOVE SHALL
   * be accepted (not rejected by that Blockade).
   *
   * We verify this by checking that computeBlockedTransports never includes
   * the blockade's transport type in the blocked set when evaluated for
   * the caster player.
   */
  it("caster is never blocked by their own blockade during the blockade window", () => {
    fc.assert(
      fc.property(
        // Generate blockade parameters
        fc.record({
          transportType: fc.constantFrom(...TRANSPORT_TYPES),
          casterPlayerId: fc.uuid(),
          creationRound: fc.integer({ min: 1, max: 50 }),
          casterTurnPosition: fc.integer({ min: 0, max: 5 }),
        }),
        ({ transportType, casterPlayerId, creationRound, casterTurnPosition }) => {
          // Generate a turn ordinal within the blockade window
          const withinWindowArb = arbTurnWithinWindow(creationRound, casterTurnPosition);

          fc.assert(
            fc.property(withinWindowArb, ({ round, turnPosition }) => {
              // Confirm the generated turn is actually within the window
              const isActive = isWithinBlockadeWindow(
                creationRound,
                casterTurnPosition,
                round,
                turnPosition
              );
              expect(isActive).toBe(true);

              // Build the active blockade list with this single blockade
              const activeBlockades = [
                {
                  transportType,
                  casterPlayerId,
                },
              ];

              // Compute blocked transports for the CASTER
              const blockedForCaster = computeBlockedTransports(activeBlockades, casterPlayerId);

              // The caster MUST NOT be blocked by their own blockade
              expect(blockedForCaster.has(transportType)).toBe(false);
            }),
            { numRuns: 20 } // Inner loop — kept small since outer also iterates
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Strengthened variant: even with multiple blockades from the same caster,
   * the caster is immune to all of them.
   */
  it("caster is immune to all their own blockades simultaneously", () => {
    fc.assert(
      fc.property(
        fc.record({
          casterPlayerId: fc.uuid(),
          creationRound: fc.integer({ min: 1, max: 50 }),
          casterTurnPosition: fc.integer({ min: 0, max: 5 }),
        }),
        fc.subarray(TRANSPORT_TYPES, { minLength: 1, maxLength: 3 }),
        ({ casterPlayerId, creationRound, casterTurnPosition }, blockedTypes) => {
          // Build multiple blockades from the same caster
          const activeBlockades = blockedTypes.map((transportType) => ({
            transportType,
            casterPlayerId,
          }));

          // Compute blocked transports for the caster
          const blockedForCaster = computeBlockedTransports(activeBlockades, casterPlayerId);

          // None of the caster's own blockades should block them
          for (const transport of blockedTypes) {
            expect(blockedForCaster.has(transport)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Contrast check: a non-caster IS blocked by the same blockade.
   * This ensures the immunity is specifically for the caster, not a universal pass.
   */
  it("non-caster players ARE blocked by the blockade during the window", () => {
    fc.assert(
      fc.property(
        fc.record({
          transportType: fc.constantFrom(...TRANSPORT_TYPES),
          casterPlayerId: fc.uuid(),
          otherPlayerId: fc.uuid(),
          creationRound: fc.integer({ min: 1, max: 50 }),
          casterTurnPosition: fc.integer({ min: 0, max: 5 }),
        }),
        ({ transportType, casterPlayerId, otherPlayerId, creationRound, casterTurnPosition }) => {
          // Ensure caster and other player are different
          fc.pre(casterPlayerId !== otherPlayerId);

          const activeBlockades = [
            {
              transportType,
              casterPlayerId,
            },
          ];

          // Compute blocked transports for the OTHER player
          const blockedForOther = computeBlockedTransports(activeBlockades, otherPlayerId);

          // The other player MUST be blocked
          expect(blockedForOther.has(transportType)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
