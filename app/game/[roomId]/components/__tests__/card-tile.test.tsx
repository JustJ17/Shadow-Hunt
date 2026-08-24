/**
 * @vitest-environment jsdom
 */
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CardTile } from "../card-tile";
import type { ActionCardPollData } from "@/lib/turn-engine/types";
import { CARD_POOL } from "@/lib/turn-engine/cards/types";
import { getCardMeta } from "@/lib/game-ui/card-metadata";

function makeCard(overrides: Partial<ActionCardPollData> = {}): ActionCardPollData {
  return {
    id: "card-1",
    cardIdentifier: "extra-turn",
    category: "booster",
    targetRequirement: "none",
    ...overrides,
  };
}

describe("CardTile", () => {
  describe("rendering", () => {
    it("renders display name and description from getCardMeta", () => {
      const card = makeCard({ cardIdentifier: "drop-ship", category: "booster" });
      const { getByText } = render(
        <CardTile card={card} disabled={false} onActivate={() => {}} />
      );

      const meta = getCardMeta("drop-ship");
      expect(getByText(meta.displayName)).toBeTruthy();
      expect(getByText(meta.description)).toBeTruthy();
    });

    it("renders a CardIcon (svg element present)", () => {
      const card = makeCard();
      const { container } = render(
        <CardTile card={card} disabled={false} onActivate={() => {}} />
      );

      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("width")).toBe("24");
      expect(svg?.getAttribute("height")).toBe("24");
    });

    it.each([
      ["sabotage", "border-red-500", "text-red-400"],
      ["clue", "border-blue-500", "text-blue-400"],
      ["booster", "border-green-500", "text-green-400"],
    ] as const)(
      "applies category '%s' border and text colour",
      (category, expectedBorder, expectedText) => {
        const card = makeCard({
          cardIdentifier: category === "sabotage" ? "close-all-roads" : category === "clue" ? "locate-the-mastermind" : "extra-turn",
          category,
        });
        const { container } = render(
          <CardTile card={card} disabled={false} onActivate={() => {}} />
        );

        const button = container.querySelector("button")!;
        expect(button.className).toContain(expectedBorder);

        const nameEl = container.querySelector("p");
        expect(nameEl?.className).toContain(expectedText);
      }
    );
  });

  describe("accessibility", () => {
    it("renders an accessible name with displayName and category", () => {
      const card = makeCard({ cardIdentifier: "bug-a-phone", category: "clue" });
      const { container } = render(
        <CardTile card={card} disabled={false} onActivate={() => {}} />
      );

      const button = container.querySelector("button")!;
      const meta = getCardMeta("bug-a-phone");
      expect(button.getAttribute("aria-label")).toBe(
        `${meta.displayName} (${meta.category})`
      );
    });

    it("sets aria-disabled='true' when disabled", () => {
      const card = makeCard();
      const { container } = render(
        <CardTile card={card} disabled={true} onActivate={() => {}} />
      );

      const button = container.querySelector("button")!;
      expect(button.getAttribute("aria-disabled")).toBe("true");
    });

    it("does not set aria-disabled when enabled", () => {
      const card = makeCard();
      const { container } = render(
        <CardTile card={card} disabled={false} onActivate={() => {}} />
      );

      const button = container.querySelector("button")!;
      expect(button.getAttribute("aria-disabled")).toBeNull();
    });

    it("remains focusable when disabled (button element, not HTML disabled)", () => {
      const card = makeCard();
      const { container } = render(
        <CardTile card={card} disabled={true} onActivate={() => {}} />
      );

      const button = container.querySelector("button")!;
      // HTML disabled attribute should NOT be set
      expect(button.hasAttribute("disabled")).toBe(false);
      // Button should be focusable
      expect(button.tabIndex).not.toBe(-1);
    });
  });

  describe("interaction", () => {
    it("calls onActivate with the card when clicked and enabled", () => {
      const card = makeCard();
      const onActivate = vi.fn();
      const { container } = render(
        <CardTile card={card} disabled={false} onActivate={onActivate} />
      );

      const button = container.querySelector("button")!;
      fireEvent.click(button);

      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(card);
    });

    it("does NOT call onActivate when clicked and disabled", () => {
      const card = makeCard();
      const onActivate = vi.fn();
      const { container } = render(
        <CardTile card={card} disabled={true} onActivate={onActivate} />
      );

      const button = container.querySelector("button")!;
      fireEvent.click(button);

      expect(onActivate).not.toHaveBeenCalled();
    });
  });

  describe("visual states", () => {
    it("applies opacity-50 and cursor-not-allowed when disabled", () => {
      const card = makeCard();
      const { container } = render(
        <CardTile card={card} disabled={true} onActivate={() => {}} />
      );

      const button = container.querySelector("button")!;
      expect(button.className).toContain("opacity-50");
      expect(button.className).toContain("cursor-not-allowed");
    });

    it("applies hover:bg-gray-600 and cursor-pointer when enabled", () => {
      const card = makeCard();
      const { container } = render(
        <CardTile card={card} disabled={false} onActivate={() => {}} />
      );

      const button = container.querySelector("button")!;
      expect(button.className).toContain("hover:bg-gray-600");
      expect(button.className).toContain("cursor-pointer");
    });
  });

  describe("all card identifiers render correctly", () => {
    it.each(CARD_POOL)("renders metadata for '%s'", (identifier) => {
      const meta = getCardMeta(identifier);
      const card = makeCard({ cardIdentifier: identifier, category: meta.category });
      const { getByText } = render(
        <CardTile card={card} disabled={false} onActivate={() => {}} />
      );

      expect(getByText(meta.displayName)).toBeTruthy();
      expect(getByText(meta.description)).toBeTruthy();
    });
  });
});
