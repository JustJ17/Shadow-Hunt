// Feature: action-cards
// Property 16: Bug a Phone Distance Correctness
// **Validates: Requirements 12.6**

import fc from "fast-check";
import { vi } from "vitest";

/**
 * Property 16: Bug a Phone Distance Correctness
 *
 * For any `bug-a-phone` resolution, `mastermindStepsAway` equals
 * `getShortestPathDistance(targetLocationId, mastermindLocationId)`.
 *
 * Test approach: Mock `getShortestPathDistance` to return a controlled oracle
 * distance, then run `resolveRoundEnd` with a bug-a-phone PendingClue.
 * Verify the phone_bug notebook entry's mastermindStepsAway matches the oracle.
 */

// Mock the distance module before importing resolve-round-end
vi.mock("@/lib/map/distance", () => ({
  getShortestPathDistance: vi.fn(),
}));

import { resolveRoundEnd } from "@/lib/turn-engine/resolution/resolve-round-end";
import { getShortestPathDistance } from "@/lib/map/distance";

const mockedGetShortestPathDistance = vi.mocked(getShortestPathDistance);

// --- Mock Transaction Builder ---

interface NotebookEntryData {
  roomId: string;
  playerId: string;
  entryType: string;
  roundNumber: number;
  payload: Record<string, unknown>;
}

/**
 * Creates a mock transaction client configured with a bug-a-phone PendingClue
 * and target player data. Tracks notebook entries created during resolution.
 */
function createMockTx(options: {
  roomId: string;
  playerId: string;
  targetPlayerId: string;
  targetLocationId: string;
  targetRegionId: string;
  mastermindLocationId: string;
  roundNumber: number;
  targetStatus?: string;
}) {
  const notebookEntries: NotebookEntryData[] = [];

  const pendingClue = {
    id: "clue-1",
    roomId: options.roomId,
    playerId: options.playerId,
    cardIdentifier: "bug-a-phone",
    roundNumber: options.roundNumber,
    originLocationId: "origin-does-not-matter-for-bug-a-phone",
    resolved: false,
  };

  const tx = {
    room: {
      findUnique: vi.fn().mockResolvedValue({ status: "in-progress" }),
    },
    pendingClue: {
      findMany: vi.fn().mockResolvedValue([pendingClue]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    gameThreat: {
      findUnique: vi.fn().mockResolvedValue({
        roomId: options.roomId,
        locationId: options.mastermindLocationId,
      }),
    },
    roomPlayer: {
      findMany: vi.fn().mockResolvedValue([
        { playerId: options.playerId, status: "connected" },
        { playerId: options.targetPlayerId, status: options.targetStatus ?? "connected" },
      ]),
    },
    playerPosition: {
      findUnique: vi.fn().mockResolvedValue({
        roomId: options.roomId,
        playerId: options.targetPlayerId,
        locationId: options.targetLocationId,
      }),
    },
    location: {
      findUnique: vi.fn().mockResolvedValue({
        id: options.targetLocationId,
        regionId: options.targetRegionId,
      }),
    },
    gameSpy: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    notebookEntry: {
      create: vi.fn().mockImplementation(({ data }: { data: NotebookEntryData }) => {
        notebookEntries.push(data);
        return Promise.resolve({ id: `entry-${notebookEntries.length}`, ...data });
      }),
    },
  } as any;

  return { tx, notebookEntries };
}

describe("Bug a Phone Distance Correctness — Property 16", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * For any target player location and mastermind location, the resolved
   * phone_bug notebook entry's mastermindStepsAway must equal the oracle
   * distance returned by getShortestPathDistance(targetLocationId, mastermindLocationId).
   */
  it("mastermindStepsAway equals getShortestPathDistance(targetLocationId, mastermindLocationId)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId (caster)
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 0, max: 6 }), // oracle distance
        fc.integer({ min: 1, max: 50 }), // roundNumber
        async (
          roomId,
          playerId,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          mastermindLocationId,
          oracleDistance,
          roundNumber
        ) => {
          // Ensure playerId and targetPlayerId differ (required by bug-a-phone logic)
          fc.pre(playerId !== targetPlayerId);

          // Configure the mock to return the oracle distance for target -> mastermind
          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = createMockTx({
            roomId,
            playerId,
            targetPlayerId,
            targetLocationId,
            targetRegionId,
            mastermindLocationId,
            roundNumber,
          });

          // Use fixed rng to select the only other player (index 0 of pool with 1 element)
          await resolveRoundEnd(roomId, roundNumber, tx, () => 0);

          // Exactly one notebook entry should be created
          expect(notebookEntries).toHaveLength(1);

          const entry = notebookEntries[0];
          expect(entry.entryType).toBe("phone_bug");
          expect(entry.playerId).toBe(playerId);
          expect(entry.roomId).toBe(roomId);

          // The mastermindStepsAway in the payload must equal the oracle distance
          const payload = entry.payload as {
            type: string;
            roundNumber: number;
            targetPlayerId: string;
            targetLocationId: string;
            mastermindStepsAway: number;
            spyRegionId: string | null;
            spyCaptured: boolean;
          };
          expect(payload.mastermindStepsAway).toBe(oracleDistance);

          // Verify getShortestPathDistance was called with target location and mastermind location
          expect(mockedGetShortestPathDistance).toHaveBeenCalledWith(
            targetLocationId,
            mastermindLocationId
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * The mastermindStepsAway value always lies within [0, 6] given valid
   * distance utility output, matching the map's graph diameter.
   */
  it("mastermindStepsAway is always within [0, 6]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 0, max: 6 }), // valid distance within graph diameter
        fc.integer({ min: 1, max: 50 }), // roundNumber
        async (
          roomId,
          playerId,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          mastermindLocationId,
          oracleDistance,
          roundNumber
        ) => {
          fc.pre(playerId !== targetPlayerId);

          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = createMockTx({
            roomId,
            playerId,
            targetPlayerId,
            targetLocationId,
            targetRegionId,
            mastermindLocationId,
            roundNumber,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => 0);

          expect(notebookEntries).toHaveLength(1);

          const payload = notebookEntries[0].payload as { mastermindStepsAway: number };
          expect(payload.mastermindStepsAway).toBeGreaterThanOrEqual(0);
          expect(payload.mastermindStepsAway).toBeLessThanOrEqual(6);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * The distance computation uses the target's current position (at resolution
   * time), not the caster's origin location. Verify targetLocationId in the
   * payload matches the target player's position.
   */
  it("distance is computed from target's location, not from caster's origin", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 0, max: 6 }), // oracle distance
        fc.integer({ min: 1, max: 50 }), // roundNumber
        async (
          roomId,
          playerId,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          mastermindLocationId,
          oracleDistance,
          roundNumber
        ) => {
          fc.pre(playerId !== targetPlayerId);

          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = createMockTx({
            roomId,
            playerId,
            targetPlayerId,
            targetLocationId,
            targetRegionId,
            mastermindLocationId,
            roundNumber,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => 0);

          expect(notebookEntries).toHaveLength(1);

          const payload = notebookEntries[0].payload as {
            targetLocationId: string;
          };
          // The payload should record the target's location
          expect(payload.targetLocationId).toBe(targetLocationId);

          // And the distance call should use that target location, not the origin
          expect(mockedGetShortestPathDistance).toHaveBeenCalledWith(
            targetLocationId,
            mastermindLocationId
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
