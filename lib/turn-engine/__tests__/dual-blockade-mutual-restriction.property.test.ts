// Feature: action-cards
// Property 28: Dual Blockade Mutual Restriction
// **Validates: Requirements 4.6**

import fc from "fast-check";
import { computeBlockedTransports } from "@/lib/turn-engine/cards/effects/blockade-utils";
import type { TransportType } from "@/lib/map/types";

const TRANSPORT_TYPES: TransportType[] = ["car", "plane", "boat"];

describe("Dual Blockade Mutual Restriction — Property 28", () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * For any two different Players A and B who each create a Blockade for
   * the same Transport_Type with overlapping windows, Player A is blocked
   * by B's Blockade and Player B is blocked by A's Blockade (neither is
   * immune to the other's).
   *
   * We test this by constructing two active blockades from different casters
   * for the same transport type, and verifying that computeBlockedTransports
   * reports each player as blocked when evaluated from the other's perspective.
   */
  it("each caster is blocked by the other's blockade for the same transport type", () => {
    fc.assert(
      fc.property(
        fc.record({
          playerA: fc.uuid(),
          playerB: fc.uuid(),
          transportType: fc.constantFrom(...TRANSPORT_TYPES),
        }),
        ({ playerA, playerB, transportType }) => {
          // Ensure A and B are distinct players
          fc.pre(playerA !== playerB);

          // Both players have an active blockade for the same transport type
          const activeBlockades = [
            { transportType, casterPlayerId: playerA },
            { transportType, casterPlayerId: playerB },
          ];

          // Player A should be blocked by Player B's blockade
          const blockedForA = computeBlockedTransports(activeBlockades, playerA);
          expect(blockedForA.has(transportType)).toBe(true);

          // Player B should be blocked by Player A's blockade
          const blockedForB = computeBlockedTransports(activeBlockades, playerB);
          expect(blockedForB.has(transportType)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Strengthened variant: with multiple transport types blocked by both players,
   * each player is blocked on every transport type the other has cast.
   */
  it("mutual restriction holds across multiple transport types simultaneously", () => {
    fc.assert(
      fc.property(
        fc.record({
          playerA: fc.uuid(),
          playerB: fc.uuid(),
          transportTypes: fc.subarray(TRANSPORT_TYPES, { minLength: 1, maxLength: 3 }),
        }),
        ({ playerA, playerB, transportTypes }) => {
          fc.pre(playerA !== playerB);

          // Both players have active blockades for the same set of transport types
          const activeBlockades = [
            ...transportTypes.map((t) => ({ transportType: t, casterPlayerId: playerA })),
            ...transportTypes.map((t) => ({ transportType: t, casterPlayerId: playerB })),
          ];

          const blockedForA = computeBlockedTransports(activeBlockades, playerA);
          const blockedForB = computeBlockedTransports(activeBlockades, playerB);

          // Each player is blocked on every transport type the other cast
          for (const t of transportTypes) {
            expect(blockedForA.has(t)).toBe(true);
            expect(blockedForB.has(t)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Edge case variant: a third player C is blocked by both A's and B's blockades.
   * This confirms the dual blockade scenario doesn't accidentally grant immunity
   * to uninvolved players.
   */
  it("a third player is blocked by both blockades in a dual-blockade scenario", () => {
    fc.assert(
      fc.property(
        fc.record({
          playerA: fc.uuid(),
          playerB: fc.uuid(),
          playerC: fc.uuid(),
          transportType: fc.constantFrom(...TRANSPORT_TYPES),
        }),
        ({ playerA, playerB, playerC, transportType }) => {
          // Ensure all three players are distinct
          fc.pre(playerA !== playerB && playerA !== playerC && playerB !== playerC);

          const activeBlockades = [
            { transportType, casterPlayerId: playerA },
            { transportType, casterPlayerId: playerB },
          ];

          // Player C is not the caster of either blockade, so must be blocked
          const blockedForC = computeBlockedTransports(activeBlockades, playerC);
          expect(blockedForC.has(transportType)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
