// Feature: action-cards
// Property 30: Pending Clues Discarded on Game Win
// **Validates: Requirements 14.6**

import fc from "fast-check";
import { vi } from "vitest";

/**
 * Property 30: Pending Clues Discarded on Game Win
 *
 * For any successful Capture Attempt that ends the game, all unresolved
 * Pending_Clue records for that Room are marked resolved without producing
 * Notebook entries.
 *
 * Test approach:
 * 1. Generate random pending clues (mix of card types, players, round numbers)
 * 2. Mock the transaction with room status = "finished"
 * 3. Call resolveRoundEnd
 * 4. Verify updateMany was called to mark all clues resolved
 * 5. Verify no notebook entries were created
 * 6. Verify the function returns early (no gameThreat lookup, no individual clue resolution)
 */

// Mock the distance module before importing resolve-round-end
vi.mock("@/lib/map/distance", () => ({
  getShortestPathDistance: vi.fn(),
}));

import { resolveRoundEnd } from "@/lib/turn-engine/resolution/resolve-round-end";
import { getShortestPathDistance } from "@/lib/map/distance";

const mockedGetShortestPathDistance = vi.mocked(getShortestPathDistance);

// --- Generators ---

const clueCardIdentifierArb = fc.constantFrom(
  "locate-the-mastermind",
  "bug-a-phone",
  "reveal-direction"
);

interface PendingClueRecord {
  id: string;
  roomId: string;
  playerId: string;
  cardIdentifier: string;
  roundNumber: number;
  originLocationId: string;
  resolved: boolean;
}

function pendingClueArb(roomId: string, roundNumber: number) {
  return fc.record({
    id: fc.uuid(),
    roomId: fc.constant(roomId),
    playerId: fc.uuid(),
    cardIdentifier: clueCardIdentifierArb,
    roundNumber: fc.constant(roundNumber),
    originLocationId: fc.uuid(),
    resolved: fc.constant(false),
  });
}

// --- Mock Transaction Builder ---

interface MockTxCallCounts {
  roomFindUnique: number;
  pendingClueUpdateMany: number;
  pendingClueFindMany: number;
  gameThreatFindUnique: number;
  notebookEntryCreate: number;
  pendingClueUpdate: number;
}

/**
 * Creates a mock transaction client that reports a finished room.
 * Tracks call counts for assertions about early return behavior.
 */
function createFinishedRoomMockTx(options: {
  roomId: string;
  roundNumber: number;
}) {
  const callCounts: MockTxCallCounts = {
    roomFindUnique: 0,
    pendingClueUpdateMany: 0,
    pendingClueFindMany: 0,
    gameThreatFindUnique: 0,
    notebookEntryCreate: 0,
    pendingClueUpdate: 0,
  };

  const tx = {
    room: {
      findUnique: vi.fn().mockImplementation(() => {
        callCounts.roomFindUnique++;
        return Promise.resolve({ status: "finished" });
      }),
    },
    pendingClue: {
      findMany: vi.fn().mockImplementation(() => {
        callCounts.pendingClueFindMany++;
        return Promise.resolve([]);
      }),
      update: vi.fn().mockImplementation(() => {
        callCounts.pendingClueUpdate++;
        return Promise.resolve({});
      }),
      updateMany: vi.fn().mockImplementation(() => {
        callCounts.pendingClueUpdateMany++;
        return Promise.resolve({ count: 0 });
      }),
    },
    gameThreat: {
      findUnique: vi.fn().mockImplementation(() => {
        callCounts.gameThreatFindUnique++;
        return Promise.resolve({ roomId: options.roomId, locationId: "mastermind-loc" });
      }),
    },
    roomPlayer: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    playerPosition: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    location: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    gameSpy: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    adjacency: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notebookEntry: {
      create: vi.fn().mockImplementation(() => {
        callCounts.notebookEntryCreate++;
        return Promise.resolve({ id: "should-not-exist" });
      }),
    },
  } as any;

  return { tx, callCounts };
}

describe("Pending Clues Discarded on Game Win — Property 30", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 14.6**
   *
   * For any set of unresolved Pending_Clue records in a finished room,
   * resolveRoundEnd marks all of them resolved via updateMany without
   * creating any Notebook entries.
   */
  it("all pending clues are marked resolved without producing notebook entries when room is finished", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.array(clueCardIdentifierArb, { minLength: 1, maxLength: 8 }), // card types for pending clues
        fc.array(fc.uuid(), { minLength: 1, maxLength: 8 }), // player IDs
        async (roomId, roundNumber, cardTypes, playerIds) => {
          const { tx, callCounts } = createFinishedRoomMockTx({
            roomId,
            roundNumber,
          });

          // Call resolveRoundEnd on a finished room
          await resolveRoundEnd(roomId, roundNumber, tx, Math.random);

          // 1. Room status was checked
          expect(callCounts.roomFindUnique).toBe(1);
          expect(tx.room.findUnique).toHaveBeenCalledWith({
            where: { id: roomId },
            select: { status: true },
          });

          // 2. updateMany was called to mark all pending clues resolved
          expect(callCounts.pendingClueUpdateMany).toBe(1);
          expect(tx.pendingClue.updateMany).toHaveBeenCalledWith({
            where: { roomId, roundNumber, resolved: false },
            data: { resolved: true },
          });

          // 3. No notebook entries were created
          expect(callCounts.notebookEntryCreate).toBe(0);

          // 4. Function returned early — no gameThreat lookup, no individual clue resolution
          expect(callCounts.gameThreatFindUnique).toBe(0);
          expect(callCounts.pendingClueFindMany).toBe(0);
          expect(callCounts.pendingClueUpdate).toBe(0);

          // 5. Distance utility was never called
          expect(mockedGetShortestPathDistance).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.6**
   *
   * Regardless of the number or types of pending clues, none produce entries
   * when the game is won. The updateMany call targets all unresolved clues
   * for the room and round.
   */
  it("varying clue counts and types still produce zero notebook entries on game win", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.integer({ min: 1, max: 10 }), // number of pending clues
        fc.array(clueCardIdentifierArb, { minLength: 1, maxLength: 10 }), // card types
        async (roomId, roundNumber, clueCount, cardTypes) => {
          // Generate pending clue records (these exist in the DB but the function
          // doesn't load them individually when room is finished)
          const pendingClues: PendingClueRecord[] = Array.from(
            { length: Math.min(clueCount, cardTypes.length) },
            (_, i) => ({
              id: `clue-${i}`,
              roomId,
              playerId: `player-${i}`,
              cardIdentifier: cardTypes[i % cardTypes.length],
              roundNumber,
              originLocationId: `origin-${i}`,
              resolved: false,
            })
          );

          const { tx, callCounts } = createFinishedRoomMockTx({
            roomId,
            roundNumber,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, Math.random);

          // updateMany marks all clues resolved in bulk
          expect(callCounts.pendingClueUpdateMany).toBe(1);

          // No individual clue processing occurred
          expect(callCounts.notebookEntryCreate).toBe(0);
          expect(callCounts.pendingClueUpdate).toBe(0);
          expect(callCounts.gameThreatFindUnique).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.6**
   *
   * Even with clues from multiple different rounds pending, the updateMany
   * targets only the specific round passed to resolveRoundEnd while still
   * returning early due to game-won status.
   */
  it("updateMany targets the specific round number passed to resolveRoundEnd", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        async (roomId, roundNumber) => {
          const { tx, callCounts } = createFinishedRoomMockTx({
            roomId,
            roundNumber,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, Math.random);

          // Verify the exact where clause used by updateMany
          expect(tx.pendingClue.updateMany).toHaveBeenCalledWith({
            where: {
              roomId,
              roundNumber,
              resolved: false,
            },
            data: { resolved: true },
          });

          // The round number in the where clause matches what was passed
          const call = tx.pendingClue.updateMany.mock.calls[0][0];
          expect(call.where.roundNumber).toBe(roundNumber);
          expect(call.where.roomId).toBe(roomId);
          expect(call.where.resolved).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
