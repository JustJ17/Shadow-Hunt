/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayerTokens } from "../player-tokens";
import type { Location } from "@/lib/map/types";
import { projectToMap } from "@/lib/map/projection";

// --- Test helpers ---

function makeLocation(
  id: string,
  name: string,
  regionId: string,
  isHub: boolean,
  latitude: number,
  longitude: number
): Location {
  return { id, name, regionId, isHub, latitude, longitude };
}

const london = makeLocation("loc-london", "London", "region-eu", true, 51.5074, -0.1278);
const tokyo = makeLocation("loc-tokyo", "Tokyo", "region-as", true, 35.6762, 139.6503);
const paris = makeLocation("loc-paris", "Paris", "region-eu", false, 48.8566, 2.3522);

const locations = [london, tokyo, paris];

function makePlayer(
  id: string,
  displayName: string,
  locationId: string,
  turnPosition: number
) {
  return { id, displayName, locationId, turnPosition };
}

// --- Test suite ---

describe("PlayerTokens", () => {
  describe("rendering", () => {
    it("renders one <g> per player", () => {
      const players = [
        makePlayer("p1", "Alice", "loc-london", 1),
        makePlayer("p2", "Bob", "loc-tokyo", 2),
      ];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const tokens = container.querySelectorAll("g.player-token");
      expect(tokens).toHaveLength(2);
    });

    it("renders nothing when players array is empty", () => {
      const { container } = render(
        <svg>
          <PlayerTokens
            players={[]}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const tokens = container.querySelectorAll("g.player-token");
      expect(tokens).toHaveLength(0);
    });

    it("skips players with unknown locationId", () => {
      const players = [
        makePlayer("p1", "Alice", "loc-unknown", 1),
      ];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const tokens = container.querySelectorAll("g.player-token");
      expect(tokens).toHaveLength(0);
    });
  });

  describe("positioning", () => {
    it("positions a single player at projected coordinates with no offset", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];
      const expected = projectToMap(london.latitude, london.longitude);

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      const transform = token!.getAttribute("style");
      expect(transform).toContain(`translate(${expected.x}px, ${expected.y}px)`);
    });

    it("applies cluster offset when multiple players share a location", () => {
      const players = [
        makePlayer("p1", "Alice", "loc-london", 1),
        makePlayer("p2", "Bob", "loc-london", 2),
      ];
      const base = projectToMap(london.latitude, london.longitude);

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const tokens = container.querySelectorAll("g.player-token");

      // Player 1 (turnPosition 1): offset (0, -8)
      const style1 = tokens[0].getAttribute("style");
      expect(style1).toContain(`translate(${base.x + 0}px, ${base.y + -8}px)`);

      // Player 2 (turnPosition 2): offset (7, 4)
      const style2 = tokens[1].getAttribute("style");
      expect(style2).toContain(`translate(${base.x + 7}px, ${base.y + 4}px)`);
    });

    it("uses no offset when only one player at a location", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];
      const base = projectToMap(london.latitude, london.longitude);

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      const style = token!.getAttribute("style");
      // No offset: translate at exact projected point
      expect(style).toContain(`translate(${base.x}px, ${base.y}px)`);
    });
  });

  describe("cluster offset separation", () => {
    it("ensures at least 6 user units between any two co-located tokens", () => {
      // All 4 players at the same location
      const players = [
        makePlayer("p1", "Alice", "loc-london", 1),
        makePlayer("p2", "Bob", "loc-london", 2),
        makePlayer("p3", "Carol", "loc-london", 3),
        makePlayer("p4", "Dave", "loc-london", 4),
      ];

      const OFFSETS = [
        { dx: 0, dy: -8 },
        { dx: 7, dy: 4 },
        { dx: -7, dy: 4 },
        { dx: 0, dy: 8 },
      ];

      // Check all pairs
      for (let i = 0; i < OFFSETS.length; i++) {
        for (let j = i + 1; j < OFFSETS.length; j++) {
          const dist = Math.sqrt(
            (OFFSETS[i].dx - OFFSETS[j].dx) ** 2 +
              (OFFSETS[i].dy - OFFSETS[j].dy) ** 2
          );
          expect(dist).toBeGreaterThan(6);
        }
      }
    });
  });

  describe("viewer highlight", () => {
    it("renders an outer ring for the viewer's token", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      const circles = token!.querySelectorAll("circle");
      // Should have 2 circles: outer ring + inner token
      expect(circles).toHaveLength(2);
      // Outer ring has stroke="white" and strokeWidth="3"
      expect(circles[0].getAttribute("stroke")).toBe("white");
      expect(circles[0].getAttribute("stroke-width")).toBe("3");
    });

    it("does not render an outer ring for non-viewer tokens", () => {
      const players = [makePlayer("p2", "Bob", "loc-london", 2)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      const circles = token!.querySelectorAll("circle");
      // Only the inner token circle
      expect(circles).toHaveLength(1);
    });
  });

  describe("player colors", () => {
    it("assigns distinct fill color based on turnPosition", () => {
      const players = [
        makePlayer("p1", "Alice", "loc-london", 1),
        makePlayer("p2", "Bob", "loc-tokyo", 2),
      ];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const tokens = container.querySelectorAll("g.player-token");

      // Player 1 (turnPosition 1) → fill-blue-500
      const innerCircle1 = tokens[0].querySelectorAll("circle");
      const mainCircle1 = innerCircle1[innerCircle1.length - 1];
      expect(mainCircle1.getAttribute("class")).toContain("fill-blue-500");

      // Player 2 (turnPosition 2) → fill-red-500
      const innerCircle2 = tokens[1].querySelectorAll("circle");
      const mainCircle2 = innerCircle2[innerCircle2.length - 1];
      expect(mainCircle2.getAttribute("class")).toContain("fill-red-500");
    });
  });

  describe("CSS transition", () => {
    it("applies transform transition with custom property", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      const style = token!.getAttribute("style");
      expect(style).toContain("transition");
      expect(style).toContain("var(--token-move-duration, 600ms)");
      expect(style).toContain("ease-out");
    });

    it("includes reduced motion style definition", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const style = container.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain("prefers-reduced-motion: reduce");
      expect(style!.textContent).toContain("--token-move-duration: 0ms");
    });
  });

  describe("accessibility", () => {
    it("sets aria-label with display name for non-viewer players", () => {
      const players = [makePlayer("p2", "Bob", "loc-london", 2)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      expect(token!.getAttribute("aria-label")).toBe("Bob");
    });

    it("appends (you) to aria-label for the viewer", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      expect(token!.getAttribute("aria-label")).toBe("Alice (you)");
    });
  });

  describe("zoom scaling", () => {
    it("scales token radius by 1/zoom", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
            zoom={2}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      const circles = token!.querySelectorAll("circle");
      // Inner token circle (last one): r = 6/2 = 3
      const mainCircle = circles[circles.length - 1];
      expect(mainCircle.getAttribute("r")).toBe("3");
    });

    it("scales viewer ring by 1/zoom", () => {
      const players = [makePlayer("p1", "Alice", "loc-london", 1)];

      const { container } = render(
        <svg>
          <PlayerTokens
            players={players}
            viewerPlayerId="p1"
            locations={locations}
            zoom={2}
          />
        </svg>
      );

      const token = container.querySelector("g.player-token");
      const circles = token!.querySelectorAll("circle");
      // Outer ring: r = 9/2 = 4.5, stroke-width = 3/2 = 1.5
      expect(circles[0].getAttribute("r")).toBe("4.5");
      expect(circles[0].getAttribute("stroke-width")).toBe("1.5");
    });
  });
});
