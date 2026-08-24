/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { CardHand } from "../card-hand";
import type { CardSelection } from "../card-hand";
import type {
  ActionCardPollData,
  PlayerPollData,
  PendingRewardData,
} from "@/lib/turn-engine/types";
import type { NameLookupFn } from "@/lib/game-ui/event-messages";
import { CARD_POOL, type CardIdentifier, type CardCategory, type TargetRequirement } from "@/lib/turn-engine/cards/types";

// --- Helpers ---

function makeCard(overrides: Partial<ActionCardPollData> = {}): ActionCardPollData {
  return {
    id: "card-1",
    cardIdentifier: "extra-turn",
    category: "booster",
    targetRequirement: "none",
    ...overrides,
  };
}

function makePlayers(count: number): PlayerPollData[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `player-${i + 1}`,
    displayName: `Player ${i + 1}`,
    locationId: `loc-${i + 1}`,
    turnPosition: i + 1,
    skipNextTurn: false,
  }));
}

const defaultNameLookup: NameLookupFn = (id, _kind) => id;

// --- Unit Tests ---

describe("CardHand", () => {
  describe("tile count (Requirement 10.1)", () => {
    it("renders one CardTile per actionCards entry", () => {
      const cards = [
        makeCard({ id: "c1", cardIdentifier: "extra-turn" }),
        makeCard({ id: "c2", cardIdentifier: "drop-ship" }),
        makeCard({ id: "c3", cardIdentifier: "close-all-roads", category: "sabotage" }),
      ];
      const { container } = render(
        <CardHand
          actionCards={cards}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const buttons = container.querySelectorAll("button");
      expect(buttons).toHaveLength(3);
    });
  });

  describe("empty state (Requirement 10.6)", () => {
    it("renders 'No cards in hand' when actionCards is empty", () => {
      render(
        <CardHand
          actionCards={[]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      expect(screen.getByText("No cards in hand")).toBeTruthy();
    });

    it("renders 'No cards in hand' when actionCards is undefined", () => {
      render(
        <CardHand
          actionCards={undefined}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      expect(screen.getByText("No cards in hand")).toBeTruthy();
    });
  });

  describe("pending reward notice (Requirement 10.7)", () => {
    it("renders region name and tier text when pendingReward is present", () => {
      const reward: PendingRewardData = {
        regionId: "region-europe",
        captureOrder: 1,
        rewardTier: 2,
      };
      const nameLookup: NameLookupFn = (id, _kind) =>
        id === "region-europe" ? "Europe" : id;

      render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={reward}
          nameLookup={nameLookup}
        />,
      );

      expect(screen.getByText(/2 card\(s\) incoming/)).toBeTruthy();
      expect(screen.getByText(/Europe/)).toBeTruthy();
    });
  });

  describe("disabled states (Requirements 11.1–11.4)", () => {
    it("disables cards when isViewerTurn is false", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={false}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const button = container.querySelector("button")!;
      expect(button.getAttribute("aria-disabled")).toBe("true");
    });

    it("disables cards when actionsRemaining is 0", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={true}
          actionsRemaining={0}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const button = container.querySelector("button")!;
      expect(button.getAttribute("aria-disabled")).toBe("true");
    });

    it("disables cards when isSubmitting is true", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={true}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const button = container.querySelector("button")!;
      expect(button.getAttribute("aria-disabled")).toBe("true");
    });

    it("enables cards when isViewerTurn && actionsRemaining > 0 && !isSubmitting", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const button = container.querySelector("button")!;
      expect(button.getAttribute("aria-disabled")).toBeNull();
    });
  });

  describe("no-target card interaction (Requirement 11.6)", () => {
    it("calls onCardSelect immediately with correct payload for no-target card", () => {
      const onCardSelect = vi.fn();
      const card = makeCard({
        id: "card-abc",
        cardIdentifier: "extra-turn",
        targetRequirement: "none",
      });

      const { container } = render(
        <CardHand
          actionCards={[card]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={onCardSelect}
          players={makePlayers(3)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const button = container.querySelector("button")!;
      fireEvent.click(button);

      expect(onCardSelect).toHaveBeenCalledTimes(1);
      expect(onCardSelect).toHaveBeenCalledWith({
        cardId: "card-abc",
        cardIdentifier: "extra-turn",
        targetRequirement: "none",
      });
    });
  });

  describe("player-target card shows TargetPicker (Requirement 11.7)", () => {
    it("renders TargetPicker when a player-target card is clicked", () => {
      const card = makeCard({
        id: "card-xyz",
        cardIdentifier: "bug-a-phone",
        category: "clue",
        targetRequirement: "player",
      });

      const { container } = render(
        <CardHand
          actionCards={[card]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(3)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const button = container.querySelector("button")!;
      fireEvent.click(button);

      // TargetPicker renders a listbox
      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
    });

    it("does NOT call onCardSelect until a target is chosen", () => {
      const onCardSelect = vi.fn();
      const card = makeCard({
        id: "card-xyz",
        cardIdentifier: "lose-an-action",
        category: "sabotage",
        targetRequirement: "player",
      });

      const { container } = render(
        <CardHand
          actionCards={[card]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={onCardSelect}
          players={makePlayers(3)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const button = container.querySelector("button")!;
      fireEvent.click(button);

      // onCardSelect not called yet — picker is showing
      expect(onCardSelect).not.toHaveBeenCalled();
    });
  });

  describe("target selection callback (Requirement 12.4)", () => {
    it("calls onCardSelect with targetPlayerId when a target is selected", () => {
      const onCardSelect = vi.fn();
      const card = makeCard({
        id: "card-xyz",
        cardIdentifier: "bug-a-phone",
        category: "clue",
        targetRequirement: "player",
      });

      const { container, getByText } = render(
        <CardHand
          actionCards={[card]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={onCardSelect}
          players={makePlayers(3)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      // Click the card to open picker
      const button = container.querySelector("button")!;
      fireEvent.click(button);

      // Click a target option
      fireEvent.click(getByText("Player 2"));

      expect(onCardSelect).toHaveBeenCalledTimes(1);
      expect(onCardSelect).toHaveBeenCalledWith({
        cardId: "card-xyz",
        cardIdentifier: "bug-a-phone",
        targetRequirement: "player",
        targetPlayerId: "player-2",
      });
    });
  });

  describe("cancelling TargetPicker (Requirement 12.5)", () => {
    it("does not invoke onCardSelect and dismisses picker on cancel", () => {
      const onCardSelect = vi.fn();
      const card = makeCard({
        id: "card-xyz",
        cardIdentifier: "bug-a-phone",
        category: "clue",
        targetRequirement: "player",
      });

      const { container, getByText } = render(
        <CardHand
          actionCards={[card]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={onCardSelect}
          players={makePlayers(3)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      // Click the card to open picker
      const button = container.querySelector("button")!;
      fireEvent.click(button);

      // Click cancel
      fireEvent.click(getByText("Cancel"));

      // No callback invoked
      expect(onCardSelect).not.toHaveBeenCalled();
      // Picker is dismissed (no listbox)
      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).toBeNull();
    });
  });

  describe("screen reader disabled reason (Requirement 15.7)", () => {
    it("renders sr-only text for 'not your turn' reason", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={false}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const srOnly = container.querySelector(".sr-only");
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toContain("not your turn");
    });

    it("renders sr-only text for 'no actions remaining' reason", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={true}
          actionsRemaining={0}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const srOnly = container.querySelector(".sr-only");
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toContain("no actions remaining");
    });

    it("renders sr-only text for 'submission in progress' reason", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={true}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const srOnly = container.querySelector(".sr-only");
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toContain("submission in progress");
    });

    it("does NOT render sr-only disabled message when cards are enabled", () => {
      const { container } = render(
        <CardHand
          actionCards={[makeCard()]}
          isViewerTurn={true}
          actionsRemaining={2}
          isSubmitting={false}
          onCardSelect={() => {}}
          players={makePlayers(2)}
          viewerPlayerId="player-1"
          pendingReward={null}
          nameLookup={defaultNameLookup}
        />,
      );

      const srOnly = container.querySelector(".sr-only");
      expect(srOnly).toBeNull();
    });
  });
});

// --- Property-Based Tests ---

describe("CardHand — Property Tests", () => {
  // --- Arbitraries ---

  const arbCardIdentifier = fc.constantFrom(...CARD_POOL);
  const arbCategory: fc.Arbitrary<CardCategory> = fc.constantFrom("sabotage", "clue", "booster");
  const arbTargetReq: fc.Arbitrary<TargetRequirement> = fc.constantFrom("none", "player");

  const arbCard: fc.Arbitrary<ActionCardPollData> = fc.record({
    id: fc.uuid(),
    cardIdentifier: arbCardIdentifier,
    category: arbCategory,
    targetRequirement: arbTargetReq,
  });

  const arbNoTargetCard: fc.Arbitrary<ActionCardPollData> = fc.record({
    id: fc.uuid(),
    cardIdentifier: arbCardIdentifier,
    category: arbCategory,
    targetRequirement: fc.constant("none" as const),
  });

  const arbPlayerTargetCard: fc.Arbitrary<ActionCardPollData> = fc.record({
    id: fc.uuid(),
    cardIdentifier: fc.constantFrom("bug-a-phone" as CardIdentifier, "lose-an-action" as CardIdentifier),
    category: arbCategory,
    targetRequirement: fc.constant("player" as const),
  });

  const arbPlayers = (min: number, max: number): fc.Arbitrary<PlayerPollData[]> =>
    fc.integer({ min, max }).chain((count) =>
      fc.constant(makePlayers(count)),
    );

  /**
   * Property 9: Card disabled state correctness
   *
   * For any GamePollState and any ActionCardPollData entry, the Card_Tile
   * is disabled if and only if currentPlayerId !== viewerPlayerId OR
   * actionsRemaining === 0 OR an action submission is in flight.
   *
   * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
   */
  describe("Property 9: Card disabled state correctness", () => {
    it("card is disabled iff !isViewerTurn || actionsRemaining === 0 || isSubmitting", () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isViewerTurn
          fc.integer({ min: 0, max: 5 }), // actionsRemaining
          fc.boolean(), // isSubmitting
          fc.array(arbCard, { minLength: 1, maxLength: 5 }),
          (isViewerTurn, actionsRemaining, isSubmitting, cards) => {
            const { container } = render(
              <CardHand
                actionCards={cards}
                isViewerTurn={isViewerTurn}
                actionsRemaining={actionsRemaining}
                isSubmitting={isSubmitting}
                onCardSelect={() => {}}
                players={makePlayers(2)}
                viewerPlayerId="player-1"
                pendingReward={null}
                nameLookup={defaultNameLookup}
              />,
            );

            const buttons = container.querySelectorAll("button");
            const shouldBeDisabled = !isViewerTurn || actionsRemaining === 0 || isSubmitting;

            buttons.forEach((button) => {
              if (shouldBeDisabled) {
                expect(button.getAttribute("aria-disabled")).toBe("true");
              } else {
                expect(button.getAttribute("aria-disabled")).toBeNull();
              }
            });

            // Cleanup for next iteration
            container.remove();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 10: Target picker exclusion
   *
   * For any GamePollState and any card with targetRequirement "player",
   * the Target_Picker options are exactly the players whose playerId
   * differs from viewerPlayerId.
   *
   * **Validates: Requirements 12.1, 12.3**
   */
  describe("Property 10: Target picker exclusion", () => {
    it("target picker options count = players.length - 1 (viewer excluded)", () => {
      fc.assert(
        fc.property(
          arbPlayerTargetCard,
          fc.integer({ min: 2, max: 4 }),
          fc.integer({ min: 1, max: 4 }), // viewer index (1-based)
          (card, playerCount, viewerIdx) => {
            const actualViewerIdx = ((viewerIdx - 1) % playerCount) + 1;
            const viewerPlayerId = `player-${actualViewerIdx}`;
            const players = makePlayers(playerCount);

            const { container } = render(
              <CardHand
                actionCards={[card]}
                isViewerTurn={true}
                actionsRemaining={2}
                isSubmitting={false}
                onCardSelect={() => {}}
                players={players}
                viewerPlayerId={viewerPlayerId}
                pendingReward={null}
                nameLookup={defaultNameLookup}
              />,
            );

            // Click the card to open picker
            const button = container.querySelector("button")!;
            fireEvent.click(button);

            const options = container.querySelectorAll('[role="option"]');
            expect(options.length).toBe(playerCount - 1);

            // Verify viewer is not in the options
            const optionTexts = Array.from(options).map((o) => o.textContent);
            const viewerName = players.find((p) => p.playerId === viewerPlayerId)?.displayName;
            expect(optionTexts).not.toContain(viewerName);

            // Cleanup for next iteration
            container.remove();
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  /**
   * Property 22: Card hand tile count
   *
   * For any privateData.actionCards array of length N, the Card_Hand
   * renders exactly N Card_Tile elements.
   *
   * **Validates: Requirements 10.1**
   */
  describe("Property 22: Card hand tile count", () => {
    it("renders exactly N card tiles for N cards", () => {
      fc.assert(
        fc.property(
          fc.array(arbCard, { minLength: 0, maxLength: 8 }),
          (cards) => {
            const { container } = render(
              <CardHand
                actionCards={cards}
                isViewerTurn={true}
                actionsRemaining={2}
                isSubmitting={false}
                onCardSelect={() => {}}
                players={makePlayers(2)}
                viewerPlayerId="player-1"
                pendingReward={null}
                nameLookup={defaultNameLookup}
              />,
            );

            if (cards.length === 0) {
              expect(container.querySelectorAll("button")).toHaveLength(0);
            } else {
              const buttons = container.querySelectorAll("button");
              expect(buttons.length).toBe(cards.length);
            }

            // Cleanup for next iteration
            container.remove();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 24: No-target card immediate callback
   *
   * For any enabled Card_Tile whose targetRequirement is "none",
   * activating it invokes the Selection_Callback exactly once with
   * { cardId, cardIdentifier, targetRequirement: "none" } and does
   * not render the Target_Picker.
   *
   * **Validates: Requirements 11.6**
   */
  describe("Property 24: No-target card immediate callback", () => {
    it("no-target card click invokes onCardSelect once without showing picker", () => {
      fc.assert(
        fc.property(
          arbNoTargetCard,
          (card) => {
            const onCardSelect = vi.fn();

            const { container } = render(
              <CardHand
                actionCards={[card]}
                isViewerTurn={true}
                actionsRemaining={2}
                isSubmitting={false}
                onCardSelect={onCardSelect}
                players={makePlayers(3)}
                viewerPlayerId="player-1"
                pendingReward={null}
                nameLookup={defaultNameLookup}
              />,
            );

            const button = container.querySelector("button")!;
            fireEvent.click(button);

            // Callback invoked exactly once
            expect(onCardSelect).toHaveBeenCalledTimes(1);
            expect(onCardSelect).toHaveBeenCalledWith({
              cardId: card.id,
              cardIdentifier: card.cardIdentifier,
              targetRequirement: "none",
            });

            // No picker rendered
            const listbox = container.querySelector('[role="listbox"]');
            expect(listbox).toBeNull();

            // Cleanup for next iteration
            container.remove();
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  /**
   * Property 25: Target selection callback
   *
   * For any player option in the Target_Picker, activating it invokes
   * the Selection_Callback exactly once with { cardId, cardIdentifier,
   * targetRequirement: "player", targetPlayerId } matching the chosen
   * player's id.
   *
   * **Validates: Requirements 12.4**
   */
  describe("Property 25: Target selection callback", () => {
    it("selecting a target invokes onCardSelect once with correct payload", () => {
      fc.assert(
        fc.property(
          arbPlayerTargetCard,
          fc.integer({ min: 2, max: 4 }), // player count
          (card, playerCount) => {
            const onCardSelect = vi.fn();
            const players = makePlayers(playerCount);
            const viewerPlayerId = "player-1";

            // Choose a non-viewer target (always pick the second player)
            const targetPlayer = players.find((p) => p.playerId !== viewerPlayerId)!;

            const { container, getByText } = render(
              <CardHand
                actionCards={[card]}
                isViewerTurn={true}
                actionsRemaining={2}
                isSubmitting={false}
                onCardSelect={onCardSelect}
                players={players}
                viewerPlayerId={viewerPlayerId}
                pendingReward={null}
                nameLookup={defaultNameLookup}
              />,
            );

            // Click the card to open the picker
            const button = container.querySelector("button")!;
            fireEvent.click(button);

            // Click the target player option
            fireEvent.click(getByText(targetPlayer.displayName));

            expect(onCardSelect).toHaveBeenCalledTimes(1);
            expect(onCardSelect).toHaveBeenCalledWith({
              cardId: card.id,
              cardIdentifier: card.cardIdentifier,
              targetRequirement: "player",
              targetPlayerId: targetPlayer.playerId,
            });

            // Cleanup for next iteration
            container.remove();
          },
        ),
        { numRuns: 30 },
      );
    });
  });
});
