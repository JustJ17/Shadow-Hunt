// Feature: action-cards
// Property 16: Bug a Phone Distance Correctness
// **Validates: Requirements 12.6**

import fc from "fast-check";
import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * Property 16: Bug a Phone Distance Correctness
 *
 * For any `bug-a-phone` resolution, `mastermindStepsAway` equals
 * `getShortestPathDistance(targetLocationId, mastermindLocationId)`.
 *
 * Test approach: Mock `getShortestPathDistance` from `@/lib/map/distance`
 * using vi.mock. Set up a bug-a-phone PendingClue, run resolveRoundEnd,
 * and verify the phone_bug notebook entry's `mastermindStepsAway` equals
 * what the mocked distance function returns for (targetLocationId, mastermindLocationId).
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
 * and a single target player. Tracks notebook entries created during resolution.
 */
function buildMockTx(params: {
  roomId: string;
  playerId: string;
  targetPlayerId: string;
  targetLocationId: string;
  targetRegionId: string;
  mastermindLocationId: string;
  roundNumber: number;
}) {
  const notebookEntries: NotebookEntryData[] = [];

  const pendingClue = {
    id: "pending-clue-1",
    roomId: params.roomId,
    playerId: params.playerId,
    cardIdentifier: "bug-a-phone",
    roundNumber: params.roundNumber,
    originLocationId: "origin-loc-irrelevant",
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
        roomId: params.roomId,
        locationId: params.mastermindLocationId,
      }),
    },
    roomPlayer: {
      findMany: vi.fn().mockResolvedValue([
        { playerId: params.playerId, status: "connected" },
        { playerId: params.targetPlayerId, status: "connected" },
      ]),
    },
    playerPosition: {
      findUnique: vi.fn().mockResolvedValue({
        roomId: params.roomId,
        playerId: params.targetPlayerId,
        locationId: params.targetLocationId,
      }),
    },
    location: {
      findUnique: vi.fn().mockResolvedValue({
        id: params.targetLocationId,
        regionId: params.targetRegionId,
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
  } as unknown as Parameters<typeof resolveRoundEnd>[2];

  return { tx, notebookEntries };
}

describe("Bug a Phone Distance Correctness — Property 16", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * For any target location and mastermind location, the phone_bug notebook
   * entry's mastermindStepsAway must equal the value returned by
   * getShortestPathDistance(targetLocationId, mastermindLocationId).
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
          // Players must be different (bug-a-phone targets a different player)
          fc.pre(playerId !== targetPlayerId);

          // Configure the mock to return the oracle distance
          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = buildMockTx({
            roomId,
            playerId,
            targetPlayerId,
            targetLocationId,
            targetRegionId,
            mastermindLocationId,
            roundNumber,
          });

          // rng = 0 selects the only other player (index 0 of pool with 1 element)
          await resolveRoundEnd(roomId, roundNumber, tx, () => 0);

          // Exactly one notebook entry should be created
          expect(notebookEntries).toHaveLength(1);

          const entry = notebookEntries[0];
          expect(entry.entryType).toBe("phone_bug");
          expect(entry.playerId).toBe(playerId);

          const payload = entry.payload as {
            type: string;
            mastermindStepsAway: number;
            targetLocationId: string;
          };

          // Core property: mastermindStepsAway equals the distance oracle
          expect(payload.mastermindStepsAway).toBe(oracleDistance);

          // Verify getShortestPathDistance was called with (targetLocationId, mastermindLocationId)
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
   * The payload's targetLocationId always matches the target player's
   * actual position, confirming that the distance computation uses the
   * target's current location (not the caster's origin).
   */
  it("distance is computed from target player's current location", async () => {
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

          const { tx, notebookEntries } = buildMockTx({
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

          // The recorded target location matches the target's position
          expect(payload.targetLocationId).toBe(targetLocationId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
