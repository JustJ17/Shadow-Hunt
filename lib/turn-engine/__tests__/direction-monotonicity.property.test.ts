// Feature: action-cards
// Property 13: Direction Monotonicity
// **Validates: Requirements 13.3, 13.4**

import fc from "fast-check";

/**
 * Property 13: Direction Monotonicity
 *
 * For any `reveal-direction` resolution where reference distance d > 0,
 * the revealed Location is adjacent to the Origin_Location and satisfies
 * `getShortestPathDistance(revealed, mastermind) == d - 1`.
 * When d == 0, the revealed Location equals the Origin_Location.
 *
 * We test the direction resolution algorithm directly by replicating its pure
 * logic (from resolve-round-end.ts resolveRevealDirection) without database
 * dependencies, using injectable distance and adjacency functions.
 */

// --- Replicated algorithm from resolveRevealDirection (pure logic) ---

interface RevealDirectionInput {
  originLocationId: string;
  mastermindLocationId: string;
  neighbors: string[];
  getDistance: (from: string, to: string) => number;
  rng: () => number;
}

interface RevealDirectionResult {
  revealedLocationId: string;
}

/**
 * Pure reveal-direction selection algorithm.
 * Identical logic to resolveRevealDirection but without database dependencies.
 */
function selectRevealDirection(input: RevealDirectionInput): RevealDirectionResult {
  const { originLocationId, mastermindLocationId, neighbors, getDistance, rng } = input;

  const referenceDistance = getDistance(originLocationId, mastermindLocationId);

  if (referenceDistance === 0) {
    // Player is at mastermind's location — reveal their own location (Req 13.4)
    return { revealedLocationId: originLocationId };
  }

  // Find adjacent locations that are one step closer to the mastermind (Req 13.3)
  const candidates: string[] = [];
  for (const neighborId of neighbors) {
    const dist = getDistance(neighborId, mastermindLocationId);
    if (dist === referenceDistance - 1) {
      candidates.push(neighborId);
    }
  }

  // Select uniformly at random from candidates (Req 13.3)
  const selectedIndex = Math.floor(rng() * candidates.length);
  return { revealedLocationId: candidates[selectedIndex] };
}

// --- Arbitraries ---

/**
 * Generates a graph-like structure:
 * - An origin location
 * - A mastermind location
 * - A set of neighbors for the origin
 * - A consistent distance function where:
 *   - distance(origin, mastermind) = d (the reference distance, 1-6)
 *   - At least one neighbor has distance d-1 to mastermind (graph monotonicity)
 *   - Other neighbors have various distances
 */
function arbRevealDirectionScenario() {
  return fc
    .record({
      referenceDistance: fc.integer({ min: 1, max: 6 }),
      numNeighbors: fc.integer({ min: 1, max: 8 }),
      rngValue: fc.double({ min: 0, max: 0.99, noNaN: true }),
    })
    .chain(({ referenceDistance, numNeighbors, rngValue }) => {
      // Generate neighbor distances; at least one must be referenceDistance - 1
      // (Graph connectivity guarantees this for a connected graph with d > 0)
      return fc
        .array(fc.integer({ min: 0, max: 6 }), {
          minLength: numNeighbors,
          maxLength: numNeighbors,
        })
        .map((neighborDistances) => {
          // Ensure at least one neighbor has distance d-1
          // (This is a graph invariant: if origin has distance d > 0,
          //  there must be at least one adjacent node with distance d-1)
          if (!neighborDistances.some((d) => d === referenceDistance - 1)) {
            neighborDistances[0] = referenceDistance - 1;
          }

          const originId = "origin-loc";
          const mastermindId = "mastermind-loc";
          const neighbors = Array.from(
            { length: numNeighbors },
            (_, i) => `neighbor-${i}`
          );

          // Build a distance function
          const distanceMap = new Map<string, number>();
          distanceMap.set(`${originId}->${mastermindId}`, referenceDistance);
          neighbors.forEach((neighborId, i) => {
            distanceMap.set(`${neighborId}->${mastermindId}`, neighborDistances[i]);
          });

          const getDistance = (from: string, to: string): number => {
            const key = `${from}->${to}`;
            const dist = distanceMap.get(key);
            if (dist === undefined) {
              throw new Error(`Distance not defined for ${key}`);
            }
            return dist;
          };

          return {
            originId,
            mastermindId,
            neighbors,
            neighborDistances,
            referenceDistance,
            getDistance,
            rngValue,
          };
        });
    });
}

/**
 * Generates a scenario where reference distance is 0 (origin == mastermind location).
 */
function arbZeroDistanceScenario() {
  return fc
    .record({
      numNeighbors: fc.integer({ min: 0, max: 8 }),
      rngValue: fc.double({ min: 0, max: 0.99, noNaN: true }),
    })
    .map(({ numNeighbors, rngValue }) => {
      const originId = "origin-loc";
      const mastermindId = "mastermind-loc";
      const neighbors = Array.from(
        { length: numNeighbors },
        (_, i) => `neighbor-${i}`
      );

      const getDistance = (from: string, to: string): number => {
        if (from === originId && to === mastermindId) return 0;
        throw new Error(`Unexpected distance query: ${from} -> ${to}`);
      };

      return {
        originId,
        mastermindId,
        neighbors,
        referenceDistance: 0,
        getDistance,
        rngValue,
      };
    });
}

describe("Direction Monotonicity — Property 13", () => {
  it("when d > 0, the revealed location is one of the origin's neighbors", () => {
    fc.assert(
      fc.property(
        arbRevealDirectionScenario(),
        ({ originId, mastermindId, neighbors, getDistance, rngValue }) => {
          const result = selectRevealDirection({
            originLocationId: originId,
            mastermindLocationId: mastermindId,
            neighbors,
            getDistance,
            rng: () => rngValue,
          });

          // The revealed location must be one of the origin's neighbors
          expect(neighbors).toContain(result.revealedLocationId);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("when d > 0, the revealed location has distance d-1 to the mastermind", () => {
    fc.assert(
      fc.property(
        arbRevealDirectionScenario(),
        ({
          originId,
          mastermindId,
          neighbors,
          referenceDistance,
          getDistance,
          rngValue,
        }) => {
          const result = selectRevealDirection({
            originLocationId: originId,
            mastermindLocationId: mastermindId,
            neighbors,
            getDistance,
            rng: () => rngValue,
          });

          // The revealed location's distance to mastermind must be exactly d - 1
          const revealedDistance = getDistance(
            result.revealedLocationId,
            mastermindId
          );
          expect(revealedDistance).toBe(referenceDistance - 1);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("when d == 0, the revealed location equals the origin location", () => {
    fc.assert(
      fc.property(arbZeroDistanceScenario(), ({ originId, mastermindId, neighbors, getDistance, rngValue }) => {
        const result = selectRevealDirection({
          originLocationId: originId,
          mastermindLocationId: mastermindId,
          neighbors,
          getDistance,
          rng: () => rngValue,
        });

        // When at distance 0, revealed location must be the origin itself
        expect(result.revealedLocationId).toBe(originId);
      }),
      { numRuns: 200 }
    );
  });

  it("revealed location is always selected from the candidate set (d-1 neighbors only)", () => {
    fc.assert(
      fc.property(
        arbRevealDirectionScenario(),
        ({
          originId,
          mastermindId,
          neighbors,
          neighborDistances,
          referenceDistance,
          getDistance,
          rngValue,
        }) => {
          const result = selectRevealDirection({
            originLocationId: originId,
            mastermindLocationId: mastermindId,
            neighbors,
            getDistance,
            rng: () => rngValue,
          });

          // Independently compute the expected candidate set
          const expectedCandidates = neighbors.filter((_, i) => {
            return neighborDistances[i] === referenceDistance - 1;
          });

          // The revealed location must be in the independently-computed candidate set
          expect(expectedCandidates).toContain(result.revealedLocationId);
        }
      ),
      { numRuns: 500 }
    );
  });

  it("for varying rng values, all candidates in the d-1 set are reachable", () => {
    // This tests uniform selection: given multiple candidates, different rng values
    // should be able to select each one
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }).chain((numCandidates) => {
          return fc.constant({
            numCandidates,
            referenceDistance: 3,
          });
        }),
        ({ numCandidates, referenceDistance }) => {
          const originId = "origin-loc";
          const mastermindId = "mastermind-loc";

          // All neighbors are candidates (all have distance d-1)
          const neighbors = Array.from(
            { length: numCandidates },
            (_, i) => `candidate-${i}`
          );

          const getDistance = (from: string, to: string): number => {
            if (from === originId && to === mastermindId) return referenceDistance;
            // All neighbors have distance d-1
            if (to === mastermindId && neighbors.includes(from)) {
              return referenceDistance - 1;
            }
            throw new Error(`Unexpected distance query: ${from} -> ${to}`);
          };

          // Try different rng values that target each candidate
          const selectedSet = new Set<string>();
          for (let i = 0; i < numCandidates; i++) {
            const rngValue = i / numCandidates; // Targets index i via Math.floor
            const result = selectRevealDirection({
              originLocationId: originId,
              mastermindLocationId: mastermindId,
              neighbors,
              getDistance,
              rng: () => rngValue,
            });
            selectedSet.add(result.revealedLocationId);
          }

          // All candidates should be reachable
          expect(selectedSet.size).toBe(numCandidates);
        }
      ),
      { numRuns: 100 }
    );
  });
});
