// Feature: action-cards
// Property 21: Spy Proximity Preservation
// **Validates: Requirements 15.2**
//
// For any game sequence, `spy-proximity` entries produced with the card system enabled
// are identical to those produced by the existing Spy resolution path using the
// Spy_Distance_Utility.
//
// Key insight: The spy-proximity clue generation path (in resolveSpyAndReward, Case 5)
// was NOT modified by the card system. It still uses computeSpyDistance from
// lib/turn-engine/spy-distance.ts. This test verifies:
// 1. spy-proximity entries are still produced by the existing path (not the card system)
// 2. The spy resolution function still creates spy-proximity entries using the Spy_Distance_Utility
// 3. The card system's round-end resolver does NOT produce spy-proximity entries
//    (it only produces mastermind_distance, mastermind_direction, phone_bug)

import fc from "fast-check";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveRoundEnd } from "@/lib/turn-engine/resolution/resolve-round-end";
import type { TransactionClient } from "@/lib/turn-engine/types";

// Mock spy-distance at the top level so it's intercepted before resolve-spy-reward loads it
vi.mock("@/lib/turn-engine/spy-distance", () => ({
  computeSpyDistance: vi.fn().mockResolvedValue(4),
  resetSpyDistanceMatrix: vi.fn(),
  initializeSpyDistanceMatrix: vi.fn(),
}));

// Mock distance utility for round-end resolver tests
vi.mock("@/lib/map/distance", () => ({
  getShortestPathDistance: vi.fn().mockResolvedValue(3),
}));

// Import AFTER mocks are set up
import { resolveSpyAndReward } from "@/lib/turn-engine/resolution/resolve-spy-reward";
import { computeSpyDistance } from "@/lib/turn-engine/spy-distance";
import { getShortestPathDistance } from "@/lib/map/distance";

// --- Mock Helpers ---

/**
 * Creates a mock transaction client configured for Case 5 of resolveSpyAndReward:
 * Player is in a region with an uncaptured Spy, but NOT at the Spy's exact location.
 * This triggers a spy-proximity notebook entry.
 */
function createCase5MockTx(options: {
  playerLocationId: string;
  playerRegionId: string;
  spyLocationId: string;
}) {
  const notebookEntries: Array<{
    roomId: string;
    playerId: string;
    entryType: string;
    regionId?: string;
    roundNumber: number;
    stepsAway?: number;
    payload?: unknown;
  }> = [];

  const mockTx = {
    location: {
      findUnique: vi.fn().mockResolvedValue({
        regionId: options.playerRegionId,
      }),
    },
    playerPosition: {
      findUnique: vi.fn().mockResolvedValue({
        pendingRewardRegionId: null,
        pendingRewardCaptureOrder: null,
      }),
    },
    gameSpy: {
      findFirst: vi.fn().mockResolvedValue({
        id: "spy-1",
        roomId: "room-1",
        regionId: options.playerRegionId,
        locationId: options.spyLocationId,
        captured: false,
        capturedByPlayerId: null,
      }),
      count: vi.fn().mockResolvedValue(0),
    },
    notebookEntry: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        notebookEntries.push(data);
        return { id: `entry-${notebookEntries.length}`, ...data };
      }),
    },
    gameEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as TransactionClient;

  return { mockTx, notebookEntries };
}

/**
 * Creates a mock transaction client for resolveRoundEnd that simulates
 * pending clues. Tracks all notebook entries created.
 */
function createRoundEndMockTx(options: {
  pendingClues: Array<{
    id: string;
    roomId: string;
    playerId: string;
    cardIdentifier: string;
    roundNumber: number;
    originLocationId: string;
    resolved: boolean;
  }>;
  mastermindLocationId: string;
  players: Array<{ playerId: string; status: string; locationId: string; regionId: string }>;
}) {
  const notebookEntries: Array<{
    roomId: string;
    playerId: string;
    entryType: string;
    roundNumber: number;
    payload?: unknown;
  }> = [];

  const mockTx = {
    room: {
      findUnique: vi.fn().mockResolvedValue({ status: "in-progress" }),
    },
    pendingClue: {
      findMany: vi.fn().mockResolvedValue(options.pendingClues),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    gameThreat: {
      findUnique: vi.fn().mockResolvedValue({
        roomId: "room-1",
        locationId: options.mastermindLocationId,
      }),
    },
    roomPlayer: {
      findMany: vi.fn().mockResolvedValue(
        options.players.map((p) => ({
          playerId: p.playerId,
          status: p.status,
          roomId: "room-1",
        }))
      ),
    },
    playerPosition: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const player = options.players.find(
          (p) => p.playerId === where.roomId_playerId.playerId
        );
        return player ? { locationId: player.locationId } : null;
      }),
    },
    location: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const player = options.players.find((p) => p.locationId === where.id);
        return player
          ? { id: where.id, regionId: player.regionId }
          : { id: where.id, regionId: "unknown-region" };
      }),
    },
    adjacency: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    gameSpy: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    notebookEntry: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        notebookEntries.push(data);
        return { id: `entry-${notebookEntries.length}`, ...data };
      }),
    },
  } as unknown as TransactionClient;

  return { mockTx, notebookEntries };
}

// --- Arbitraries ---

/** Round number from 1 to 20 */
const arbRoundNumber = fc.integer({ min: 1, max: 20 });

/** Spy distance mock return value (steps) */
const arbSpySteps = fc.integer({ min: 1, max: 12 });

/** Card identifiers for end-of-round clue cards */
const arbClueCardIdentifier = fc.constantFrom(
  "locate-the-mastermind",
  "bug-a-phone",
  "reveal-direction"
);

/** RNG value in [0, 1) */
const arbRng = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });

describe("Property 21: Spy Proximity Preservation", () => {
  // **Validates: Requirements 15.2**

  beforeEach(() => {
    vi.mocked(computeSpyDistance).mockReset().mockResolvedValue(4);
    vi.mocked(getShortestPathDistance).mockReset().mockResolvedValue(3);
  });

  describe("spy-proximity entries are produced by the existing Spy resolution path (Case 5 of resolveSpyAndReward)", () => {
    it("for any player/spy configuration triggering Case 5, the notebook entry has entryType spy-proximity and uses computeSpyDistance", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoundNumber,
          arbSpySteps,
          async (roundNumber, expectedSteps) => {
            vi.mocked(computeSpyDistance).mockResolvedValue(expectedSteps);

            const playerLocationId = "player-loc-1";
            const spyLocationId = "spy-loc-1";
            const regionId = "region-shared";

            const { mockTx, notebookEntries } = createCase5MockTx({
              playerLocationId,
              playerRegionId: regionId,
              spyLocationId,
            });

            const result = await resolveSpyAndReward(
              "room-1",
              "player-1",
              playerLocationId,
              roundNumber,
              mockTx
            );

            // Verify Case 5 fired
            expect(result.type).toBe("clue");

            // Verify the notebook entry is spy-proximity type
            expect(notebookEntries).toHaveLength(1);
            const entry = notebookEntries[0];
            expect(entry.entryType).toBe("spy-proximity");
            expect(entry.regionId).toBe(regionId);
            expect(entry.roundNumber).toBe(roundNumber);
            expect(entry.stepsAway).toBe(expectedSteps);

            // Verify computeSpyDistance was called (the Spy_Distance_Utility)
            expect(computeSpyDistance).toHaveBeenCalledWith(playerLocationId, spyLocationId);

            // Verify: no mastermind_distance, mastermind_direction, or phone_bug entries
            const nonSpyEntries = notebookEntries.filter(
              (e) => e.entryType !== "spy-proximity"
            );
            expect(nonSpyEntries).toHaveLength(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it("spy-proximity entries use direct columns (regionId, roundNumber, stepsAway) not payload JSON", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoundNumber,
          arbSpySteps,
          async (roundNumber, stepsAway) => {
            vi.mocked(computeSpyDistance).mockResolvedValue(stepsAway);

            const playerLocationId = "player-loc-X";
            const spyLocationId = "spy-loc-X";
            const regionId = "region-test";

            const { mockTx, notebookEntries } = createCase5MockTx({
              playerLocationId,
              playerRegionId: regionId,
              spyLocationId,
            });

            await resolveSpyAndReward(
              "room-1",
              "player-1",
              playerLocationId,
              roundNumber,
              mockTx
            );

            expect(notebookEntries).toHaveLength(1);
            const entry = notebookEntries[0];

            // spy-proximity entries use direct columns, not the payload JSON field
            expect(entry.entryType).toBe("spy-proximity");
            expect(entry.regionId).toBeDefined();
            expect(entry.roundNumber).toBeDefined();
            expect(entry.stepsAway).toBeDefined();
            // Should NOT have a payload field (that's for mastermind_distance, etc.)
            expect(entry.payload).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("spy-proximity uses computeSpyDistance (car/boat BFS), not getShortestPathDistance (full graph)", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoundNumber,
          async (roundNumber) => {
            // Set different return values so we can distinguish which was used
            vi.mocked(computeSpyDistance).mockResolvedValue(7);
            vi.mocked(getShortestPathDistance).mockResolvedValue(2);

            const playerLocationId = "player-loc-Z";
            const spyLocationId = "spy-loc-Z";
            const regionId = "region-Z";

            const { mockTx, notebookEntries } = createCase5MockTx({
              playerLocationId,
              playerRegionId: regionId,
              spyLocationId,
            });

            await resolveSpyAndReward(
              "room-1",
              "player-1",
              playerLocationId,
              roundNumber,
              mockTx
            );

            // computeSpyDistance MUST be called (spy-proximity uses car/boat-only BFS)
            expect(computeSpyDistance).toHaveBeenCalledWith(playerLocationId, spyLocationId);

            // getShortestPathDistance must NOT be called by spy resolution
            expect(getShortestPathDistance).not.toHaveBeenCalled();

            // The entry's stepsAway must match the spy distance (7), not full graph (2)
            expect(notebookEntries).toHaveLength(1);
            expect(notebookEntries[0].stepsAway).toBe(7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("the Round End Resolver does NOT produce spy-proximity entries", () => {
    it("for any set of pending clues (locate-the-mastermind, bug-a-phone, reveal-direction), no spy-proximity entry is created", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbClueCardIdentifier, { minLength: 1, maxLength: 5 }),
          arbRoundNumber,
          arbRng,
          async (cardIdentifiers, roundNumber, rngValue) => {
            vi.mocked(getShortestPathDistance).mockResolvedValue(3);

            const mastermindLocationId = "mastermind-loc";
            const playerId = "player-1";
            const otherPlayerId = "player-2";

            const pendingClues = cardIdentifiers.map((cardId, i) => ({
              id: `clue-${i}`,
              roomId: "room-1",
              playerId,
              cardIdentifier: cardId,
              roundNumber,
              originLocationId: `origin-loc-${i}`,
              resolved: false,
            }));

            const { mockTx, notebookEntries } = createRoundEndMockTx({
              pendingClues,
              mastermindLocationId,
              players: [
                { playerId, status: "connected", locationId: "loc-p1", regionId: "region-1" },
                { playerId: otherPlayerId, status: "connected", locationId: "loc-p2", regionId: "region-2" },
              ],
            });

            const rng = () => rngValue;

            await resolveRoundEnd("room-1", roundNumber, mockTx, rng);

            // CRITICAL: No spy-proximity entries should be produced by the round-end resolver
            const spyProximityEntries = notebookEntries.filter(
              (e) => e.entryType === "spy-proximity"
            );
            expect(spyProximityEntries).toHaveLength(0);

            // All entries produced must be one of the three card-system types
            for (const entry of notebookEntries) {
              expect(["mastermind_distance", "mastermind_direction", "phone_bug"]).toContain(
                entry.entryType
              );
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it("the round-end resolver only produces mastermind_distance, mastermind_direction, or phone_bug entries regardless of card mix", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              cardIdentifier: arbClueCardIdentifier,
              originLocationId: fc.constantFrom("loc-A", "loc-B", "loc-C", "loc-D"),
            }),
            { minLength: 1, maxLength: 8 }
          ),
          arbRoundNumber,
          arbRng,
          async (clueConfigs, roundNumber, rngValue) => {
            vi.mocked(getShortestPathDistance).mockResolvedValue(2);

            const pendingClues = clueConfigs.map((cfg, i) => ({
              id: `clue-${i}`,
              roomId: "room-1",
              playerId: "player-1",
              cardIdentifier: cfg.cardIdentifier,
              roundNumber,
              originLocationId: cfg.originLocationId,
              resolved: false,
            }));

            const { mockTx, notebookEntries } = createRoundEndMockTx({
              pendingClues,
              mastermindLocationId: "mastermind-loc",
              players: [
                { playerId: "player-1", status: "connected", locationId: "loc-p1", regionId: "region-1" },
                { playerId: "player-2", status: "connected", locationId: "loc-p2", regionId: "region-2" },
                { playerId: "player-3", status: "connected", locationId: "loc-p3", regionId: "region-3" },
              ],
            });

            await resolveRoundEnd("room-1", roundNumber, mockTx, () => rngValue);

            // The allowed entry types from the round-end resolver
            const allowedRoundEndTypes = new Set([
              "mastermind_distance",
              "mastermind_direction",
              "phone_bug",
            ]);

            for (const entry of notebookEntries) {
              expect(allowedRoundEndTypes.has(entry.entryType)).toBe(true);
            }

            // Specifically: spy-proximity must never appear
            expect(notebookEntries.some((e) => e.entryType === "spy-proximity")).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
