/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { EventFeedPanel } from "../event-feed-panel";
import type { GameEventData } from "@/lib/turn-engine/types";
import type {
  NameLookupFn,
  PlayerLookupFn,
} from "@/lib/game-ui/event-messages";

// --- Helpers ---

function makeEvent(overrides: Partial<GameEventData> = {}): GameEventData {
  return {
    id: crypto.randomUUID(),
    sequenceNumber: 1,
    roundNumber: 1,
    type: "player-moved",
    payload: { playerId: "player-1", toLocationId: "loc-london" },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const nameLookup: NameLookupFn = (id, _kind) => {
  const names: Record<string, string> = {
    "loc-london": "London",
    "loc-paris": "Paris",
  };
  return names[id] ?? id;
};

const playerLookup: PlayerLookupFn = (id) => {
  const names: Record<string, string> = {
    "player-1": "Alice",
    "player-2": "Bob",
  };
  return names[id] ?? "someone";
};

// --- Unit Tests ---

describe("EventFeedPanel", () => {
  describe("row count", () => {
    it("renders N event rows for N events", () => {
      const events = [
        makeEvent({ id: "e1", sequenceNumber: 1 }),
        makeEvent({ id: "e2", sequenceNumber: 2 }),
        makeEvent({ id: "e3", sequenceNumber: 3 }),
      ];

      const { container } = render(
        <EventFeedPanel
          events={events}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      // Each event row has an SVG (EventIcon)
      const svgs = container.querySelectorAll('[role="log"] svg');
      expect(svgs.length).toBe(3);
    });
  });

  describe("descending order", () => {
    it("renders events in descending sequenceNumber order", () => {
      const events = [
        makeEvent({
          id: "e1",
          sequenceNumber: 1,
          payload: { playerId: "player-1", toLocationId: "loc-london" },
        }),
        makeEvent({
          id: "e3",
          sequenceNumber: 3,
          payload: { playerId: "player-2", toLocationId: "loc-paris" },
        }),
        makeEvent({
          id: "e2",
          sequenceNumber: 2,
          payload: { playerId: "player-1", toLocationId: "loc-paris" },
        }),
      ];

      const { container } = render(
        <EventFeedPanel
          events={events}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      // Get text of event rows in rendered order
      const rows = container.querySelectorAll('[role="log"] svg');
      // The parent div of each SVG contains the event text
      const texts = Array.from(rows).map(
        (svg) => svg.closest(".flex")?.textContent ?? ""
      );

      // seqNum 3 (Bob moved to Paris), then 2 (Alice moved to Paris), then 1 (Alice moved to London)
      expect(texts[0]).toContain("Bob");
      expect(texts[0]).toContain("Paris");
      expect(texts[1]).toContain("Alice");
      expect(texts[1]).toContain("Paris");
      expect(texts[2]).toContain("Alice");
      expect(texts[2]).toContain("London");
    });
  });

  describe("round markers", () => {
    it("renders one round marker heading per distinct roundNumber", () => {
      const events = [
        makeEvent({ id: "e1", sequenceNumber: 1, roundNumber: 1 }),
        makeEvent({ id: "e2", sequenceNumber: 2, roundNumber: 1 }),
        makeEvent({ id: "e3", sequenceNumber: 3, roundNumber: 2 }),
        makeEvent({ id: "e4", sequenceNumber: 4, roundNumber: 3 }),
      ];

      render(
        <EventFeedPanel
          events={events}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      const headings = screen.getAllByRole("heading", { level: 3 });
      expect(headings.length).toBe(3);
      // Descending order: round 3 first, then 2, then 1
      expect(headings[0].textContent).toContain("3");
      expect(headings[1].textContent).toContain("2");
      expect(headings[2].textContent).toContain("1");
    });
  });

  describe("resolved names", () => {
    it("renders player and location display names (not raw ids)", () => {
      const events = [
        makeEvent({
          id: "e1",
          sequenceNumber: 1,
          payload: { playerId: "player-1", toLocationId: "loc-london" },
        }),
      ];

      render(
        <EventFeedPanel
          events={events}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      // Use getAllByText because the ARIA live region duplicates the text
      const aliceElements = screen.getAllByText(/Alice/);
      expect(aliceElements.length).toBeGreaterThanOrEqual(1);
      const londonElements = screen.getAllByText(/London/);
      expect(londonElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("unknown event type", () => {
    it("renders 'Unrecognised event' for unknown event type", () => {
      const events = [
        makeEvent({
          id: "e1",
          sequenceNumber: 1,
          type: "some-unknown-type" as GameEventData["type"],
        }),
      ];

      render(
        <EventFeedPanel
          events={events}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      // Use getAllByText because the ARIA live region duplicates the text
      const matches = screen.getAllByText(/Unrecognised event/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("empty state", () => {
    it("renders 'No events yet' when events is empty array", () => {
      render(
        <EventFeedPanel
          events={[]}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      expect(screen.getByText("No events yet")).toBeDefined();
    });

    it("renders 'No events yet' when events is undefined", () => {
      render(
        <EventFeedPanel
          events={undefined}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      expect(screen.getByText("No events yet")).toBeDefined();
    });
  });

  describe("ARIA live region", () => {
    it("contains an element with aria-live='polite'", () => {
      const events = [makeEvent({ id: "e1", sequenceNumber: 1 })];

      const { container } = render(
        <EventFeedPanel
          events={events}
          nameLookup={nameLookup}
          playerLookup={playerLookup}
        />
      );

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).not.toBeNull();
    });
  });
});

// --- Property Tests ---

describe("Property tests: EventFeedPanel", () => {
  // Arbitrary for generating valid GameEventData arrays
  const gameEventArb = (seqNum: number, roundNum: number) =>
    fc.record({
      id: fc.uuid(),
      sequenceNumber: fc.constant(seqNum),
      roundNumber: fc.constant(roundNum),
      type: fc.constant("player-moved" as const),
      payload: fc.constant({ playerId: "player-1", toLocationId: "loc-london" }),
      createdAt: fc.constant(new Date().toISOString()),
    });

  /**
   * **Validates: Requirements 8.1**
   * Property 5: Event feed row count
   * For any events array of length N, exactly N event rows render.
   */
  it("Property 5: Event feed row count — N events produce N rows", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (n) => {
          const events: GameEventData[] = Array.from({ length: n }, (_, i) => ({
            id: `evt-${i}`,
            sequenceNumber: i + 1,
            roundNumber: Math.ceil((i + 1) / 3),
            type: "player-moved" as const,
            payload: { playerId: "player-1", toLocationId: "loc-london" },
            createdAt: new Date().toISOString(),
          }));

          const { container, unmount } = render(
            <EventFeedPanel
              events={events}
              nameLookup={nameLookup}
              playerLookup={playerLookup}
            />
          );

          const svgs = container.querySelectorAll('[role="log"] svg');
          expect(svgs.length).toBe(n);

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 8.2**
   * Property 6: Event feed ordering
   * Rendered rows are in strictly descending sequenceNumber order.
   */
  it("Property 6: Event feed ordering — rows in descending sequenceNumber", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 1000 }), {
          minLength: 2,
          maxLength: 15,
        }),
        (seqNums) => {
          const events: GameEventData[] = seqNums.map((seq, i) => ({
            id: `evt-${i}`,
            sequenceNumber: seq,
            roundNumber: 1,
            type: "player-moved" as const,
            payload: {
              playerId: `player-${seq}`,
              toLocationId: "loc-london",
            },
            createdAt: new Date().toISOString(),
          }));

          const { container, unmount } = render(
            <EventFeedPanel
              events={events}
              nameLookup={(id) => id}
              playerLookup={(id) => id}
            />
          );

          // Each row contains text with the player id that encodes the seqNum
          const rows = container.querySelectorAll('[role="log"] .flex.items-start');
          const renderedTexts = Array.from(rows).map(
            (row) => row.textContent ?? ""
          );

          // Extract seqNums from rendered text (player-{seq})
          const renderedSeqs = renderedTexts.map((text) => {
            const match = text.match(/player-(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          });

          // Verify strictly descending
          for (let i = 0; i < renderedSeqs.length - 1; i++) {
            expect(renderedSeqs[i]).toBeGreaterThan(renderedSeqs[i + 1]);
          }

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 9.1**
   * Property 23: Round marker count
   * For K distinct roundNumber values, exactly K round marker headings render.
   */
  it("Property 23: Round marker count — K distinct rounds produce K markers", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (roundNumbers) => {
          const events: GameEventData[] = roundNumbers.map((round, i) => ({
            id: `evt-${i}`,
            sequenceNumber: i + 1,
            roundNumber: round,
            type: "player-moved" as const,
            payload: { playerId: "player-1", toLocationId: "loc-london" },
            createdAt: new Date().toISOString(),
          }));

          const { container, unmount } = render(
            <EventFeedPanel
              events={events}
              nameLookup={nameLookup}
              playerLookup={playerLookup}
            />
          );

          const headings = container.querySelectorAll('[role="heading"]');
          const distinctRounds = new Set(roundNumbers).size;
          expect(headings.length).toBe(distinctRounds);

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });
});
