import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeLegalMoves } from "@/lib/game-ui/legal-moves";
import type { AdjacencyListEntry, TransportType } from "@/lib/map/types";

// --- Helpers ---

function makeEdge(
  targetLocationId: string,
  transport: TransportType,
  isSameRegion = true,
): AdjacencyListEntry["edges"][number] {
  return { targetLocationId, isSameRegion, transport };
}

function makeEntry(
  locationId: string,
  edges: AdjacencyListEntry["edges"],
): AdjacencyListEntry {
  return {
    locationId,
    adjacentLocationIds: edges.map((e) => e.targetLocationId),
    edges,
  };
}

// --- Unit Tests ---

describe("computeLegalMoves", () => {
  it("returns all edges when nothing is blocked and all edges are car/boat", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("london", [
        makeEdge("paris", "car"),
        makeEdge("berlin", "car"),
        makeEdge("dublin", "boat"),
      ]),
    ];

    const result = computeLegalMoves(
      "london",
      adjacency,
      new Set(),
      new Set(["london"]),
    );

    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ locationId: "paris", transport: "car" });
    expect(result).toContainEqual({ locationId: "berlin", transport: "car" });
    expect(result).toContainEqual({ locationId: "dublin", transport: "boat" });
  });

  it("returns empty array when viewerLocationId is not found in adjacency", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("london", [makeEdge("paris", "car")]),
    ];

    const result = computeLegalMoves(
      "unknown-city",
      adjacency,
      new Set(),
      new Set(),
    );

    expect(result).toEqual([]);
  });

  it("filters out edges with blocked transport", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("london", [
        makeEdge("paris", "car"),
        makeEdge("dublin", "boat"),
        makeEdge("new-york", "plane"),
      ]),
    ];

    const result = computeLegalMoves(
      "london",
      adjacency,
      new Set<TransportType>(["boat"]),
      new Set(["london", "new-york"]),
    );

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ locationId: "paris", transport: "car" });
    expect(result).toContainEqual({
      locationId: "new-york",
      transport: "plane",
    });
    expect(result).not.toContainEqual({
      locationId: "dublin",
      transport: "boat",
    });
  });

  it("filters out plane edges when neither origin nor target is a hub", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("small-town", [
        makeEdge("another-small-town", "plane"),
        makeEdge("nearby", "car"),
      ]),
    ];

    const result = computeLegalMoves(
      "small-town",
      adjacency,
      new Set(),
      new Set(["london", "tokyo"]), // neither small-town nor another-small-town is a hub
    );

    expect(result).toHaveLength(1);
    expect(result).toContainEqual({ locationId: "nearby", transport: "car" });
  });

  it("allows plane edges when origin is a hub", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("london", [makeEdge("non-hub-city", "plane")]),
    ];

    const result = computeLegalMoves(
      "london",
      adjacency,
      new Set(),
      new Set(["london"]), // origin is a hub
    );

    expect(result).toHaveLength(1);
    expect(result).toContainEqual({
      locationId: "non-hub-city",
      transport: "plane",
    });
  });

  it("allows plane edges when target is a hub", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("non-hub-city", [makeEdge("tokyo", "plane")]),
    ];

    const result = computeLegalMoves(
      "non-hub-city",
      adjacency,
      new Set(),
      new Set(["tokyo"]), // target is a hub
    );

    expect(result).toHaveLength(1);
    expect(result).toContainEqual({
      locationId: "tokyo",
      transport: "plane",
    });
  });

  it("filters plane edges blocked by transport even if hub rule passes", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("london", [makeEdge("tokyo", "plane")]),
    ];

    const result = computeLegalMoves(
      "london",
      adjacency,
      new Set<TransportType>(["plane"]),
      new Set(["london", "tokyo"]),
    );

    expect(result).toEqual([]);
  });

  it("returns empty array when all transports are blocked", () => {
    const adjacency: AdjacencyListEntry[] = [
      makeEntry("london", [
        makeEdge("paris", "car"),
        makeEdge("dublin", "boat"),
        makeEdge("tokyo", "plane"),
      ]),
    ];

    const result = computeLegalMoves(
      "london",
      adjacency,
      new Set<TransportType>(["car", "boat", "plane"]),
      new Set(["london", "tokyo"]),
    );

    expect(result).toEqual([]);
  });

  // --- Property-Based Tests ---

  /**
   * **Validates: Requirements 3.6**
   * Property 8: Blockade exclusion from legal moves
   *
   * For any adjacency edge where edge.transport is in the active blockedTransports set,
   * computeLegalMoves SHALL exclude edge.targetLocationId from its result.
   */
  it("property: no result has a transport that is in blockedTransports", () => {
    const transportArb = fc.constantFrom<TransportType>("plane", "car", "boat");

    const edgeArb = fc.record({
      targetLocationId: fc.string({ minLength: 1, maxLength: 10 }),
      isSameRegion: fc.boolean(),
      transport: transportArb,
    });

    const adjacencyEntryArb = fc.record({
      locationId: fc.string({ minLength: 1, maxLength: 10 }),
      edges: fc.array(edgeArb, { minLength: 0, maxLength: 10 }),
    }).map((entry) => ({
      ...entry,
      adjacentLocationIds: entry.edges.map((e) => e.targetLocationId),
    }));

    const blockedSetArb = fc
      .subarray(["plane", "car", "boat"] as TransportType[])
      .map((arr) => new Set(arr));

    const hubSetArb = fc
      .array(fc.string({ minLength: 1, maxLength: 10 }), {
        minLength: 0,
        maxLength: 5,
      })
      .map((arr) => new Set(arr));

    fc.assert(
      fc.property(
        adjacencyEntryArb,
        blockedSetArb,
        hubSetArb,
        (entry, blocked, hubs) => {
          const result = computeLegalMoves(
            entry.locationId,
            [entry],
            blocked,
            hubs,
          );

          for (const move of result) {
            expect(blocked.has(move.transport)).toBe(false);
          }
        },
      ),
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   * Property 7: Legal-move highlighting matches computed legal set
   *
   * For any viewer location, adjacency graph, set of blocked transports, and
   * hub-location set, every result is a subset of the entry's edges (no
   * spurious results).
   */
  it("property: every result locationId is present in the original edges", () => {
    const transportArb = fc.constantFrom<TransportType>("plane", "car", "boat");

    const edgeArb = fc.record({
      targetLocationId: fc.string({ minLength: 1, maxLength: 10 }),
      isSameRegion: fc.boolean(),
      transport: transportArb,
    });

    const adjacencyEntryArb = fc.record({
      locationId: fc.string({ minLength: 1, maxLength: 10 }),
      edges: fc.array(edgeArb, { minLength: 0, maxLength: 10 }),
    }).map((entry) => ({
      ...entry,
      adjacentLocationIds: entry.edges.map((e) => e.targetLocationId),
    }));

    const blockedSetArb = fc
      .subarray(["plane", "car", "boat"] as TransportType[])
      .map((arr) => new Set(arr));

    const hubSetArb = fc
      .array(fc.string({ minLength: 1, maxLength: 10 }), {
        minLength: 0,
        maxLength: 5,
      })
      .map((arr) => new Set(arr));

    fc.assert(
      fc.property(
        adjacencyEntryArb,
        blockedSetArb,
        hubSetArb,
        (entry, blocked, hubs) => {
          const result = computeLegalMoves(
            entry.locationId,
            [entry],
            blocked,
            hubs,
          );

          const edgeTargets = new Set(
            entry.edges.map((e) => e.targetLocationId),
          );
          for (const move of result) {
            expect(edgeTargets.has(move.locationId)).toBe(true);
          }
        },
      ),
    );
  });

  /**
   * **Validates: Requirements 3.6**
   * Property 8 (plane-specific): plane edges excluded when neither endpoint is a hub
   *
   * For any plane edge where neither viewerLocationId nor targetLocationId is in
   * hubLocationIds, that edge SHALL NOT appear in the result.
   */
  it("property: plane edges are excluded when neither origin nor target is a hub", () => {
    const nonHubLocationArb = fc.string({ minLength: 1, maxLength: 8 }).filter(
      (s) => !s.includes("hub"),
    );

    fc.assert(
      fc.property(
        nonHubLocationArb,
        fc.array(nonHubLocationArb, { minLength: 1, maxLength: 5 }),
        (origin, targets) => {
          const edges = targets.map((t) => makeEdge(t, "plane"));
          const adjacency = [makeEntry(origin, edges)];
          // hubs set contains none of the involved locations
          const hubIds = new Set(["completely-different-hub"]);

          const result = computeLegalMoves(
            origin,
            adjacency,
            new Set(),
            hubIds,
          );

          expect(result).toEqual([]);
        },
      ),
    );
  });
});
