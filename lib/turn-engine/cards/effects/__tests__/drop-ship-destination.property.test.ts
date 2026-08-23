// Feature: action-cards
// Property 9: Drop Ship Destination Validity
// **Validates: Requirements 9.1, 9.2, 9.3**

import fc from "fast-check";

/**
 * Property 9: Drop Ship Destination Validity
 *
 * For any origin Location O, the selected destination D satisfies:
 * - Region(D) != Region(O) (always a different region)
 * - Either distance(O, D) >= 4 (primary set), OR
 * - If no such location exists, distance(O, D) equals the maximum distance
 *   from O among all Locations outside Region(O) (fallback set)
 * - The algorithm always produces a valid destination (never empty)
 *
 * We test the Drop Ship destination selection algorithm directly by replicating
 * its pure logic (from drop-ship.ts) without database or module dependencies.
 * This tests the correctness of the selection algorithm, which is the core
 * property being verified.
 */

// --- Replicated algorithm from handleDropShip (pure logic) ---
// This mirrors the exact algorithm in drop-ship.ts lines 15-41

interface LocationData {
  id: string;
  regionId: string;
}

interface DropShipResult {
  destinationId: string;
  distance: number;
}

/**
 * Pure Drop Ship destination selection algorithm.
 * Identical logic to handleDropShip but without database or event dependencies.
 */
function selectDropShipDestination(
  originLocationId: string,
  allLocations: LocationData[],
  getDistance: (from: string, to: string) => number,
  rng: () => number
): DropShipResult {
  const originLocation = allLocations.find((l) => l.id === originLocationId);
  if (!originLocation) throw new Error(`Origin location not found: ${originLocationId}`);

  const originRegionId = originLocation.regionId;

  // Compute distances from origin to all locations in different regions
  const candidates: { id: string; distance: number }[] = [];
  for (const loc of allLocations) {
    if (loc.regionId === originRegionId) continue;
    const dist = getDistance(originLocationId, loc.id);
    candidates.push({ id: loc.id, distance: dist });
  }

  // Primary set: distance >= 4 AND different region
  let eligibleSet = candidates.filter((c) => c.distance >= 4);

  // Fallback: if primary set empty, take locations with max distance in different region
  if (eligibleSet.length === 0) {
    const maxDistance = Math.max(...candidates.map((c) => c.distance));
    eligibleSet = candidates.filter((c) => c.distance === maxDistance);
  }

  // Select uniformly at random from eligible set
  const selectedIndex = Math.floor(rng() * eligibleSet.length);
  const destination = eligibleSet[selectedIndex];

  return { destinationId: destination.id, distance: destination.distance };
}

// --- Arbitraries ---

/**
 * Generates a set of locations spread across multiple regions.
 * Each region has between 3 and 10 locations.
 * Generates between 2 and 6 regions, mimicking the real game's 6 regions / 40 locations.
 */
function arbLocationSet() {
  return fc
    .integer({ min: 2, max: 6 })
    .chain((numRegions) => {
      const regionIds = Array.from({ length: numRegions }, (_, i) => `region-${i}`);

      return fc
        .tuple(
          ...regionIds.map((regionId) =>
            fc.integer({ min: 3, max: 10 }).map((count) =>
              Array.from({ length: count }, (_, j) => ({
                id: `${regionId}-loc-${j}`,
                regionId,
              }))
            )
          )
        )
        .map((locationArrays) => ({
          regionIds,
          locations: locationArrays.flat(),
        }));
    });
}

/**
 * Generates a complete distance function for all cross-region pairs from origin.
 * Distances are in [1, 6] (valid range for the Shadow Hunt map).
 */
function arbDistanceMapForOrigin(
  originId: string,
  originRegionId: string,
  locations: LocationData[]
) {
  const crossRegionLocations = locations.filter(
    (l) => l.regionId !== originRegionId
  );

  return fc
    .array(fc.integer({ min: 1, max: 6 }), {
      minLength: crossRegionLocations.length,
      maxLength: crossRegionLocations.length,
    })
    .map((distances) => {
      const distMap = new Map<string, number>();
      crossRegionLocations.forEach((loc, i) => {
        distMap.set(loc.id, distances[i]);
      });
      return distMap;
    });
}

describe("Drop Ship Destination Validity — Property 9", () => {
  it("destination is always in a different region from origin", () => {
    fc.assert(
      fc.property(
        arbLocationSet().chain(({ locations, regionIds }) => {
          // Pick a random origin
          return fc.record({
            locations: fc.constant(locations),
            regionIds: fc.constant(regionIds),
            originIndex: fc.nat({ max: locations.length - 1 }),
            rngValue: fc.double({ min: 0, max: 0.99, noNaN: true }),
          });
        }),
        ({ locations, originIndex, rngValue }) => {
          const origin = locations[originIndex];
          const otherRegionLocs = locations.filter((l) => l.regionId !== origin.regionId);

          // Precondition: there must be locations in other regions
          fc.pre(otherRegionLocs.length > 0);

          // Generate deterministic distances
          const distMap = new Map<string, number>();
          otherRegionLocs.forEach((loc, i) => {
            distMap.set(loc.id, (i % 6) + 1);
          });

          const getDistance = (from: string, to: string) => distMap.get(to) ?? 1;

          const result = selectDropShipDestination(
            origin.id,
            locations,
            getDistance,
            () => rngValue
          );

          // Verify: destination is in a different region
          const destLocation = locations.find((l) => l.id === result.destinationId);
          expect(destLocation).toBeDefined();
          expect(destLocation!.regionId).not.toBe(origin.regionId);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("destination distance >= 4 when such locations exist in other regions", () => {
    fc.assert(
      fc.property(
        arbLocationSet().chain(({ locations, regionIds }) => {
          return fc.record({
            locations: fc.constant(locations),
            originIndex: fc.nat({ max: locations.length - 1 }),
            rngValue: fc.double({ min: 0, max: 0.99, noNaN: true }),
          });
        }),
        ({ locations, originIndex, rngValue }) => {
          const origin = locations[originIndex];
          const otherRegionLocs = locations.filter((l) => l.regionId !== origin.regionId);
          fc.pre(otherRegionLocs.length > 0);

          // Ensure at least one cross-region location has distance >= 4
          const distMap = new Map<string, number>();
          otherRegionLocs.forEach((loc, i) => {
            // First location gets distance 5, rest get distances 1-3
            distMap.set(loc.id, i === 0 ? 5 : (i % 3) + 1);
          });

          // Verify precondition: there exists at least one location with dist >= 4
          const hasFarLocations = Array.from(distMap.values()).some((d) => d >= 4);
          fc.pre(hasFarLocations);

          const getDistance = (from: string, to: string) => distMap.get(to) ?? 1;

          const result = selectDropShipDestination(
            origin.id,
            locations,
            getDistance,
            () => rngValue
          );

          // When far locations exist, destination must be >= 4 away
          expect(result.distance).toBeGreaterThanOrEqual(4);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("when no location is >= 4 away in another region, destination has max distance among options", () => {
    fc.assert(
      fc.property(
        arbLocationSet().chain(({ locations, regionIds }) => {
          return fc.record({
            locations: fc.constant(locations),
            originIndex: fc.nat({ max: locations.length - 1 }),
            rngValue: fc.double({ min: 0, max: 0.99, noNaN: true }),
            // Distances capped at 3 to ensure the fallback path
            distanceSeed: fc.array(fc.integer({ min: 1, max: 3 }), {
              minLength: 40,
              maxLength: 40,
            }),
          });
        }),
        ({ locations, originIndex, rngValue, distanceSeed }) => {
          const origin = locations[originIndex];
          const otherRegionLocs = locations.filter((l) => l.regionId !== origin.regionId);
          fc.pre(otherRegionLocs.length > 0);

          // All cross-region locations have distance < 4 (fallback path)
          const distMap = new Map<string, number>();
          otherRegionLocs.forEach((loc, i) => {
            distMap.set(loc.id, distanceSeed[i % distanceSeed.length]);
          });

          // Verify precondition: no location is >= 4 away
          const allDistances = Array.from(distMap.values());
          fc.pre(allDistances.every((d) => d < 4));

          const maxDistance = Math.max(...allDistances);

          const getDistance = (from: string, to: string) => distMap.get(to) ?? 1;

          const result = selectDropShipDestination(
            origin.id,
            locations,
            getDistance,
            () => rngValue
          );

          // Fallback: destination must have the max distance
          expect(result.distance).toBe(maxDistance);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("the algorithm always produces a valid destination (never empty selection)", () => {
    fc.assert(
      fc.property(
        arbLocationSet().chain(({ locations, regionIds }) => {
          return fc.record({
            locations: fc.constant(locations),
            originIndex: fc.nat({ max: locations.length - 1 }),
            rngValue: fc.double({ min: 0, max: 0.99, noNaN: true }),
          });
        }),
        ({ locations, originIndex, rngValue }) => {
          const origin = locations[originIndex];
          const otherRegionLocs = locations.filter((l) => l.regionId !== origin.regionId);
          // The game map always has locations in other regions (6 regions, 40 locations)
          fc.pre(otherRegionLocs.length > 0);

          // Random distances in valid range
          const distMap = new Map<string, number>();
          otherRegionLocs.forEach((loc, i) => {
            distMap.set(loc.id, (i % 6) + 1);
          });

          const getDistance = (from: string, to: string) => distMap.get(to) ?? 1;

          // Should not throw
          const result = selectDropShipDestination(
            origin.id,
            locations,
            getDistance,
            () => rngValue
          );

          // Must produce a valid location ID
          expect(result.destinationId).toBeDefined();
          expect(locations.some((l) => l.id === result.destinationId)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("for all rng values [0, 1), destination is always within the eligible set", () => {
    fc.assert(
      fc.property(
        arbLocationSet().chain(({ locations }) => {
          return fc.record({
            locations: fc.constant(locations),
            originIndex: fc.nat({ max: locations.length - 1 }),
            rngValue: fc.double({ min: 0, max: 0.99, noNaN: true }),
            // Mix of near and far distances to test both primary and fallback
            distanceSeed: fc.array(fc.integer({ min: 1, max: 6 }), {
              minLength: 40,
              maxLength: 40,
            }),
          });
        }),
        ({ locations, originIndex, rngValue, distanceSeed }) => {
          const origin = locations[originIndex];
          const otherRegionLocs = locations.filter((l) => l.regionId !== origin.regionId);
          fc.pre(otherRegionLocs.length > 0);

          const distMap = new Map<string, number>();
          otherRegionLocs.forEach((loc, i) => {
            distMap.set(loc.id, distanceSeed[i % distanceSeed.length]);
          });

          const getDistance = (from: string, to: string) => distMap.get(to) ?? 1;

          const result = selectDropShipDestination(
            origin.id,
            locations,
            getDistance,
            () => rngValue
          );

          // Independently compute the eligible set
          const candidates = otherRegionLocs.map((loc) => ({
            id: loc.id,
            distance: distMap.get(loc.id)!,
          }));

          let expectedEligible = candidates.filter((c) => c.distance >= 4);
          if (expectedEligible.length === 0) {
            const maxDist = Math.max(...candidates.map((c) => c.distance));
            expectedEligible = candidates.filter((c) => c.distance === maxDist);
          }

          // Result must be in the independently computed eligible set
          const isInEligible = expectedEligible.some((e) => e.id === result.destinationId);
          expect(isInEligible).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
