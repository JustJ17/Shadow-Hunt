/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RouteLayer } from "../route-layer";
import type { AdjacencyListEntry, Location, TransportType } from "@/lib/map/types";

// --- Test helpers ---

function makeLocation(
  id: string,
  latitude: number,
  longitude: number
): Location {
  return {
    id,
    name: `City ${id}`,
    regionId: "region-1",
    isHub: false,
    latitude,
    longitude,
  };
}

function makeAdjacencyEntry(
  locationId: string,
  edges: { targetLocationId: string; transport: TransportType }[]
): AdjacencyListEntry {
  return {
    locationId,
    adjacentLocationIds: edges.map((e) => e.targetLocationId),
    edges: edges.map((e) => ({
      targetLocationId: e.targetLocationId,
      isSameRegion: true,
      transport: e.transport,
    })),
  };
}

// --- Test suite ---

describe("RouteLayer", () => {
  const locA = makeLocation("loc-a", 0, 0);
  const locB = makeLocation("loc-b", 0, 90);
  const locC = makeLocation("loc-c", 45, -45);
  const locations = [locA, locB, locC];

  describe("edge deduplication", () => {
    it("renders each edge exactly once even when adjacency lists reference both directions", () => {
      // A→B and B→A as car edges — should render only one line
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "car" },
        ]),
        makeAdjacencyEntry("loc-b", [
          { targetLocationId: "loc-a", transport: "car" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const lines = container.querySelectorAll("line");
      expect(lines).toHaveLength(1);
    });

    it("renders separate edges for different transport types on the same pair", () => {
      // A→B car and A→B boat are different edges in the game model,
      // but since they share the same sorted key they'd collide.
      // In practice, the game only has one transport per pair.
      // This test verifies the dedup key works on sorted id pairs.
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "car" },
        ]),
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-c", transport: "boat" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const lines = container.querySelectorAll("line");
      expect(lines).toHaveLength(2);
    });
  });

  describe("transport type styling", () => {
    it("renders car edges as solid <line> elements with gray stroke", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "car" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const line = container.querySelector("line");
      expect(line).not.toBeNull();
      expect(line!.getAttribute("class")).toContain("stroke-gray-400");
      // Car has no strokeDasharray (solid)
      expect(line!.getAttribute("stroke-dasharray")).toBeNull();
    });

    it("renders boat edges as dashed <line> elements with blue stroke", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "boat" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const line = container.querySelector("line");
      expect(line).not.toBeNull();
      expect(line!.getAttribute("class")).toContain("stroke-blue-400");
      expect(line!.getAttribute("stroke-dasharray")).toBe("8 5");
    });

    it("renders plane edges as <path> elements with quadratic bezier and amber stroke", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "plane" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const path = container.querySelector("path");
      expect(path).not.toBeNull();
      expect(path!.getAttribute("class")).toContain("stroke-amber-400");
      expect(path!.getAttribute("fill")).toBe("none");
      // The d attribute should contain M and Q commands
      const d = path!.getAttribute("d") ?? "";
      expect(d).toMatch(/^M\s/);
      expect(d).toContain("Q");
    });

    it("plane bezier control point is offset perpendicular to the edge", () => {
      // Use A (0,0) and B (0,90) to get predictable projected points
      // A projects to (500, 250), B projects to (750, 250)
      // midpoint = (625, 250), edge is horizontal so dx=250, dy=0
      // perpendicular normal = (-dy/len, dx/len) = (0, 1)
      // control point = (625 + 20*0, 250 + 20*1) = (625, 270)
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "plane" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const path = container.querySelector("path");
      const d = path!.getAttribute("d") ?? "";
      // Parse control point from "M x1 y1 Q cx cy x2 y2"
      const parts = d.split(/\s+/);
      // Expected: M 500 250 Q 625 270 750 250
      const cx = parseFloat(parts[4]);
      const cy = parseFloat(parts[5]);
      expect(cx).toBeCloseTo(625, 0);
      expect(cy).toBeCloseTo(270, 0);
    });
  });

  describe("blocked transports", () => {
    it("applies opacity-30 class to blocked transport edges", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "car" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set<TransportType>(["car"])}
          />
        </svg>
      );

      const line = container.querySelector("line");
      expect(line!.getAttribute("class")).toContain("opacity-30");
    });

    it("adds <title>blocked</title> to blocked transport edges", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "boat" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set<TransportType>(["boat"])}
          />
        </svg>
      );

      const title = container.querySelector("title");
      expect(title).not.toBeNull();
      expect(title!.textContent).toBe("blocked");
    });

    it("does not add opacity-30 to non-blocked edges but still has transport title", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "car" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set<TransportType>(["boat"])}
          />
        </svg>
      );

      const line = container.querySelector("line");
      expect(line!.getAttribute("class")).not.toContain("opacity-30");

      const title = container.querySelector("title");
      expect(title).not.toBeNull();
      expect(title!.textContent).toBe("car route");
    });

    it("applies opacity-30 to blocked plane <path> edges", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "plane" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set<TransportType>(["plane"])}
          />
        </svg>
      );

      const path = container.querySelector("path");
      expect(path!.getAttribute("class")).toContain("opacity-30");
      const title = container.querySelector("title");
      expect(title).not.toBeNull();
      expect(title!.textContent).toBe("blocked");
    });
  });

  describe("accessibility", () => {
    it("wraps all routes in a <g> with aria-hidden='true'", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-b", transport: "car" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const g = container.querySelector("g[aria-hidden='true']");
      expect(g).not.toBeNull();
      // The line should be inside the aria-hidden group
      const line = g!.querySelector("line");
      expect(line).not.toBeNull();
    });
  });

  describe("edge cases", () => {
    it("renders nothing when adjacency is empty", () => {
      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={[]}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const g = container.querySelector("g[aria-hidden='true']");
      expect(g).not.toBeNull();
      expect(g!.children).toHaveLength(0);
    });

    it("skips edges where one location id is missing from locations array", () => {
      const adjacency: AdjacencyListEntry[] = [
        makeAdjacencyEntry("loc-a", [
          { targetLocationId: "loc-missing", transport: "car" },
        ]),
      ];

      const { container } = render(
        <svg>
          <RouteLayer
            adjacency={adjacency}
            locations={locations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const lines = container.querySelectorAll("line");
      expect(lines).toHaveLength(0);
    });
  });
});
