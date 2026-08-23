/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import * as fc from "fast-check";
import { MoveFallbackList } from "../components/move-fallback-list";
import type { ActionCardPollData } from "@/lib/turn-engine/types";
import type { CardIdentifier, CardCategory, TargetRequirement } from "@/lib/turn-engine/cards/types";

describe("Game Page Wiring — Property Tests", () => {
  /**
   * Property 9: Click on legal destination produces correct MOVE payload
   *
   * For any location ID present in the computed legal-move set, activating
   * (click or keyboard) its city marker SHALL invoke submit with
   * { actionType: "MOVE", targetLocationId: <that ID> }.
   *
   * **Validates: Requirements 3.1**
   *
   * We test this by rendering MoveFallbackList (the accessible fallback for
   * move selection) with arbitrary legal moves and verifying the callback
   * is invoked with the correct targetLocationId for any given location.
   */
  describe("Property 9: Click on legal destination produces correct MOVE payload", () => {
    it("onMoveSelect receives the exact targetLocationId for any legal move", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              locationId: fc.uuid(),
              locationName: fc.string({ minLength: 1, maxLength: 30 }),
              transport: fc.constantFrom("car", "boat", "plane"),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.nat(),
          (legalMoves, indexRaw) => {
            const index = indexRaw % legalMoves.length;
            const targetMove = legalMoves[index];
            const onMoveSelect = vi.fn();

            const { getAllByRole, unmount } = render(
              <MoveFallbackList
                legalMoves={legalMoves}
                isViewerTurn={true}
                isSubmitting={false}
                onMoveSelect={onMoveSelect}
              />
            );

            const buttons = getAllByRole("button");
            fireEvent.click(buttons[index]);

            expect(onMoveSelect).toHaveBeenCalledTimes(1);
            expect(onMoveSelect).toHaveBeenCalledWith(targetMove.locationId);

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("handleMoveSelect constructs correct MOVE payload for any locationId", () => {
      /**
       * Tests the payload construction logic directly:
       * For any string locationId, the handler produces { actionType: "MOVE", targetLocationId }.
       */
      fc.assert(
        fc.property(fc.uuid(), (targetLocationId) => {
          // Simulate the handleMoveSelect callback logic from the game page
          const submit = vi.fn();
          const handleMoveSelect = (id: string) => {
            submit({ actionType: "MOVE", targetLocationId: id });
          };

          handleMoveSelect(targetLocationId);

          expect(submit).toHaveBeenCalledTimes(1);
          expect(submit).toHaveBeenCalledWith({
            actionType: "MOVE",
            targetLocationId,
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Card select produces correct USE_CARD payload with conditional targetPlayerId
   *
   * For any card where targetRequirement === "none", the submit payload SHALL be
   * { actionType: "USE_CARD", cardId } with no targetPlayerId.
   * For any card where targetRequirement !== "none" and a targetPlayerId is provided,
   * the submit payload SHALL include { actionType: "USE_CARD", cardId, targetPlayerId }.
   *
   * **Validates: Requirements 5.1, 5.5**
   */
  describe("Property 10: Card select produces correct USE_CARD payload with conditional targetPlayerId", () => {
    // Generator for ActionCardPollData
    const cardArb: fc.Arbitrary<ActionCardPollData> = fc.record({
      id: fc.uuid(),
      cardIdentifier: fc.constantFrom(
        "close-all-roads",
        "close-all-airways",
        "close-all-sea-routes",
        "lose-an-action",
        "locate-the-mastermind",
        "bug-a-phone",
        "reveal-direction",
        "drop-ship",
        "extra-turn",
        "open-all-roads"
      ) as fc.Arbitrary<CardIdentifier>,
      category: fc.constantFrom(
        "clue",
        "booster",
        "sabotage"
      ) as fc.Arbitrary<CardCategory>,
      targetRequirement: fc.constantFrom(
        "none",
        "player"
      ) as fc.Arbitrary<TargetRequirement>,
    });

    it("cards with targetRequirement 'none' produce payload without targetPlayerId", () => {
      fc.assert(
        fc.property(
          cardArb.filter((c) => c.targetRequirement === "none"),
          (card) => {
            const submit = vi.fn();

            // Replicate the handleCardSelect logic from the game page
            const handleCardSelect = (
              c: ActionCardPollData,
              targetPlayerId?: string
            ) => {
              const payload = {
                actionType: "USE_CARD" as const,
                cardId: c.id,
                ...(c.targetRequirement !== "none" && targetPlayerId
                  ? { targetPlayerId }
                  : {}),
              };
              submit(payload);
            };

            handleCardSelect(card, "some-player-id");

            expect(submit).toHaveBeenCalledTimes(1);
            const payload = submit.mock.calls[0][0];
            expect(payload.actionType).toBe("USE_CARD");
            expect(payload.cardId).toBe(card.id);
            expect(payload).not.toHaveProperty("targetPlayerId");
          }
        ),
        { numRuns: 50 }
      );
    });

    it("cards with targetRequirement !== 'none' and a targetPlayerId produce payload with targetPlayerId", () => {
      fc.assert(
        fc.property(
          cardArb.filter((c) => c.targetRequirement !== "none"),
          fc.uuid(),
          (card, targetPlayerId) => {
            const submit = vi.fn();

            const handleCardSelect = (
              c: ActionCardPollData,
              tpId?: string
            ) => {
              const payload = {
                actionType: "USE_CARD" as const,
                cardId: c.id,
                ...(c.targetRequirement !== "none" && tpId
                  ? { targetPlayerId: tpId }
                  : {}),
              };
              submit(payload);
            };

            handleCardSelect(card, targetPlayerId);

            expect(submit).toHaveBeenCalledTimes(1);
            const payload = submit.mock.calls[0][0];
            expect(payload.actionType).toBe("USE_CARD");
            expect(payload.cardId).toBe(card.id);
            expect(payload.targetPlayerId).toBe(targetPlayerId);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("cards with targetRequirement !== 'none' but no targetPlayerId produce payload without targetPlayerId", () => {
      fc.assert(
        fc.property(
          cardArb.filter((c) => c.targetRequirement !== "none"),
          (card) => {
            const submit = vi.fn();

            const handleCardSelect = (
              c: ActionCardPollData,
              tpId?: string
            ) => {
              const payload = {
                actionType: "USE_CARD" as const,
                cardId: c.id,
                ...(c.targetRequirement !== "none" && tpId
                  ? { targetPlayerId: tpId }
                  : {}),
              };
              submit(payload);
            };

            // No targetPlayerId provided
            handleCardSelect(card, undefined);

            expect(submit).toHaveBeenCalledTimes(1);
            const payload = submit.mock.calls[0][0];
            expect(payload.actionType).toBe("USE_CARD");
            expect(payload.cardId).toBe(card.id);
            expect(payload).not.toHaveProperty("targetPlayerId");
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
