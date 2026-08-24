/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EventIcon } from "../event-icon";

const KNOWN_TYPES = [
  "game-won",
  "game-draw",
  "capture-failed",
  "spy-captured-reward-collected",
  "player-moved",
  "card-used",
  "player-skipped",
  "turn-skipped",
  "blockade-activated",
  "blockade-lifted",
  "action-penalty-applied",
  "player-relocated",
  "extra-turn-started",
] as const;

describe("EventIcon", () => {
  describe("rendering known types", () => {
    it.each(KNOWN_TYPES)(
      "renders a distinct glyph for type '%s'",
      (type) => {
        const { container } = render(<EventIcon type={type} />);
        const svg = container.querySelector("svg");

        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("width")).toBe("16");
        expect(svg?.getAttribute("height")).toBe("16");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");

        // Should NOT render the fallback circle
        const circles = svg?.querySelectorAll("circle");
        const hasOnlyFallbackCircle =
          circles?.length === 1 &&
          circles[0].getAttribute("cx") === "8" &&
          circles[0].getAttribute("cy") === "8" &&
          circles[0].getAttribute("r") === "5";
        // Some glyphs use circles as part of their design (turn-skipped, extra-turn-started)
        // but they won't match the exact fallback pattern (cx=8, cy=8, r=5 with no other elements)
        const isJustFallback =
          hasOnlyFallbackCircle && svg?.children.length === 1;
        expect(isJustFallback).toBe(false);
      }
    );
  });

  describe("fallback glyph", () => {
    it("renders the neutral circle fallback for an unknown type", () => {
      const { container } = render(<EventIcon type="unknown-type" />);
      const svg = container.querySelector("svg");

      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("width")).toBe("16");
      expect(svg?.getAttribute("height")).toBe("16");

      // Should render a single circle with cx=8, cy=8, r=5
      const circle = svg?.querySelector("circle");
      expect(circle).not.toBeNull();
      expect(circle?.getAttribute("cx")).toBe("8");
      expect(circle?.getAttribute("cy")).toBe("8");
      expect(circle?.getAttribute("r")).toBe("5");
    });

    it("renders fallback for empty string type", () => {
      const { container } = render(<EventIcon type="" />);
      const svg = container.querySelector("svg");
      const circle = svg?.querySelector("circle");
      expect(circle).not.toBeNull();
      expect(circle?.getAttribute("r")).toBe("5");
    });
  });

  describe("accessibility", () => {
    it("has aria-hidden='true' on the SVG element", () => {
      const { container } = render(<EventIcon type="game-won" />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("SVG dimensions", () => {
    it("renders at fixed 16×16 px", () => {
      const { container } = render(<EventIcon type="player-moved" />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("16");
      expect(svg?.getAttribute("height")).toBe("16");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 16 16");
    });
  });

  describe("distinct glyphs", () => {
    it("each known type produces unique SVG innerHTML", () => {
      const htmlSet = new Set<string>();

      for (const type of KNOWN_TYPES) {
        const { container } = render(<EventIcon type={type} />);
        const svg = container.querySelector("svg");
        const html = svg?.innerHTML ?? "";
        htmlSet.add(html);
      }

      // All 13 types should produce distinct SVG content
      expect(htmlSet.size).toBe(13);
    });

    it("fallback glyph is distinct from all known types", () => {
      const { container: fallbackContainer } = render(
        <EventIcon type="totally-unknown" />
      );
      const fallbackHtml =
        fallbackContainer.querySelector("svg")?.innerHTML ?? "";

      for (const type of KNOWN_TYPES) {
        const { container } = render(<EventIcon type={type} />);
        const html = container.querySelector("svg")?.innerHTML ?? "";
        expect(html).not.toBe(fallbackHtml);
      }
    });
  });
});


/**
 * Property 7: Event icon totality
 *
 * For any of the 13 GameEventType values, EventIcon renders an inline SVG
 * glyph that is distinct from the neutral fallback glyph.
 *
 * **Validates: Requirements 8.3, 13.1**
 */
import * as fc from "fast-check";

describe("Property 7: Event icon totality", () => {
  it("every known GameEventType renders a non-fallback glyph", () => {
    // Get fallback glyph HTML for comparison
    const { container: fallbackContainer } = render(
      <EventIcon type="__fallback_probe__" />
    );
    const fallbackHtml =
      fallbackContainer.querySelector("svg")?.innerHTML ?? "";

    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_TYPES),
        (type) => {
          const { container, unmount } = render(<EventIcon type={type} />);
          const svg = container.querySelector("svg");
          expect(svg).not.toBeNull();
          expect(svg?.getAttribute("width")).toBe("16");
          expect(svg?.getAttribute("height")).toBe("16");
          expect(svg?.getAttribute("aria-hidden")).toBe("true");

          const html = svg?.innerHTML ?? "";
          expect(html).not.toBe(fallbackHtml);

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });

  it("unknown event types render the fallback glyph", () => {
    const knownSet = new Set<string>(KNOWN_TYPES);

    // Get fallback glyph HTML for comparison
    const { container: fallbackContainer } = render(
      <EventIcon type="__fallback_probe__" />
    );
    const fallbackHtml =
      fallbackContainer.querySelector("svg")?.innerHTML ?? "";

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (s) => !knownSet.has(s)
        ),
        (unknownType) => {
          const { container, unmount } = render(
            <EventIcon type={unknownType} />
          );
          const svg = container.querySelector("svg");
          const html = svg?.innerHTML ?? "";
          expect(html).toBe(fallbackHtml);

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });
});
