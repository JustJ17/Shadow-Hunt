// Feature: action-cards
// Property 11: Mastermind Distance Correctness
// **Validates: Requirements 11.2, 11.3, 11.6**

import fc from "fast-check";
import { vi } from "vitest";

/**
 * Property 11: Mastermind Distance Correctness
 *
 * For any `locate-the-mastermind` resolution, the resulting `stepsAway` value
 * equals `getShortestPathDistance(entry.locationId, mastermindLocationId)` and
 * lies within [0, 6].
 *
 * Test approach: Mock `getShortestPathDistance` to return a controlled oracle
 * distance, then run `resolveRoundEnd` with a locate-the-mastermind PendingClue.
 * Verify the notebook entry's stepsAway matches the oracle and is within [0, 6].
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
 * Creates a mock transaction client configured with a locate-the-mastermind
 * PendingClue and tracks notebook entries created during resolution.
 */
function createMockTx(options: {
  roomId: string;
  playerId: string;
  originLocationId: string;
  mastermindLocationId: string;
  roundNumber: number;
}) {
  const notebookEntries: NotebookEntryData[] = [];

  const pendingClue = {
    id: "clue-1",
    roomId: options.roomId,
    playerId: options.playerId,
    cardIdentifier: "locate-the-mastermind",
    roundNumber: options.roundNumber,
    originLocationId: options.originLocationId,
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
    notebookEntry: {
      create: vi.fn().mockImplementation(({ data }: { data: NotebookEntryData }) => {
        notebookEntries.push(data);
        return Promise.resolve({ id: `entry-${notebookEntries.length}`, ...data });
      }),
    },
  } as any;

  return { tx, notebookEntries };
}

describe("Mastermind Distance Correctness — Property 11", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 11.2, 11.3, 11.6**
   *
   * For any (originLocation, mastermindLocation) pair with an oracle distance
   * in [0, 6], the resolveRoundEnd function stores exactly that distance
   * in the notebook entry's stepsAway field.
   */
  it("stepsAway equals the oracle distance from getShortestPathDistance", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.uuid(), // originLocationId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 0, max: 6 }), // oracle distance
        fc.integer({ min: 1, max: 50 }), // roundNumber
        async (
          roomId,
          playerId,
          originLocationId,
          mastermindLocationId,
          oracleDistance,
          roundNumber
        ) => {
          // Configure the mock to return the oracle distance
          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = createMockTx({
            roomId,
            playerId,
            originLocationId,
            mastermindLocationId,
            roundNumber,
          });

          await resolveRoundEnd(roomId, roundNumber, tx);

          // Exactly one notebook entry should be created
          expect(notebookEntries).toHaveLength(1);

          const entry = notebookEntries[0];
          expect(entry.entryType).toBe("mastermind_distance");
          expect(entry.playerId).toBe(playerId);
          expect(entry.roomId).toBe(roomId);
          expect(entry.roundNumber).toBe(roundNumber);

          // The stepsAway in the payload must equal the oracle distance
          const payload = entry.payload as {
            type: string;
            locationId: string;
            roundNumber: number;
            stepsAway: number;
          };
          expect(payload.stepsAway).toBe(oracleDistance);

          // Verify getShortestPathDistance was called with correct arguments
          expect(mockedGetShortestPathDistance).toHaveBeenCalledWith(
            originLocationId,
            mastermindLocationId
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 11.6**
   *
   * The stepsAway value always lies within [0, 6], matching the graph diameter.
   * Since getShortestPathDistance is validated to produce [0, 6] values, the
   * resolver should faithfully store whatever the distance utility returns.
   */
  it("stepsAway is always within [0, 6]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.uuid(), // originLocationId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 0, max: 6 }), // valid distance within graph diameter
        fc.integer({ min: 1, max: 50 }), // roundNumber
        async (
          roomId,
          playerId,
          originLocationId,
          mastermindLocationId,
          oracleDistance,
          roundNumber
        ) => {
          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = createMockTx({
            roomId,
            playerId,
            originLocationId,
            mastermindLocationId,
            roundNumber,
          });

          await resolveRoundEnd(roomId, roundNumber, tx);

          expect(notebookEntries).toHaveLength(1);

          const payload = notebookEntries[0].payload as { stepsAway: number };
          expect(payload.stepsAway).toBeGreaterThanOrEqual(0);
          expect(payload.stepsAway).toBeLessThanOrEqual(6);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.2, 11.3**
   *
   * The notebook entry's locationId matches the PendingClue's originLocationId,
   * confirming that the distance is computed from the origin (play-time location),
   * not from any other position.
   */
  it("notebook entry locationId equals the PendingClue originLocationId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.uuid(), // originLocationId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 0, max: 6 }), // oracle distance
        fc.integer({ min: 1, max: 50 }), // roundNumber
        async (
          roomId,
          playerId,
          originLocationId,
          mastermindLocationId,
          oracleDistance,
          roundNumber
        ) => {
          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = createMockTx({
            roomId,
            playerId,
            originLocationId,
            mastermindLocationId,
            roundNumber,
          });

          await resolveRoundEnd(roomId, roundNumber, tx);

          expect(notebookEntries).toHaveLength(1);

          const payload = notebookEntries[0].payload as {
            locationId: string;
          };
          expect(payload.locationId).toBe(originLocationId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
