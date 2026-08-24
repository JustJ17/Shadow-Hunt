/**
 * @vitest-environment jsdom
 */

/**
 * Bug Condition Exploration Test — Map Visual Elements Are Deficient
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.7, 1.8, 1.9**
 *
 * This test is EXPECTED TO FAIL on unfixed code. Failure confirms that:
 * - Continent paths are small abstract polygons (10–15 points, not recognizable shapes)
 * - City markers have no text labels
 * - Non-hub marker radius is below minimum threshold
 * - Route stroke widths are insufficient
 * - Player token colors are muted
 *
 * When the fix is implemented, these tests will PASS.
 */
import { render } from "@testing-library/react";
import { CONTINENT_PATHS, REGION_COLORS } from "../world-map";
import { CityMarkers } from "../city-markers";
import { RouteLayer } from "../route-layer";
import { PlayerTokens } from "../player-tokens";
import type {
  Location,
  RegionWithLocations,
  AdjacencyListEntry,
  TransportType,
} from "@/lib/map/types";

// --- Helpers ---

/**
 * Count the number of coordinate points in an SVG path `d` attribute.
 * Counts M, L, C, Q, S, T, A commands (each contributes one point),
 * and Z contributes zero. Also handles implicit lineto after M.
 */
function countPathPoints(d: string): number {
  // Split on commands, filter coordinate pairs
  const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) ?? [];
  let count = 0;
  for (const cmd of commands) {
    const letter = cmd.trim()[0].toUpperCase();
    if (letter === "Z") continue;
    // Count coordinate pairs in this command segment
    const numbers = cmd
      .slice(1)
      .trim()
      .match(/-?\d+(\.\d+)?/g);
    if (!numbers) continue;
    // For M, L, T: each pair of numbers is one point
    if (["M", "L", "T"].includes(letter)) {
      count += Math.floor(numbers.length / 2);
    }
    // For H, V: each number is one point
    else if (["H", "V"].includes(letter)) {
      count += numbers.length;
    }
    // For Q, S: each 4 numbers is one endpoint (+ control point)
    else if (["Q", "S"].includes(letter)) {
      count += Math.floor(numbers.length / 4);
    }
    // For C: each 6 numbers is one endpoint (+ 2 control points)
    else if (letter === "C") {
      count += Math.floor(numbers.length / 6);
    }
    // For A: each 7 numbers is one point
    else if (letter === "A") {
      count += Math.floor(numbers.length / 7);
    }
  }
  return count;
}

/**
 * Compute the bounding box of an SVG path by extracting all coordinate values.
 * Simplified — only handles absolute M/L commands (sufficient for current paths).
 */
function pathBoundingBox(d: string): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    xs.push(numbers[i]);
    if (i + 1 < numbers.length) ys.push(numbers[i + 1]);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// --- Test fixtures ---

const mockRegions: RegionWithLocations[] = [
  {
    id: "r1",
    name: "Europe",
    hubLocationId: "london",
    locations: [
      {
        id: "london",
        name: "London",
        regionId: "r1",
        isHub: true,
        latitude: 51.5,
        longitude: -0.12,
      },
      {
        id: "paris",
        name: "Paris",
        regionId: "r1",
        isHub: false,
        latitude: 48.86,
        longitude: 2.35,
      },
      {
        id: "berlin",
        name: "Berlin",
        regionId: "r1",
        isHub: false,
        latitude: 52.52,
        longitude: 13.4,
      },
    ],
  },
];

const mockLocations: Location[] = mockRegions.flatMap((r) => r.locations);

const mockAdjacency: AdjacencyListEntry[] = [
  {
    locationId: "london",
    adjacentLocationIds: ["paris", "berlin"],
    edges: [
      { targetLocationId: "paris", isSameRegion: true, transport: "car" as TransportType },
      { targetLocationId: "berlin", isSameRegion: true, transport: "plane" as TransportType },
    ],
  },
  {
    locationId: "paris",
    adjacentLocationIds: ["london", "berlin"],
    edges: [
      { targetLocationId: "london", isSameRegion: true, transport: "car" as TransportType },
      { targetLocationId: "berlin", isSameRegion: true, transport: "boat" as TransportType },
    ],
  },
];

const mockPlayers = [
  { id: "p1", displayName: "Alice", locationId: "london", turnPosition: 1 },
  { id: "p2", displayName: "Bob", locationId: "paris", turnPosition: 2 },
];

// --- Tests ---


describe("Bug Condition Exploration: Map Visual Elements Are Deficient", () => {
  describe("Property 1.1: Continent Path Complexity", () => {
    it("each continent path should have > 40 points for recognizable shapes", () => {
      for (const continent of CONTINENT_PATHS) {
        const pointCount = countPathPoints(continent.d);
        expect(pointCount).toBeGreaterThan(40);
      }
    });
  });

  describe("Property 1.2: Continent Path Bounding Box Spans Geographic Extent", () => {
    const expectedMinDimensions: Record<string, { width: number; height: number }> = {
      Europe: { width: 120, height: 100 },
      Asia: { width: 200, height: 120 },
      Africa: { width: 100, height: 150 },
      "North America": { width: 150, height: 140 },
      "South America": { width: 80, height: 140 },
      Oceania: { width: 80, height: 60 },
    };

    it("each continent should span at least its expected proportional area of the viewBox", () => {
      for (const continent of CONTINENT_PATHS) {
        const bbox = pathBoundingBox(continent.d);
        const expected = expectedMinDimensions[continent.name];
        if (!expected) continue;

        expect(bbox.width).toBeGreaterThanOrEqual(expected.width);
        expect(bbox.height).toBeGreaterThanOrEqual(expected.height);
      }
    });
  });

  describe("Property 1.3: City Labels Are Present for Hub Cities", () => {
    it("should render <text> elements for hub city names", () => {
      const { container } = render(
        <svg viewBox="0 0 1000 500">
          <CityMarkers
            locations={mockLocations}
            regions={mockRegions}
            regionColors={REGION_COLORS}
            zoom={1}
          />
        </svg>
      );

      const textElements = container.querySelectorAll("text");
      const hubCities = mockLocations.filter((l) => l.isHub);

      expect(textElements.length).toBeGreaterThanOrEqual(hubCities.length);
    });
  });

  describe("Property 1.4: Non-Hub Marker Radius Meets Minimum", () => {
    it("non-hub markers should have r >= 5/zoom", () => {
      const zoom = 1;
      const { container } = render(
        <svg viewBox="0 0 1000 500">
          <CityMarkers
            locations={mockLocations}
            regions={mockRegions}
            regionColors={REGION_COLORS}
            zoom={zoom}
          />
        </svg>
      );

      const circles = container.querySelectorAll("circle");
      const minRadius = 5 / zoom;

      let nonHubCircleCount = 0;
      let failingCount = 0;

      for (const circle of circles) {
        const r = parseFloat(circle.getAttribute("r") ?? "0");
        if (r > 0 && r < 7 / zoom) {
          nonHubCircleCount++;
          if (r < minRadius) {
            failingCount++;
          }
        }
      }

      expect(nonHubCircleCount).toBeGreaterThan(0);
      expect(failingCount).toBe(0);
    });
  });

  describe("Property 1.5: Route Stroke Width Meets Minimum", () => {
    it("all routes should have strokeWidth >= 1.5", () => {
      const { container } = render(
        <svg viewBox="0 0 1000 500">
          <RouteLayer
            adjacency={mockAdjacency}
            locations={mockLocations}
            blockedTransports={new Set()}
          />
        </svg>
      );

      const lines = container.querySelectorAll("line");
      const paths = container.querySelectorAll("path");
      const allRouteElements = [...lines, ...paths];

      expect(allRouteElements.length).toBeGreaterThan(0);

      for (const el of allRouteElements) {
        const strokeWidth = parseFloat(
          el.getAttribute("stroke-width") ?? "0"
        );
        expect(strokeWidth).toBeGreaterThanOrEqual(1.5);
      }
    });
  });

  describe("Property 1.6: Player Token Colors Use Brighter Palette", () => {
    it("player tokens should use brighter color classes (cyan/rose/emerald/amber)", () => {
      const { container } = render(
        <svg viewBox="0 0 1000 500">
          <PlayerTokens
            players={mockPlayers}
            viewerPlayerId="p1"
            locations={mockLocations}
            zoom={1}
          />
        </svg>
      );

      const brighterColors = [
        "fill-cyan-400",
        "fill-rose-400",
        "fill-emerald-400",
        "fill-amber-300",
      ];

      const tokenCircles = container.querySelectorAll("circle[class*='fill-']");
      let hasBrighterColor = false;

      for (const circle of tokenCircles) {
        const className = circle.getAttribute("class") ?? "";
        if (brighterColors.some((c) => className.includes(c))) {
          hasBrighterColor = true;
          break;
        }
      }

      expect(hasBrighterColor).toBe(true);
    });
  });
});
