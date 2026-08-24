/**
 * @vitest-environment jsdom
 */
/**
 * Preservation Property Tests — Interactive Behavior and Data Flow Unchanged
 *
 * These tests capture the EXISTING interactive behavior of CityMarkers,
 * RouteLayer, and PlayerTokens components BEFORE the visual redesign fix.
 * They must PASS on unfixed code and continue to pass after the fix to
 * confirm no regressions to interactive behavior.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as fc from "fast-check";
import { CityMarkers } from "../city-markers";
import { RouteLayer } from "../route-layer";
import { PlayerTokens } from "../player-tokens";
import { projectToMap } from "@/lib/map/projection";
import type { Location, Region, AdjacencyListEntry, TransportType } from "@/lib/map/types";

// --- Shared generators ---

const regionColors: Record<string, string> = {
  Europe: "fill-blue-800/30",
  Asia: "fill-amber-800/30",
  Africa: "fill-green-800/30",
  "North America": "fill-red-800/30",
  "South America": "fill-purple-800/30",
  Oceania: "fill-teal-800/30",
};

/** Generate a set of locations with unique IDs and safe names */
const locationsArb = fc
  .integer({ min: 2, max: 8 })
  .chain((count) =>
    fc.tuple(
      fc.array(fc.constantFrom("region-eu", "region-as", "region-af"), { minLength: count, maxLength: count }),
      fc.array(fc.boolean(), { minLength: count, maxLength: count }),
      fc.array(fc.double({ min: -85, max: 85, noNaN: true }), { minLength: count, maxLength: count }),
      fc.array(fc.double({ min: -180, max: 180, noNaN: true }), { minLength: count, maxLength: count }),
    )
  )
  .map(([regionIds, isHubs, lats, lons]) =>
    regionIds.map((regionId, i) => ({
      id: `loc-${i}`,
      name: `City${i}`,
      regionId,
      isHub: isHubs[i],
      latitude: lats[i],
      longitude: lons[i],
    })) as Location[]
  );

const regions: Region[] = [
  { id: "region-eu", name: "Europe", hubLocationId: "hub-eu" },
  { id: "region-as", name: "Asia", hubLocationId: "hub-as" },
  { id: "region-af", name: "Africa", hubLocationId: "hub-af" },
];

const transportArb: fc.Arbitrary<TransportType> = fc.constantFrom("car", "boat", "plane");

// --- Test suite ---

describe("Map Visual Preservation — Property Tests", () => {
  describe("CityMarkers — onMoveSelect fires correctly for clicked legal-move markers", () => {
    /**
     * Property: For any set of locations and any subset marked as legal moves,
     * clicking a highlighted marker fires onMoveSelect with the correct locationId.
     *
     * **Validates: Requirements 3.1**
     */
    it("clicking a highlighted legal-move marker fires onMoveSelect with correct locationId", () => {
      fc.assert(
        fc.property(
          locationsArb,
          fc.nat(),
          (locations, indexSeed) => {
            // Pick a random location to be a legal move
            const targetIndex = indexSeed % locations.length;
            const targetLocation = locations[targetIndex];
            const legalMoveIds = new Set([targetLocation.id]);
            const onMoveSelect = vi.fn();

            const { container, unmount } = render(
              <svg>
                <CityMarkers
                  locations={locations}
                  regions={regions}
                  regionColors={regionColors}
                  legalMoveIds={legalMoveIds}
                  isViewerTurn={true}
                  isSubmitting={false}
                  onMoveSelect={onMoveSelect}
                />
              </svg>
            );

            // Find the marker with aria-label "Move to {name}"
            const button = container.querySelector(
              `[aria-label="Move to ${targetLocation.name}"]`
            );
            expect(button).not.toBeNull();

            fireEvent.click(button!);
            expect(onMoveSelect).toHaveBeenCalledTimes(1);
            expect(onMoveSelect).toHaveBeenCalledWith(targetLocation.id);

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Keyboard activation (Enter/Space) fires onMoveSelect
     * identically to click for highlighted markers.
     *
     * **Validates: Requirements 3.1**
     */
    it("Enter/Space on a highlighted marker fires onMoveSelect identically to click", () => {
      fc.assert(
        fc.property(
          locationsArb,
          fc.nat(),
          fc.constantFrom("Enter", " "),
          (locations, indexSeed, key) => {
            const targetIndex = indexSeed % locations.length;
            const targetLocation = locations[targetIndex];
            const legalMoveIds = new Set([targetLocation.id]);
            const onMoveSelect = vi.fn();

            const { container, unmount } = render(
              <svg>
                <CityMarkers
                  locations={locations}
                  regions={regions}
                  regionColors={regionColors}
                  legalMoveIds={legalMoveIds}
                  isViewerTurn={true}
                  isSubmitting={false}
                  onMoveSelect={onMoveSelect}
                />
              </svg>
            );

            const button = container.querySelector(
              `[aria-label="Move to ${targetLocation.name}"]`
            );
            expect(button).not.toBeNull();

            fireEvent.keyDown(button!, { key });
            expect(onMoveSelect).toHaveBeenCalledTimes(1);
            expect(onMoveSelect).toHaveBeenCalledWith(targetLocation.id);

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Clicking a non-legal-move marker does NOT fire onMoveSelect.
     *
     * **Validates: Requirements 3.1**
     */
    it("clicking a non-legal marker does not fire onMoveSelect", () => {
      fc.assert(
        fc.property(
          locationsArb,
          (locations) => {
            // Make the first location legal, click the second (non-legal)
            if (locations.length < 2) return;
            const legalMoveIds = new Set([locations[0].id]);
            const onMoveSelect = vi.fn();

            const { container, unmount } = render(
              <svg>
                <CityMarkers
                  locations={locations}
                  regions={regions}
                  regionColors={regionColors}
                  legalMoveIds={legalMoveIds}
                  isViewerTurn={true}
                  isSubmitting={false}
                  onMoveSelect={onMoveSelect}
                />
              </svg>
            );

            // Click a marker that is NOT in legalMoveIds
            const nonLegalLoc = locations[1];
            const button = container.querySelector(
              `[aria-label="${nonLegalLoc.name}"]`
            );
            if (button) {
              fireEvent.click(button);
              expect(onMoveSelect).not.toHaveBeenCalled();
            }

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("CityMarkers — accessibility attributes preserved on all markers", () => {
    /**
     * Property: Every rendered city marker has role="button", aria-label,
     * aria-disabled, and tabIndex attributes regardless of legal-move state.
     *
     * **Validates: Requirements 3.1, 3.5**
     */
    it("all markers have role, aria-label, aria-disabled, and tabIndex", () => {
      fc.assert(
        fc.property(
          locationsArb,
          fc.array(fc.nat(), { minLength: 0, maxLength: 4 }),
          (locations, legalIndices) => {
            const legalMoveIds = new Set(
              legalIndices.map((i) => locations[i % locations.length].id)
            );

            const { container, unmount } = render(
              <svg>
                <CityMarkers
                  locations={locations}
                  regions={regions}
                  regionColors={regionColors}
                  legalMoveIds={legalMoveIds}
                  isViewerTurn={true}
                  isSubmitting={false}
                />
              </svg>
            );

            const buttons = container.querySelectorAll("[role='button']");
            expect(buttons).toHaveLength(locations.length);

            buttons.forEach((btn) => {
              expect(btn.getAttribute("role")).toBe("button");
              expect(btn.getAttribute("aria-label")).toBeTruthy();
              expect(btn.hasAttribute("aria-disabled")).toBe(true);
              expect(btn.hasAttribute("tabindex")).toBe(true);
            });

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Legal-move markers get aria-disabled="false" and tabIndex=0;
     * non-legal markers get aria-disabled="true" and tabIndex=-1.
     *
     * **Validates: Requirements 3.1, 3.5**
     */
    it("legal markers have aria-disabled=false/tabIndex=0, non-legal have true/-1", () => {
      fc.assert(
        fc.property(
          locationsArb,
          fc.nat(),
          (locations, seed) => {
            // Make one specific location legal
            const legalIndex = seed % locations.length;
            const legalMoveIds = new Set([locations[legalIndex].id]);

            const { container, unmount } = render(
              <svg>
                <CityMarkers
                  locations={locations}
                  regions={regions}
                  regionColors={regionColors}
                  legalMoveIds={legalMoveIds}
                  isViewerTurn={true}
                  isSubmitting={false}
                />
              </svg>
            );

            const buttons = container.querySelectorAll("[role='button']");

            buttons.forEach((btn) => {
              const ariaLabel = btn.getAttribute("aria-label") ?? "";
              const isLegal = ariaLabel.startsWith("Move to ");

              if (isLegal) {
                expect(btn.getAttribute("aria-disabled")).toBe("false");
                expect(btn.getAttribute("tabindex")).toBe("0");
              } else {
                expect(btn.getAttribute("aria-disabled")).toBe("true");
                expect(btn.getAttribute("tabindex")).toBe("-1");
              }
            });

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("RouteLayer — deduplication produces one element per unique edge pair", () => {
    /**
     * Property: For any adjacency list where edges A→B and B→A both exist,
     * the RouteLayer renders exactly one SVG element per unique pair.
     *
     * **Validates: Requirements 3.3, 3.6**
     */
    it("bidirectional edges render exactly one element per unique pair", () => {
      // Use fixed locations for predictable coordinates
      const locA: Location = { id: "loc-a", name: "A", regionId: "r1", isHub: false, latitude: 0, longitude: 0 };
      const locB: Location = { id: "loc-b", name: "B", regionId: "r1", isHub: false, latitude: 0, longitude: 90 };
      const locC: Location = { id: "loc-c", name: "C", regionId: "r1", isHub: false, latitude: 45, longitude: -45 };
      const fixedLocations = [locA, locB, locC];

      fc.assert(
        fc.property(
          // Generate random subset of edges (as pairs of indices)
          fc.array(
            fc.record({
              from: fc.constantFrom(0, 1, 2),
              to: fc.constantFrom(0, 1, 2),
              transport: transportArb,
            }),
            { minLength: 1, maxLength: 6 }
          ).filter((edges) => edges.some((e) => e.from !== e.to)),
          (edgeDefs) => {
            // Build adjacency list from edge definitions (include reverse edges)
            const adjMap = new Map<string, { targetLocationId: string; transport: TransportType }[]>();

            for (const edge of edgeDefs) {
              if (edge.from === edge.to) continue;
              const fromId = fixedLocations[edge.from].id;
              const toId = fixedLocations[edge.to].id;

              // Add forward edge
              if (!adjMap.has(fromId)) adjMap.set(fromId, []);
              adjMap.get(fromId)!.push({ targetLocationId: toId, transport: edge.transport });

              // Add reverse edge (simulating bidirectional adjacency)
              if (!adjMap.has(toId)) adjMap.set(toId, []);
              adjMap.get(toId)!.push({ targetLocationId: fromId, transport: edge.transport });
            }

            const adjacency: AdjacencyListEntry[] = Array.from(adjMap.entries()).map(
              ([locationId, edges]) => ({
                locationId,
                adjacentLocationIds: edges.map((e) => e.targetLocationId),
                edges: edges.map((e) => ({
                  targetLocationId: e.targetLocationId,
                  isSameRegion: true,
                  transport: e.transport,
                })),
              })
            );

            const { container, unmount } = render(
              <svg>
                <RouteLayer
                  adjacency={adjacency}
                  locations={fixedLocations}
                  blockedTransports={new Set()}
                />
              </svg>
            );

            // Count rendered elements (lines + paths)
            const lines = container.querySelectorAll("line");
            const paths = container.querySelectorAll("path");
            const totalRendered = lines.length + paths.length;

            // Calculate expected unique pairs using sorted-id-pair dedup
            const uniquePairs = new Set<string>();
            for (const edge of edgeDefs) {
              if (edge.from === edge.to) continue;
              const [idA, idB] = [
                fixedLocations[edge.from].id,
                fixedLocations[edge.to].id,
              ].sort();
              uniquePairs.add(`${idA}-${idB}`);
            }

            expect(totalRendered).toBe(uniquePairs.size);

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("RouteLayer — blocked transports retain opacity-30 styling", () => {
    /**
     * Property: For any transport type marked as blocked, all edges of that
     * transport type receive the opacity-30 class.
     *
     * **Validates: Requirements 3.6**
     */
    it("blocked transport edges always have opacity-30 class", () => {
      const locA: Location = { id: "loc-a", name: "A", regionId: "r1", isHub: false, latitude: 0, longitude: 0 };
      const locB: Location = { id: "loc-b", name: "B", regionId: "r1", isHub: false, latitude: 0, longitude: 90 };
      const locations = [locA, locB];

      fc.assert(
        fc.property(
          transportArb,
          (transport) => {
            const adjacency: AdjacencyListEntry[] = [
              {
                locationId: "loc-a",
                adjacentLocationIds: ["loc-b"],
                edges: [{ targetLocationId: "loc-b", isSameRegion: true, transport }],
              },
            ];

            const blockedTransports = new Set<TransportType>([transport]);

            const { container, unmount } = render(
              <svg>
                <RouteLayer
                  adjacency={adjacency}
                  locations={locations}
                  blockedTransports={blockedTransports}
                />
              </svg>
            );

            // The rendered element (line or path) should have opacity-30
            const element =
              container.querySelector("line") ?? container.querySelector("path");
            expect(element).not.toBeNull();
            expect(element!.getAttribute("class")).toContain("opacity-30");

            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Property: Non-blocked transport edges do NOT have opacity-30 class.
     *
     * **Validates: Requirements 3.6**
     */
    it("non-blocked transport edges do not have opacity-30 class", () => {
      const locA: Location = { id: "loc-a", name: "A", regionId: "r1", isHub: false, latitude: 0, longitude: 0 };
      const locB: Location = { id: "loc-b", name: "B", regionId: "r1", isHub: false, latitude: 0, longitude: 90 };
      const locations = [locA, locB];

      fc.assert(
        fc.property(
          transportArb,
          (transport) => {
            const adjacency: AdjacencyListEntry[] = [
              {
                locationId: "loc-a",
                adjacentLocationIds: ["loc-b"],
                edges: [{ targetLocationId: "loc-b", isSameRegion: true, transport }],
              },
            ];

            // Block a different transport type than the one used in the edge
            const allTransports: TransportType[] = ["car", "boat", "plane"];
            const otherTransport = allTransports.find((t) => t !== transport)!;
            const blockedTransports = new Set<TransportType>([otherTransport]);

            const { container, unmount } = render(
              <svg>
                <RouteLayer
                  adjacency={adjacency}
                  locations={locations}
                  blockedTransports={blockedTransports}
                />
              </svg>
            );

            const element =
              container.querySelector("line") ?? container.querySelector("path");
            expect(element).not.toBeNull();
            expect(element!.getAttribute("class")).not.toContain("opacity-30");

            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe("RouteLayer — bezier control points for plane routes are computed correctly", () => {
    /**
     * Property: Plane routes always render as <path> elements with a Q (quadratic bezier)
     * command whose control point is offset perpendicular to the edge by ~20 units.
     *
     * **Validates: Requirements 3.3**
     */
    it("plane routes render as path with Q command and perpendicular control point", () => {
      fc.assert(
        fc.property(
          fc.double({ min: -85, max: 85, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
          fc.double({ min: -85, max: 85, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
          (lat1, lon1, lat2, lon2) => {
            // Skip if points are too close (would produce degenerate edges)
            const p1 = projectToMap(lat1, lon1);
            const p2 = projectToMap(lat2, lon2);
            const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            if (dist < 1) return; // skip degenerate case

            const locA: Location = { id: "loc-a", name: "A", regionId: "r1", isHub: false, latitude: lat1, longitude: lon1 };
            const locB: Location = { id: "loc-b", name: "B", regionId: "r1", isHub: false, latitude: lat2, longitude: lon2 };

            const adjacency: AdjacencyListEntry[] = [
              {
                locationId: "loc-a",
                adjacentLocationIds: ["loc-b"],
                edges: [{ targetLocationId: "loc-b", isSameRegion: true, transport: "plane" as TransportType }],
              },
            ];

            const { container, unmount } = render(
              <svg>
                <RouteLayer
                  adjacency={adjacency}
                  locations={[locA, locB]}
                  blockedTransports={new Set()}
                />
              </svg>
            );

            const path = container.querySelector("path");
            expect(path).not.toBeNull();
            const d = path!.getAttribute("d") ?? "";
            expect(d).toMatch(/^M\s/);
            expect(d).toContain("Q");

            // Verify control point is ~20 units from midpoint perpendicularly
            const parts = d.split(/\s+/);
            const cx = parseFloat(parts[4]);
            const cy = parseFloat(parts[5]);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const controlDist = Math.sqrt((cx - midX) ** 2 + (cy - midY) ** 2);
            expect(controlDist).toBeCloseTo(20, 0);

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("PlayerTokens — cluster offsets follow deterministic OFFSETS array", () => {
    /**
     * Property: For any number of players (1–4) co-located at the same city,
     * their token positions follow the deterministic OFFSETS array:
     * - 1 player alone: no offset (exact projected position)
     * - 2+ players: offset by OFFSETS[turnPosition - 1]
     *
     * **Validates: Requirements 3.4**
     */
    it("co-located players use deterministic OFFSETS for positioning", () => {
      const OFFSETS = [
        { dx: 0, dy: -8 },
        { dx: 7, dy: 4 },
        { dx: -7, dy: 4 },
        { dx: 0, dy: 8 },
      ];

      const london: Location = {
        id: "loc-london",
        name: "London",
        regionId: "region-eu",
        isHub: true,
        latitude: 51.5074,
        longitude: -0.1278,
      };
      const projected = projectToMap(london.latitude, london.longitude);

      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 4 }),
          (playerCount) => {
            const players = Array.from({ length: playerCount }, (_, i) => ({
              id: `p${i + 1}`,
              displayName: `Player ${i + 1}`,
              locationId: "loc-london",
              turnPosition: i + 1,
            }));

            const { container, unmount } = render(
              <svg>
                <PlayerTokens
                  players={players}
                  viewerPlayerId="p1"
                  locations={[london]}
                />
              </svg>
            );

            const tokens = container.querySelectorAll("g.player-token");
            expect(tokens).toHaveLength(playerCount);

            for (let i = 0; i < playerCount; i++) {
              const style = tokens[i].getAttribute("style") ?? "";
              const offset = OFFSETS[i % OFFSETS.length];
              const expectedX = projected.x + offset.dx;
              const expectedY = projected.y + offset.dy;
              expect(style).toContain(
                `translate(${expectedX}px, ${expectedY}px)`
              );
            }

            unmount();
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property: A single player at a location has NO offset (exact projected position).
     *
     * **Validates: Requirements 3.4**
     */
    it("single player at a location has no cluster offset", () => {
      fc.assert(
        fc.property(
          fc.double({ min: -85, max: 85, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
          fc.integer({ min: 1, max: 4 }),
          (lat, lon, turnPosition) => {
            const loc: Location = {
              id: "loc-x",
              name: "X",
              regionId: "region-eu",
              isHub: false,
              latitude: lat,
              longitude: lon,
            };
            const projected = projectToMap(lat, lon);

            const players = [
              { id: "p1", displayName: "Alice", locationId: "loc-x", turnPosition },
            ];

            const { container, unmount } = render(
              <svg>
                <PlayerTokens
                  players={players}
                  viewerPlayerId="p1"
                  locations={[loc]}
                />
              </svg>
            );

            const token = container.querySelector("g.player-token");
            expect(token).not.toBeNull();
            const style = token!.getAttribute("style") ?? "";
            expect(style).toContain(
              `translate(${projected.x}px, ${projected.y}px)`
            );

            unmount();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("PlayerTokens — CSS transition and reduced-motion are present", () => {
    /**
     * Property: The component always renders a <style> block with
     * CSS transition and a reduced-motion media query.
     *
     * **Validates: Requirements 3.4**
     */
    it("renders CSS transition with reduced-motion override", () => {
      const loc: Location = {
        id: "loc-a",
        name: "A",
        regionId: "r1",
        isHub: false,
        latitude: 0,
        longitude: 0,
      };

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 4 }),
          (playerCount) => {
            const players = Array.from({ length: playerCount }, (_, i) => ({
              id: `p${i + 1}`,
              displayName: `Player ${i + 1}`,
              locationId: "loc-a",
              turnPosition: i + 1,
            }));

            const { container, unmount } = render(
              <svg>
                <PlayerTokens
                  players={players}
                  viewerPlayerId="p1"
                  locations={[loc]}
                />
              </svg>
            );

            const style = container.querySelector("style");
            expect(style).not.toBeNull();
            const text = style!.textContent ?? "";
            expect(text).toContain("--token-move-duration");
            expect(text).toContain("prefers-reduced-motion: reduce");
            expect(text).toContain("0ms");

            // Each token should have transform transition in inline style
            const tokens = container.querySelectorAll("g.player-token");
            tokens.forEach((token) => {
              const s = token.getAttribute("style") ?? "";
              expect(s).toContain("transition");
              expect(s).toContain("ease-out");
            });

            unmount();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe("CityMarkers — no interaction fires when isSubmitting or not viewer turn", () => {
    /**
     * Property: When isSubmitting=true or isViewerTurn=false, clicking any marker
     * (even one in legalMoveIds) does NOT fire onMoveSelect.
     *
     * **Validates: Requirements 3.1**
     */
    it("no onMoveSelect fires when isSubmitting=true", () => {
      fc.assert(
        fc.property(
          locationsArb,
          (locations) => {
            const legalMoveIds = new Set(locations.map((l) => l.id));
            const onMoveSelect = vi.fn();

            const { container, unmount } = render(
              <svg>
                <CityMarkers
                  locations={locations}
                  regions={regions}
                  regionColors={regionColors}
                  legalMoveIds={legalMoveIds}
                  isViewerTurn={true}
                  isSubmitting={true}
                  onMoveSelect={onMoveSelect}
                />
              </svg>
            );

            const buttons = container.querySelectorAll("[role='button']");
            buttons.forEach((btn) => fireEvent.click(btn));
            expect(onMoveSelect).not.toHaveBeenCalled();

            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("no onMoveSelect fires when isViewerTurn=false", () => {
      fc.assert(
        fc.property(
          locationsArb,
          (locations) => {
            const legalMoveIds = new Set(locations.map((l) => l.id));
            const onMoveSelect = vi.fn();

            const { container, unmount } = render(
              <svg>
                <CityMarkers
                  locations={locations}
                  regions={regions}
                  regionColors={regionColors}
                  legalMoveIds={legalMoveIds}
                  isViewerTurn={false}
                  isSubmitting={false}
                  onMoveSelect={onMoveSelect}
                />
              </svg>
            );

            const buttons = container.querySelectorAll("[role='button']");
            buttons.forEach((btn) => fireEvent.click(btn));
            expect(onMoveSelect).not.toHaveBeenCalled();

            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
