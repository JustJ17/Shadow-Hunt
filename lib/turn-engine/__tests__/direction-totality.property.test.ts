// Feature: action-cards
// Property 14: Direction Totality
// **Validates: Requirements 13.3, 13.6**

import fc from "fast-check";

/**
 * Property 14: Direction Totality
 *
 * For any (Origin_Location, Mastermind Location) pair over the 40-Location map,
 * `reveal-direction` produces exactly one valid revealed Location (the candidate
 * set is never empty for d > 0 due to graph connectivity).
 *
 * We test this property using the pure algorithm approach:
 * 1. Generate connected graphs (representing any valid game map)
 * 2. For any origin with d > 0, verify at least one neighbor has distance d-1
 * 3. Therefore the candidate set is never empty and the algorithm always selects a result
 *
 * This is fundamentally a BFS property of connected graphs: if dist(u, v) = d > 0,
 * then there exists a neighbor w of u such that dist(w, v) = d - 1 (the predecessor
 * on a shortest path from u to v). We verify this empirically across random connected
 * graphs.
 */

// --- Pure BFS distance computation (replicates lib/map/distance.ts logic) ---

/**
 * Computes shortest-path distances from a source node to all reachable nodes via BFS.
 */
function bfs(
  sourceId: number,
  adjacencyList: Map<number, Set<number>>
): Map<number, number> {
  const distances = new Map<number, number>();
  distances.set(sourceId, 0);

  const queue: number[] = [sourceId];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    const currentDistance = distances.get(current)!;
    const neighbors = adjacencyList.get(current);

    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDistance + 1);
          queue.push(neighbor);
        }
      }
    }
  }

  return distances;
}

// --- Replicated reveal-direction selection logic ---

interface RevealDirectionInput {
  originId: number;
  mastermindId: number;
  neighbors: number[];
  getDistance: (from: number, to: number) => number;
  rng: () => number;
}

interface RevealDirectionResult {
  revealedLocationId: number;
  candidateCount: number;
}

/**
 * Pure reveal-direction selection algorithm (mirrors resolveRevealDirection logic).
 */
function selectRevealDirection(input: RevealDirectionInput): RevealDirectionResult {
  const { originId, mastermindId, neighbors, getDistance, rng } = input;

  const referenceDistance = getDistance(originId, mastermindId);

  if (referenceDistance === 0) {
    return { revealedLocationId: originId, candidateCount: 1 };
  }

  // Find adjacent locations that are one step closer to the mastermind (Req 13.3)
  const candidates: number[] = [];
  for (const neighborId of neighbors) {
    const dist = getDistance(neighborId, mastermindId);
    if (dist === referenceDistance - 1) {
      candidates.push(neighborId);
    }
  }

  // Select uniformly at random from candidates
  const selectedIndex = Math.floor(rng() * candidates.length);
  return {
    revealedLocationId: candidates[selectedIndex],
    candidateCount: candidates.length,
  };
}

// --- Graph generators ---

/**
 * Generates a random connected graph with the given number of nodes.
 * Uses a random spanning tree (random permutation walk) + extra random edges
 * to ensure connectivity.
 */
function arbConnectedGraph(minNodes: number, maxNodes: number) {
  return fc
    .record({
      nodeCount: fc.integer({ min: minNodes, max: maxNodes }),
      extraEdgeCount: fc.integer({ min: 0, max: 30 }),
      seed: fc.integer({ min: 0, max: 1_000_000 }),
    })
    .chain(({ nodeCount, extraEdgeCount, seed }) => {
      return fc
        .shuffledSubarray(
          Array.from({ length: nodeCount }, (_, i) => i),
          { minLength: nodeCount, maxLength: nodeCount }
        )
        .map((permutation) => {
          const adjacencyList = new Map<number, Set<number>>();
          for (let i = 0; i < nodeCount; i++) {
            adjacencyList.set(i, new Set());
          }

          // Build a spanning tree via the random permutation (path graph on permuted nodes)
          for (let i = 0; i < permutation.length - 1; i++) {
            const a = permutation[i];
            const b = permutation[i + 1];
            adjacencyList.get(a)!.add(b);
            adjacencyList.get(b)!.add(a);
          }

          // Add extra random edges for more connectivity
          let rngState = seed;
          const nextRng = () => {
            rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
            return rngState / 0x7fffffff;
          };

          for (let i = 0; i < extraEdgeCount; i++) {
            const a = Math.floor(nextRng() * nodeCount);
            const b = Math.floor(nextRng() * nodeCount);
            if (a !== b) {
              adjacencyList.get(a)!.add(b);
              adjacencyList.get(b)!.add(a);
            }
          }

          return { nodeCount, adjacencyList };
        });
    });
}

describe("Direction Totality — Property 14", () => {
  it("for any connected graph, every (origin, target) pair with d > 0 has a non-empty candidate set", () => {
    // Core BFS property: in a connected graph, if dist(origin, target) = d > 0,
    // at least one neighbor of origin has distance d-1 to target.
    fc.assert(
      fc.property(
        arbConnectedGraph(5, 25),
        fc.integer({ min: 0, max: 24 }),
        ({ nodeCount, adjacencyList }, targetSeed) => {
          const target = targetSeed % nodeCount;
          // BFS from target — gives distances to target for every node
          const distFromTarget = bfs(target, adjacencyList);

          // For every node that's at distance > 0 from target
          for (let origin = 0; origin < nodeCount; origin++) {
            const d = distFromTarget.get(origin);
            if (d === undefined || d === 0) continue;

            const neighbors = Array.from(adjacencyList.get(origin)!);

            // There must be at least one neighbor at distance d-1 from target
            const candidateCount = neighbors.filter(
              (n) => distFromTarget.get(n) === d - 1
            ).length;

            expect(candidateCount).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 300 }
    );
  });

  it("reveal-direction always produces exactly one valid result for any (origin, mastermind) with d > 0", () => {
    // Verifies that selectRevealDirection never fails (candidate set non-empty)
    // and always selects a valid neighbor at distance d-1.
    fc.assert(
      fc.property(
        arbConnectedGraph(5, 25),
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 24 }),
        fc.double({ min: 0, max: 0.99, noNaN: true }),
        ({ nodeCount, adjacencyList }, originSeed, mastermindSeed, rngValue) => {
          const origin = originSeed % nodeCount;
          const mastermind = mastermindSeed % nodeCount;
          if (origin === mastermind) return; // d == 0 case tested separately

          // BFS from mastermind gives all distances to mastermind
          const distFromMastermind = bfs(mastermind, adjacencyList);
          const getDistance = (from: number, to: number): number => {
            if (from === to) return 0;
            if (to === mastermind) return distFromMastermind.get(from)!;
            // For this test we only need dist(*, mastermind)
            return bfs(from, adjacencyList).get(to)!;
          };

          const neighbors = Array.from(adjacencyList.get(origin)!);

          const result = selectRevealDirection({
            originId: origin,
            mastermindId: mastermind,
            neighbors,
            getDistance,
            rng: () => rngValue,
          });

          // Candidate count must be at least 1 (direction totality)
          expect(result.candidateCount).toBeGreaterThanOrEqual(1);
          // Revealed location must be a neighbor of origin (Req 13.6)
          expect(neighbors).toContain(result.revealedLocationId);
          // Revealed location must have distance d-1 to mastermind (Req 13.3)
          const revealedDist = distFromMastermind.get(result.revealedLocationId)!;
          const originDist = distFromMastermind.get(origin)!;
          expect(revealedDist).toBe(originDist - 1);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("BFS shortest-path tree always has a predecessor at d-1 (graph-theoretic guarantee)", () => {
    // This test verifies the fundamental BFS property that guarantees direction totality.
    // For a BFS from target T: if dist(u, T) = d > 0, at least one neighbor w of u
    // has dist(w, T) = d - 1. This is the BFS parent property.
    fc.assert(
      fc.property(
        arbConnectedGraph(10, 40),
        fc.integer({ min: 0, max: 39 }),
        ({ nodeCount, adjacencyList }, targetSeed) => {
          const target = targetSeed % nodeCount;
          const distFromTarget = bfs(target, adjacencyList);

          for (let origin = 0; origin < nodeCount; origin++) {
            const d = distFromTarget.get(origin);
            if (d === undefined || d === 0) continue;

            const neighbors = Array.from(adjacencyList.get(origin)!);

            // BFS guarantee: there must be at least one neighbor closer to target
            const hasCloserNeighbor = neighbors.some(
              (n) => distFromTarget.get(n) === d - 1
            );

            expect(hasCloserNeighbor).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("for the d == 0 case, reveal-direction returns the origin location itself", () => {
    fc.assert(
      fc.property(
        arbConnectedGraph(5, 20),
        fc.integer({ min: 0, max: 19 }),
        fc.double({ min: 0, max: 0.99, noNaN: true }),
        ({ nodeCount, adjacencyList }, nodeSeed, rngValue) => {
          const node = nodeSeed % nodeCount;
          const neighbors = Array.from(adjacencyList.get(node)!);

          const getDistance = (from: number, to: number): number => {
            if (from === to) return 0;
            return bfs(from, adjacencyList).get(to) ?? Infinity;
          };

          // When origin == mastermind (d == 0), revealed must equal origin
          const result = selectRevealDirection({
            originId: node,
            mastermindId: node,
            neighbors,
            getDistance,
            rng: () => rngValue,
          });

          expect(result.revealedLocationId).toBe(node);
          expect(result.candidateCount).toBe(1);
        }
      ),
      { numRuns: 200 }
    );
  });
});
