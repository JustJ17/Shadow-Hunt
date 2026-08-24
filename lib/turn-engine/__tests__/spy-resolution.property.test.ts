// Feature: movement-turn-actions
// Property 13: Step B Priority Case Exclusivity
// Property 15: Reward Tier Mapping
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.3**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  resolveSpyAndReward,
  computeRewardTier,
} from "@/lib/turn-engine/resolution/resolve-spy-reward";
import { resetSpyDistanceMatrix } from "@/lib/turn-engine/spy-distance";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

let prisma: PrismaClient;
let allLocations: LocationRecord[] = [];
let locationsByRegion: Map<string, LocationRecord[]>;

// Counter for unique room codes
let roomCounter = 0;

/**
 * Defines the possible game state configurations for spy resolution.
 * Each scenario represents one of the 5 priority cases or their preconditions.
 */
type SpyResolutionScenario =
  | "pending-reward-left-region" // Case 1
  | "pending-reward-same-region" // Case 2
  | "spy-captured-no-pending" // Case 3
  | "at-uncaptured-spy" // Case 4
  | "in-region-with-uncaptured-spy"; // Case 5

describe("Spy Resolution Property Tests", () => {
  // **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.3**

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

    allLocations = await prisma.location.findMany();

    // Group locations by region
    locationsByRegion = new Map<string, LocationRecord[]>();
    for (const loc of allLocations) {
      const group = locationsByRegion.get(loc.regionId) ?? [];
      group.push(loc);
      locationsByRegion.set(loc.regionId, group);
    }

    // Initialize spy distance matrix for Case 5 clue computation
    resetSpyDistanceMatrix();
  }, 30000);

  afterAll(async () => {
    resetSpyDistanceMatrix();
    await prisma.$disconnect();
  });

  describe("Property 13: Step B Priority Case Exclusivity", () => {
    // **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**

    it("exactly one of 5 cases matches and executes per resolution for any game state", async () => {
      // Get two distinct regions for setting up "left region" scenario
      const regionIds = Array.from(locationsByRegion.keys());
      expect(regionIds.length).toBeGreaterThanOrEqual(2);

      // Generate scenarios covering all 5 cases
      const scenarios: SpyResolutionScenario[] = [
        "pending-reward-left-region",
        "pending-reward-same-region",
        "spy-captured-no-pending",
        "at-uncaptured-spy",
        "in-region-with-uncaptured-spy",
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...scenarios),
          fc.integer({ min: 1, max: 6 }), // captureOrder for pending reward
          fc.integer({ min: 1, max: 10 }), // round number
          async (
            scenario: SpyResolutionScenario,
            captureOrder: number,
            roundNumber: number
          ) => {
            await prisma
              .$transaction(async (tx) => {
                const code = `SR${(++roomCounter).toString().padStart(4, "0")}`;
                const room = await tx.room.create({
                  data: { code, status: "in-progress" },
                });

                const playerId = `test-spy-res-${roomCounter}`;

                // Pick two distinct regions for setup
                const regionA = regionIds[0];
                const regionB = regionIds[1];
                const locationsInA = locationsByRegion.get(regionA)!;
                const locationsInB = locationsByRegion.get(regionB)!;

                // Pick distinct locations within regionA for spy and player
                const spyLocation = locationsInA[0];
                const playerLocationInRegion =
                  locationsInA.length > 1 ? locationsInA[1] : locationsInA[0];

                let playerLocationId: string;
                let pendingRewardRegionId: string | null = null;
                let pendingRewardCaptureOrder: number | null = null;

                switch (scenario) {
                  case "pending-reward-left-region":
                    // Player has pending reward in regionA but is now in regionB
                    playerLocationId = locationsInB[0].id;
                    pendingRewardRegionId = regionA;
                    pendingRewardCaptureOrder = captureOrder;
                    // Create spy in regionB (player's current region)
                    await tx.gameSpy.create({
                      data: {
                        roomId: room.id,
                        regionId: regionB,
                        locationId: locationsInB[locationsInB.length - 1].id,
                      },
                    });
                    // Create spy in regionA (the pending reward region)
                    await tx.gameSpy.create({
                      data: {
                        roomId: room.id,
                        regionId: regionA,
                        locationId: spyLocation.id,
                      },
                    });
                    break;

                  case "pending-reward-same-region":
                    // Player has pending reward in regionA and is still in regionA
                    playerLocationId = playerLocationInRegion.id;
                    pendingRewardRegionId = regionA;
                    pendingRewardCaptureOrder = captureOrder;
                    // Create spy in regionA (already captured by player — add SpyCapture)
                    {
                      const spy = await tx.gameSpy.create({
                        data: {
                          roomId: room.id,
                          regionId: regionA,
                          locationId: spyLocation.id,
                        },
                      });
                      await tx.spyCapture.create({
                        data: {
                          roomId: room.id,
                          spyId: spy.id,
                          playerId,
                          captureOrder: 1,
                        },
                      });
                    }
                    break;

                  case "spy-captured-no-pending":
                    // Region's spy is already captured by this player, no pending reward
                    playerLocationId = playerLocationInRegion.id;
                    {
                      const spy = await tx.gameSpy.create({
                        data: {
                          roomId: room.id,
                          regionId: regionA,
                          locationId: spyLocation.id,
                        },
                      });
                      // Captured by THIS player — so Case 3 fires (already captured for this player)
                      await tx.spyCapture.create({
                        data: {
                          roomId: room.id,
                          spyId: spy.id,
                          playerId,
                          captureOrder: 1,
                        },
                      });
                    }
                    break;

                  case "at-uncaptured-spy":
                    // Player is at the uncaptured spy's exact location
                    playerLocationId = spyLocation.id;
                    await tx.gameSpy.create({
                      data: {
                        roomId: room.id,
                        regionId: regionA,
                        locationId: spyLocation.id,
                      },
                    });
                    break;

                  case "in-region-with-uncaptured-spy":
                    // Player is in region with uncaptured spy, NOT at spy's location
                    // We need to ensure player is at a different location than spy
                    if (locationsInA.length < 2) {
                      // Skip if region only has one location (can't be at different location)
                      throw new Error("ROLLBACK");
                    }
                    playerLocationId = playerLocationInRegion.id;
                    // Make sure spy is at a different location
                    const spyLoc =
                      playerLocationInRegion.id === spyLocation.id
                        ? locationsInA[locationsInA.length - 1]
                        : spyLocation;
                    if (spyLoc.id === playerLocationId) {
                      // Fallback: pick any other location in the region
                      const otherLoc = locationsInA.find(
                        (l) => l.id !== playerLocationId
                      );
                      if (!otherLoc) throw new Error("ROLLBACK");
                      await tx.gameSpy.create({
                        data: {
                          roomId: room.id,
                          regionId: regionA,
                          locationId: otherLoc.id,
                        },
                      });
                    } else {
                      await tx.gameSpy.create({
                        data: {
                          roomId: room.id,
                          regionId: regionA,
                          locationId: spyLoc.id,
                        },
                      });
                    }
                    break;
                }

                // Create player position record
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: playerId,
                    locationId: playerLocationId!,
                    skipNextTurn: false,
                    pendingRewardRegionId,
                    pendingRewardCaptureOrder,
                  },
                });

                // Execute resolveSpyAndReward
                const result = await resolveSpyAndReward(
                  room.id,
                  playerId,
                  playerLocationId!,
                  roundNumber,
                  tx
                );

                // Verify exactly one outcome type is returned
                const validOutcomeTypes = [
                  "spy-captured-reward-collected",
                  "none",
                  "spy-captured",
                  "clue",
                ];
                expect(validOutcomeTypes).toContain(result.type);

                // Verify the correct case fired based on scenario
                switch (scenario) {
                  case "pending-reward-left-region":
                    expect(result.type).toBe("spy-captured-reward-collected");
                    expect(result.rewardTier).toBeDefined();
                    expect(result.rewardTier).toBeGreaterThanOrEqual(1);
                    expect(result.rewardTier).toBeLessThanOrEqual(4);
                    break;

                  case "pending-reward-same-region":
                    expect(result.type).toBe("none");
                    break;

                  case "spy-captured-no-pending":
                    expect(result.type).toBe("none");
                    break;

                  case "at-uncaptured-spy":
                    expect(result.type).toBe("spy-captured");
                    expect(result.captureOrder).toBeDefined();
                    expect(result.captureOrder).toBeGreaterThanOrEqual(1);
                    break;

                  case "in-region-with-uncaptured-spy":
                    expect(result.type).toBe("clue");
                    expect(result.notebookEntry).toBeDefined();
                    expect(result.notebookEntry!.regionId).toBe(regionA);
                    expect(result.notebookEntry!.roundNumber).toBe(roundNumber);
                    expect(
                      result.notebookEntry!.stepsAway
                    ).toBeGreaterThanOrEqual(1);
                    break;
                }

                // Force rollback to keep DB clean
                throw new Error("ROLLBACK");
              }, { timeout: 15000 })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 50 }
      );
    }, 300000);

    it("outcome type is always one of the four valid types", async () => {
      const regionIds = Array.from(locationsByRegion.keys());

      // Generate random configurations via fast-check
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // hasPendingReward
          fc.boolean(), // isInDifferentRegion (only relevant if hasPendingReward)
          fc.boolean(), // isSpyCapturedByThisPlayer
          fc.boolean(), // isAtSpyLocation
          fc.integer({ min: 1, max: 6 }), // captureOrder
          async (
            hasPendingReward: boolean,
            isInDifferentRegion: boolean,
            isSpyCapturedByThisPlayer: boolean,
            isAtSpyLocation: boolean,
            captureOrder: number
          ) => {
            await prisma
              .$transaction(async (tx) => {
                const code = `SE${(++roomCounter).toString().padStart(4, "0")}`;
                const room = await tx.room.create({
                  data: { code, status: "in-progress" },
                });

                const playerId = `test-excl-${roomCounter}`;
                const regionA = regionIds[0];
                const regionB = regionIds[1];
                const locationsInA = locationsByRegion.get(regionA)!;
                const locationsInB = locationsByRegion.get(regionB)!;

                // Determine player's location
                let playerLocationId: string;
                if (hasPendingReward && isInDifferentRegion) {
                  // Case 1: player in different region from pending reward
                  playerLocationId = locationsInB[0].id;
                } else if (isAtSpyLocation && !hasPendingReward) {
                  // Case 4: at the spy's location
                  playerLocationId = locationsInA[0].id;
                } else {
                  // Cases 2, 3, 5: player in regionA
                  playerLocationId =
                    locationsInA.length > 1
                      ? locationsInA[1].id
                      : locationsInA[0].id;
                }

                // Get player's region
                const playerLoc = allLocations.find(
                  (l) => l.id === playerLocationId
                )!;
                const playerRegionId = playerLoc.regionId;

                // Setup spy in player's current region
                const spyLocationInRegion =
                  playerRegionId === regionA
                    ? locationsInA[0]
                    : locationsInB[0];

                // For Case 4: set spy at player's exact location if applicable
                const spyLocId =
                  !hasPendingReward && isAtSpyLocation
                    ? playerLocationId
                    : spyLocationInRegion.id;

                const spy = await tx.gameSpy.create({
                  data: {
                    roomId: room.id,
                    regionId: playerRegionId,
                    locationId: spyLocId,
                  },
                });

                // If the spy should be "captured by this player", add a SpyCapture row
                if (hasPendingReward || isSpyCapturedByThisPlayer) {
                  await tx.spyCapture.create({
                    data: {
                      roomId: room.id,
                      spyId: spy.id,
                      playerId,
                      captureOrder: 1,
                    },
                  });
                }

                // If pending reward is in a different region, also create spy there
                if (hasPendingReward && isInDifferentRegion) {
                  const pendingRegion =
                    playerRegionId === regionA ? regionB : regionA;
                  // Only create if not same as player's current region spy
                  if (pendingRegion !== playerRegionId) {
                    const pendingRegionLocs =
                      locationsByRegion.get(pendingRegion)!;
                    const pendingSpy = await tx.gameSpy.create({
                      data: {
                        roomId: room.id,
                        regionId: pendingRegion,
                        locationId: pendingRegionLocs[0].id,
                      },
                    });
                    await tx.spyCapture.create({
                      data: {
                        roomId: room.id,
                        spyId: pendingSpy.id,
                        playerId,
                        captureOrder: 1,
                      },
                    });
                  }
                }

                // Create player position
                const pendingRewardRegionId = hasPendingReward
                  ? isInDifferentRegion
                    ? playerRegionId === regionA
                      ? regionB
                      : regionA
                    : playerRegionId
                  : null;

                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId,
                    locationId: playerLocationId,
                    skipNextTurn: false,
                    pendingRewardRegionId,
                    pendingRewardCaptureOrder: hasPendingReward
                      ? captureOrder
                      : null,
                  },
                });

                const result = await resolveSpyAndReward(
                  room.id,
                  playerId,
                  playerLocationId,
                  1,
                  tx
                );

                // The result type must be exactly one of the valid outcomes
                const validTypes = [
                  "spy-captured-reward-collected",
                  "none",
                  "spy-captured",
                  "clue",
                ];
                expect(validTypes).toContain(result.type);

                // Exactly one type returned (not multiple or zero)
                const matchCount = validTypes.filter(
                  (t) => t === result.type
                ).length;
                expect(matchCount).toBe(1);

                throw new Error("ROLLBACK");
              }, { timeout: 15000 })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 50 }
      );
    }, 300000);
  });

  describe("Property 15: Reward Tier Mapping", () => {
    // **Validates: Requirements 10.1, 10.3**

    it("captureOrder maps to correct card count: 1→4, 2→3, 3→2, 4-6→1", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          (captureOrder: number) => {
            const tier = computeRewardTier(captureOrder);

            switch (captureOrder) {
              case 1:
                expect(tier).toBe(4);
                break;
              case 2:
                expect(tier).toBe(3);
                break;
              case 3:
                expect(tier).toBe(2);
                break;
              default:
                // 4, 5, 6
                expect(tier).toBe(1);
                break;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("reward tier is always >= 1 for any valid capture order", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // even beyond expected range
          (captureOrder: number) => {
            const tier = computeRewardTier(captureOrder);
            expect(tier).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("reward tier is monotonically non-increasing with capture order", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 99 }),
          (captureOrder: number) => {
            const tierCurrent = computeRewardTier(captureOrder);
            const tierNext = computeRewardTier(captureOrder + 1);
            expect(tierCurrent).toBeGreaterThanOrEqual(tierNext);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("when reward cards are granted, at least 1 is of type locator", async () => {
      const regionIds = Array.from(locationsByRegion.keys());

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 6 }), // captureOrder determines rewardTier
          async (captureOrder: number) => {
            await prisma
              .$transaction(async (tx) => {
                const code = `RT${(++roomCounter).toString().padStart(4, "0")}`;

                const room = await tx.room.create({
                  data: { code, status: "in-progress" },
                });

                const playerId = `test-reward-${roomCounter}`;
                const regionA = regionIds[0];
                const regionB = regionIds[1];
                const locationsInA = locationsByRegion.get(regionA)!;
                const locationsInB = locationsByRegion.get(regionB)!;

                // Setup: player has a pending reward from regionA and is now in regionB
                // This triggers Case 1 which grants reward cards
                const playerLocationId = locationsInB[0].id;

                // Create spy in regionA (captured by this player)
                const spyA = await tx.gameSpy.create({
                  data: {
                    roomId: room.id,
                    regionId: regionA,
                    locationId: locationsInA[0].id,
                  },
                });
                await tx.spyCapture.create({
                  data: {
                    roomId: room.id,
                    spyId: spyA.id,
                    playerId,
                    captureOrder: 1,
                  },
                });

                // Create spy in regionB (player's current region) to avoid errors
                await tx.gameSpy.create({
                  data: {
                    roomId: room.id,
                    regionId: regionB,
                    locationId: locationsInB[locationsInB.length - 1].id,
                  },
                });

                // Set up previously captured spies to establish the captureOrder
                // We need (captureOrder - 1) already-captured spies to get the desired order
                // NOTE: captureOrder is stored on pendingRewardCaptureOrder; we don't need
                // to pre-create extra SpyCapture rows just to influence Case 1.

                // Create player position with pending reward
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId,
                    locationId: playerLocationId,
                    skipNextTurn: false,
                    pendingRewardRegionId: regionA,
                    pendingRewardCaptureOrder: captureOrder,
                  },
                });

                // Resolve — should trigger Case 1 (reward collection)
                const result = await resolveSpyAndReward(
                  room.id,
                  playerId,
                  playerLocationId,
                  1,
                  tx
                );

                expect(result.type).toBe("spy-captured-reward-collected");
                expect(result.rewardTier).toBe(
                  computeRewardTier(captureOrder)
                );

                // Verify granted cards include at least 1 locator
                const grantedCards = await tx.actionCard.findMany({
                  where: { roomId: room.id, playerId, consumed: false },
                });

                const expectedCardCount = Math.min(
                  computeRewardTier(captureOrder),
                  5
                ); // max hand size capped at 5
                expect(grantedCards.length).toBe(expectedCardCount);

                const locatorCards = grantedCards.filter(
                  (c) => c.type === "locator"
                );
                expect(locatorCards.length).toBeGreaterThanOrEqual(1);

                throw new Error("ROLLBACK");
              }, { timeout: 15000 })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 30 }
      );
    }, 300000);

    it("reward cards respect max hand size of 5", async () => {
      const regionIds = Array.from(locationsByRegion.keys());

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }), // existing cards in hand
          fc.integer({ min: 1, max: 6 }), // captureOrder
          async (existingCards: number, captureOrder: number) => {
            await prisma
              .$transaction(async (tx) => {
                const code = `RH${(++roomCounter).toString().padStart(4, "0")}`;
                const room = await tx.room.create({
                  data: { code, status: "in-progress" },
                });

                const playerId = `test-hand-${roomCounter}`;
                const regionA = regionIds[0];
                const regionB = regionIds[1];
                const locationsInA = locationsByRegion.get(regionA)!;
                const locationsInB = locationsByRegion.get(regionB)!;

                const playerLocationId = locationsInB[0].id;

                // Create spy in regionA (captured by this player)
                const spyA = await tx.gameSpy.create({
                  data: {
                    roomId: room.id,
                    regionId: regionA,
                    locationId: locationsInA[0].id,
                  },
                });
                await tx.spyCapture.create({
                  data: {
                    roomId: room.id,
                    spyId: spyA.id,
                    playerId,
                    captureOrder: 1,
                  },
                });

                // Create spy in regionB
                await tx.gameSpy.create({
                  data: {
                    roomId: room.id,
                    regionId: regionB,
                    locationId: locationsInB[locationsInB.length - 1].id,
                  },
                });

                // Create existing cards in hand
                for (let i = 0; i < existingCards; i++) {
                  await tx.actionCard.create({
                    data: {
                      roomId: room.id,
                      playerId,
                      type: "extra-move",
                      consumed: false,
                    },
                  });
                }

                // Create player position with pending reward
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId,
                    locationId: playerLocationId,
                    skipNextTurn: false,
                    pendingRewardRegionId: regionA,
                    pendingRewardCaptureOrder: captureOrder,
                  },
                });

                // Resolve — triggers Case 1
                const result = await resolveSpyAndReward(
                  room.id,
                  playerId,
                  playerLocationId,
                  1,
                  tx
                );

                expect(result.type).toBe("spy-captured-reward-collected");

                // Check total hand size does not exceed 5
                const totalCards = await tx.actionCard.count({
                  where: { roomId: room.id, playerId, consumed: false },
                });

                expect(totalCards).toBeLessThanOrEqual(5);

                // Expected: min(rewardTier, 5 - existingCards) new cards added
                const rewardTier = computeRewardTier(captureOrder);
                const expectedNew = Math.max(
                  0,
                  Math.min(rewardTier, 5 - existingCards)
                );
                expect(totalCards).toBe(existingCards + expectedNew);

                // If any cards were granted, at least 1 must be locator
                if (expectedNew > 0) {
                  const locators = await tx.actionCard.count({
                    where: {
                      roomId: room.id,
                      playerId,
                      type: "locator",
                      consumed: false,
                    },
                  });
                  expect(locators).toBeGreaterThanOrEqual(1);
                }

                throw new Error("ROLLBACK");
              }, { timeout: 15000 })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 30 }
      );
    }, 300000);
  });
});
