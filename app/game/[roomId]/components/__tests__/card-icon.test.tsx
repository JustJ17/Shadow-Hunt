/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { CardIcon } from "../card-icon";
import { CARD_POOL } from "@/lib/turn-engine/cards/types";
import { getCardMeta } from "@/lib/game-ui/card-metadata";

const KNOWN_IDENTIFIERS = CARD_POOL;

describe("CardIcon", () => {
  describe("rendering known identifiers", () => {
    it.each(KNOWN_IDENTIFIERS)(
      "renders a distinct glyph for identifier '%s'",
      (identifier) => {
        const { container } = render(<CardIcon identifier={identifier} />);
        const svg = container.querySelector("svg");

        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("width")).toBe("24");
        expect(svg?.getAttribute("height")).toBe("24");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");

        // Should NOT render the fallback (question mark in rectangle)
        // The fallback has a <rect> at x=4, y=2, width=16, height=20
        // and a <path> with the question mark shape. Known glyphs differ.
        const fallbackRect = svg?.querySelector(
          'rect[x="4"][y="2"][width="16"][height="20"]'
        );
        const hasQuestionMarkPath = svg?.innerHTML.includes("M10 9a2 2 0 114 0");
        const isFallback = fallbackRect !== null && hasQuestionMarkPath;
        expect(isFallback).toBe(false);
      }
    );
  });

  describe("fallback glyph", () => {
    it("renders the neutral fallback for an unknown identifier", () => {
      const { container } = render(<CardIcon identifier="unknown-card" />);
      const svg = container.querySelector("svg");

      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("width")).toBe("24");
      expect(svg?.getAttribute("height")).toBe("24");

      // Should render the fallback rect (card shape) with a question mark path
      const rect = svg?.querySelector("rect");
      expect(rect).not.toBeNull();
      expect(rect?.getAttribute("x")).toBe("4");
      expect(rect?.getAttribute("y")).toBe("2");
      expect(rect?.getAttribute("width")).toBe("16");
      expect(rect?.getAttribute("height")).toBe("20");
    });

    it("renders fallback for empty string identifier", () => {
      const { container } = render(<CardIcon identifier="" />);
      const svg = container.querySelector("svg");
      const rect = svg?.querySelector("rect");
      expect(rect).not.toBeNull();
      expect(rect?.getAttribute("x")).toBe("4");
      expect(rect?.getAttribute("y")).toBe("2");
    });
  });

  describe("accessibility", () => {
    it("has aria-hidden='true' on the SVG element", () => {
      const { container } = render(<CardIcon identifier="extra-turn" />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("SVG dimensions", () => {
    it("renders at fixed 24×24 px", () => {
      const { container } = render(<CardIcon identifier="drop-ship" />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("24");
      expect(svg?.getAttribute("height")).toBe("24");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    });
  });

  describe("distinct glyphs", () => {
    it("each known identifier produces unique SVG innerHTML", () => {
      const htmlSet = new Set<string>();

      for (const identifier of KNOWN_IDENTIFIERS) {
        const { container } = render(<CardIcon identifier={identifier} />);
        const svg = container.querySelector("svg");
        const html = svg?.innerHTML ?? "";
        htmlSet.add(html);
      }

      // All 10 identifiers should produce distinct SVG content
      expect(htmlSet.size).toBe(10);
    });

    it("fallback glyph is distinct from all known identifiers", () => {
      const { container: fallbackContainer } = render(
        <CardIcon identifier="totally-unknown" />
      );
      const fallbackHtml =
        fallbackContainer.querySelector("svg")?.innerHTML ?? "";

      for (const identifier of KNOWN_IDENTIFIERS) {
        const { container } = render(<CardIcon identifier={identifier} />);
        const html = container.querySelector("svg")?.innerHTML ?? "";
        expect(html).not.toBe(fallbackHtml);
      }
    });
  });

  /**
   * Property 8: Card icon and metadata totality
   *
   * For any of the 10 CardIdentifier values, CardIcon renders an inline SVG
   * glyph distinct from the neutral fallback, and getCardMeta returns a
   * displayName that is not equal to the raw identifier string.
   *
   * **Validates: Requirements 10.2, 10.3, 14.1**
   */
  describe("Property 8: Card icon and metadata totality", () => {
    it("every known CardIdentifier renders a non-fallback glyph and getCardMeta returns a non-raw displayName", () => {
      // Get fallback glyph HTML for comparison
      const { container: fallbackContainer } = render(
        <CardIcon identifier="__fallback_probe__" />
      );
      const fallbackHtml =
        fallbackContainer.querySelector("svg")?.innerHTML ?? "";

      fc.assert(
        fc.property(
          fc.constantFrom(...KNOWN_IDENTIFIERS),
          (identifier) => {
            // CardIcon renders a glyph distinct from fallback
            const { container, unmount } = render(
              <CardIcon identifier={identifier} />
            );
            const svg = container.querySelector("svg");
            expect(svg).not.toBeNull();
            const html = svg?.innerHTML ?? "";
            expect(html).not.toBe(fallbackHtml);

            // getCardMeta returns a displayName that is not the raw identifier
            const meta = getCardMeta(identifier);
            expect(meta.displayName).not.toBe(identifier);

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });

    it("unknown identifiers render the fallback glyph and raw displayName", () => {
      // Get fallback glyph HTML for comparison
      const { container: fallbackContainer } = render(
        <CardIcon identifier="__fallback_probe__" />
      );
      const fallbackHtml =
        fallbackContainer.querySelector("svg")?.innerHTML ?? "";

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter(
            (s) => !(KNOWN_IDENTIFIERS as readonly string[]).includes(s)
          ),
          (unknownId) => {
            const { container, unmount } = render(
              <CardIcon identifier={unknownId} />
            );
            const svg = container.querySelector("svg");
            const html = svg?.innerHTML ?? "";
            expect(html).toBe(fallbackHtml);

            const meta = getCardMeta(unknownId);
            expect(meta.displayName).toBe(unknownId);
            expect(meta.description).toBe("Unrecognised card");

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
