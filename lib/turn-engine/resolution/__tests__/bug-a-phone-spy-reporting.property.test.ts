// Feature: action-cards
// Property 17: Bug a Phone Spy Reporting
// **Validates: Requirements 12.7, 12.8, 12.9**

import fc from "fast-check";
import { vi } from "vitest";

/**
 * Property 17: Bug a Phone Spy Reporting
 *
 * For any `bug-a-phone` resolution, `spyCaptured` is true if and only if the
 * `GameSpy` record for the target's current Region exists and is captured.
 * `spyRegionId` is non-null if and only if a `GameSpy` record exists for the
 * target's Region.
 *
 * Test approach: Mock the transaction with various spy states (exists/uncaptured,
 * exists/captured, no spy). Verify the notebook entry fields match the expected
 * spy status logic from the implementation.
 */

// Mock the distance module before importing resolve-round-end
vi.mock("@/lib/map/distance", () => ({
  getShortestPathDistance: vi.fn(),
}));

import { resolveRoundEnd } from "@/lib/turn-engine/resolution/resolve-round-end";
import { getShortestPathDistance } from "@/lib/map/distance";

const mockedGetShortestPathDistance = vi.mocked(getShortestPathDistance);

// --- Spy state type for generation ---

type SpyState =
  | { kind: "exists-uncaptured" }
  | { kind: "exists-captured" }
  | { kind: "no-spy" };

// --- Mock Transaction Builder ---

interface NotebookEntryData {
  roomId: string;
  playerId: string;
  entryType: string;
  roundNumber: number;
  payload: Record<string, unknown>;
}

/**
 * Creates a mock transaction client configured with a bug-a-phone PendingClue,
 * a target player in a specific region, and a configurable spy state for that region.
 */
function createMockTx(options: {
  roomId: string;
  playerId: string;
  targetPlayerId: string;
  targetLocationId: string;
  targetRegionId: string;
  mastermindLocationId: string;
  roundNumber: number;
  spyState: SpyState;
  rngValue: number;
}) {
  const notebookEntries: NotebookEntryData[] = [];

  const pendingClue = {
    id: "clue-1",
    roomId: options.roomId,
    playerId: options.playerId,
    cardIdentifier: "bug-a-phone",
    roundNumber: options.roundNumber,
    originLocationId: "origin-loc-1", // Not used by bug-a-phone resolution
    resolved: false,
  };

  // The caster and the target player
  const roomPlayers = [
    { playerId: options.playerId, status: "connected" },
    { playerId: options.targetPlayerId, status: "connected" },
  ];

  // Spy record based on spy state
  let spyRecord: { roomId: string; regionId: string; captured: boolean } | null =
    null;
  if (options.spyState.kind === "exists-uncaptured") {
    spyRecord = {
      roomId: options.roomId,
      regionId: options.targetRegionId,
      captured: false,
    };
  } else if (options.spyState.kind === "exists-captured") {
    spyRecord = {
      roomId: options.roomId,
      regionId: options.targetRegionId,
      captured: true,
    };
  }

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
      findMany: vi.fn().mockResolvedValue(roomPlayers),
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
      findFirst: vi.fn().mockResolvedValue(spyRecord),
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

// --- fast-check arbitrary for spy state ---

const arbSpyState: fc.Arbitrary<SpyState> = fc.oneof(
  fc.constant({ kind: "exists-uncaptured" } as SpyState),
  fc.constant({ kind: "exists-captured" } as SpyState),
  fc.constant({ kind: "no-spy" } as SpyState)
);

describe("Bug a Phone Spy Reporting — Property 17", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 12.7, 12.8, 12.9**
   *
   * For any spy state (exists-uncaptured, exists-captured, no-spy):
   * - spyCaptured is true iff the GameSpy record exists AND is captured
   * - spyRegionId is non-null iff a GameSpy record exists for that region
   */
  it("spyCaptured and spyRegionId correctly reflect the spy state in the target's region", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId (caster)
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.integer({ min: 0, max: 6 }), // oracle mastermind distance
        arbSpyState, // spy state
        async (
          roomId,
          playerId,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          mastermindLocationId,
          roundNumber,
          oracleDistance,
          spyState
        ) => {
          // Ensure caster and target are different
          fc.pre(playerId !== targetPlayerId);

          // Configure the distance mock
          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          const { tx, notebookEntries } = createMockTx({
            roomId,
            playerId,
            targetPlayerId,
            targetLocationId,
            targetRegionId,
            mastermindLocationId,
            roundNumber,
            spyState,
            rngValue: 0, // deterministic target selection (first in pool)
          });

          // Use a fixed rng to select the target deterministically
          await resolveRoundEnd(roomId, roundNumber, tx, () => 0);

          // Exactly one notebook entry should be created
          expect(notebookEntries).toHaveLength(1);

          const entry = notebookEntries[0];
          expect(entry.entryType).toBe("phone_bug");

          const payload = entry.payload as {
            type: string;
            roundNumber: number;
            targetPlayerId: string;
            targetLocationId: string;
            mastermindStepsAway: number;
            spyRegionId: string | null;
            spyCaptured: boolean;
          };

          // Verify spy reporting based on state
          switch (spyState.kind) {
            case "exists-uncaptured":
              // Req 12.7: spy exists and is NOT captured → spyRegionId is set, spyCaptured is false
              expect(payload.spyRegionId).toBe(targetRegionId);
              expect(payload.spyCaptured).toBe(false);
              break;

            case "exists-captured":
              // Req 12.8: spy exists and IS captured → spyRegionId is set, spyCaptured is true
              expect(payload.spyRegionId).toBe(targetRegionId);
              expect(payload.spyCaptured).toBe(true);
              break;

            case "no-spy":
              // Req 12.9: no spy record → spyRegionId is null, spyCaptured is false
              expect(payload.spyRegionId).toBeNull();
              expect(payload.spyCaptured).toBe(false);
              break;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 12.7**
   *
   * spyCaptured is true ONLY when a spy exists AND is captured.
   * It should never be true when no spy exists or when the spy is uncaptured.
   */
  it("spyCaptured is true if and only if GameSpy exists and is captured", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.integer({ min: 0, max: 6 }), // oracle distance
        arbSpyState,
        async (
          roomId,
          playerId,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          mastermindLocationId,
          roundNumber,
          oracleDistance,
          spyState
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
            spyState,
            rngValue: 0,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => 0);

          expect(notebookEntries).toHaveLength(1);

          const payload = notebookEntries[0].payload as {
            spyCaptured: boolean;
            spyRegionId: string | null;
          };

          // spyCaptured is true iff spy exists AND captured
          const expectedSpyCaptured = spyState.kind === "exists-captured";
          expect(payload.spyCaptured).toBe(expectedSpyCaptured);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 12.8, 12.9**
   *
   * spyRegionId is non-null if and only if a GameSpy record exists for the
   * target's region (regardless of captured status).
   */
  it("spyRegionId is non-null if and only if a GameSpy record exists for the target region", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.integer({ min: 0, max: 6 }), // oracle distance
        arbSpyState,
        async (
          roomId,
          playerId,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          mastermindLocationId,
          roundNumber,
          oracleDistance,
          spyState
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
            spyState,
            rngValue: 0,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => 0);

          expect(notebookEntries).toHaveLength(1);

          const payload = notebookEntries[0].payload as {
            spyRegionId: string | null;
          };

          // spyRegionId is non-null iff a GameSpy record exists
          const spyExists =
            spyState.kind === "exists-uncaptured" ||
            spyState.kind === "exists-captured";

          if (spyExists) {
            expect(payload.spyRegionId).not.toBeNull();
            expect(payload.spyRegionId).toBe(targetRegionId);
          } else {
            expect(payload.spyRegionId).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
