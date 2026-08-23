// Feature: action-cards
// Property 18: Round End Confluence
// **Validates: Requirements 14.7**

import fc from "fast-check";
import { vi } from "vitest";

/**
 * Property 18: Round End Confluence
 *
 * For any set of Pending_Clue records within one Round, the multiset of resulting
 * Notebook entries is identical regardless of processing order (holding random
 * draws fixed via injectable RNG).
 *
 * Test approach:
 * 1. Generate a set of PendingClue records (mix of all three clue card types)
 * 2. Mock the transaction to return them in a specific order
 * 3. Run resolveRoundEnd and capture notebook entries
 * 4. Mock again with clues in a different (shuffled) order
 * 5. Run resolveRoundEnd again with the same rng seed
 * 6. Compare the multisets of resulting entries — they should be identical
 *
 * Since resolveRoundEnd processes clues sequentially and each resolution is
 * independent (depends only on its own originLocationId/cardIdentifier and the
 * shared mastermind location), the same fixed rng produces the same results
 * regardless of order.
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

// --- Seeded RNG for deterministic replay ---

/**
 * Simple seedable PRNG (mulberry32) to produce identical random sequences
 * from the same seed.
 */
function createSeededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Mock Transaction Builder ---

interface NotebookEntryData {
  roomId: string;
  playerId: string;
  entryType: string;
  roundNumber: number;
  payload: Record<string, unknown>;
}

/**
 * Creates a mock transaction client configured with the given pending clues
 * and target player data for bug-a-phone resolution.
 */
function createMockTx(options: {
  roomId: string;
  roundNumber: number;
  pendingClues: PendingClueRecord[];
  mastermindLocationId: string;
  targetPlayers: Array<{ playerId: string; status: string; locationId: string; regionId: string }>;
  neighborIds: string[];
}) {
  const notebookEntries: NotebookEntryData[] = [];

  const tx = {
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
        roomId: options.roomId,
        locationId: options.mastermindLocationId,
      }),
    },
    roomPlayer: {
      findMany: vi.fn().mockImplementation(() => {
        // Return all players (clue owners + targets)
        const cluePlayerIds = new Set(options.pendingClues.map((c) => c.playerId));
        const allPlayerRecords = [
          ...Array.from(cluePlayerIds).map((pid) => ({
            playerId: pid,
            status: "connected",
          })),
          ...options.targetPlayers.map((tp) => ({
            playerId: tp.playerId,
            status: tp.status,
          })),
        ];
        // Deduplicate by playerId
        const seen = new Set<string>();
        return Promise.resolve(
          allPlayerRecords.filter((p) => {
            if (seen.has(p.playerId)) return false;
            seen.add(p.playerId);
            return true;
          })
        );
      }),
    },
    playerPosition: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const target = options.targetPlayers.find(
          (tp) => tp.playerId === where.roomId_playerId.playerId
        );
        if (target) {
          return Promise.resolve({
            roomId: options.roomId,
            playerId: target.playerId,
            locationId: target.locationId,
          });
        }
        // Fallback for clue owners (shouldn't be reached for bug-a-phone targets)
        return Promise.resolve({
          roomId: options.roomId,
          playerId: where.roomId_playerId.playerId,
          locationId: "fallback-location",
        });
      }),
    },
    location: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const target = options.targetPlayers.find(
          (tp) => tp.locationId === where.id
        );
        if (target) {
          return Promise.resolve({
            id: target.locationId,
            regionId: target.regionId,
          });
        }
        return Promise.resolve({ id: where.id, regionId: "region-fallback" });
      }),
    },
    gameSpy: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    adjacency: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        // Return adjacencies based on the origin location for reveal-direction
        const originId =
          where.OR?.[0]?.locationAId ?? where.OR?.[1]?.locationBId ?? "unknown";
        return Promise.resolve(
          options.neighborIds.map((nId) => ({
            locationAId: originId,
            locationBId: nId,
            transport: "car",
          }))
        );
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

// --- Helper to normalize notebook entries into a comparable multiset ---

/**
 * Converts notebook entries to a sorted JSON string array for multiset comparison.
 * We sort by a canonical key so order doesn't matter.
 */
function toMultiset(entries: NotebookEntryData[]): string[] {
  return entries
    .map((e) => JSON.stringify({ playerId: e.playerId, entryType: e.entryType, payload: e.payload }))
    .sort();
}

// --- Fisher-Yates shuffle with a seeded rng ---

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

describe("Round End Confluence — Property 18", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 14.7**
   *
   * For any set of Pending_Clue records within one Round, the multiset of
   * resulting Notebook entries is identical regardless of processing order
   * (holding random draws fixed via injectable RNG).
   */
  it("multiset of notebook entries is identical regardless of clue processing order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.integer({ min: 1, max: 2 ** 31 - 1 }), // rng seed
        fc.integer({ min: 1, max: 2 ** 31 - 1 }), // shuffle seed (for reordering)
        fc.array(clueCardIdentifierArb, { minLength: 2, maxLength: 6 }), // card types
        fc.array(fc.uuid(), { minLength: 2, maxLength: 4 }), // neighbor location IDs for reveal-direction
        fc.uuid(), // target player ID for bug-a-phone
        fc.uuid(), // target location ID
        fc.uuid(), // target region ID
        fc.integer({ min: 0, max: 6 }), // oracle distance
        async (
          roomId,
          mastermindLocationId,
          roundNumber,
          rngSeed,
          shuffleSeed,
          cardTypes,
          neighborIds,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          oracleDistance
        ) => {
          // Build pending clues with distinct IDs and unique player IDs per clue
          const pendingClues: PendingClueRecord[] = cardTypes.map((cardId, i) => ({
            id: `clue-${i}`,
            roomId,
            playerId: `player-${i}`,
            cardIdentifier: cardId,
            roundNumber,
            originLocationId: `origin-${i}`,
            resolved: false,
          }));

          // Ensure target player is distinct from all clue players
          fc.pre(!pendingClues.some((c) => c.playerId === targetPlayerId));

          const targetPlayers = [
            {
              playerId: targetPlayerId,
              status: "connected",
              locationId: targetLocationId,
              regionId: targetRegionId,
            },
          ];

          // Mock getShortestPathDistance to return the same oracle distance for all calls.
          // Since each clue's resolution is independent and the distance utility is
          // deterministic (same inputs → same output), using a constant mock is valid
          // for testing order-independence.
          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          // --- Run 1: Original order ---
          const rng1 = createSeededRng(rngSeed);
          const { tx: tx1, notebookEntries: entries1 } = createMockTx({
            roomId,
            roundNumber,
            pendingClues,
            mastermindLocationId,
            targetPlayers,
            neighborIds,
          });

          await resolveRoundEnd(roomId, roundNumber, tx1, rng1);

          // --- Run 2: Shuffled order (different permutation of same clues) ---
          const shuffleRng = createSeededRng(shuffleSeed);
          const shuffledClues = shuffle(pendingClues, shuffleRng);

          // Ensure we actually shuffled (at least for non-trivial cases)
          // The property still holds even if shuffle produces same order

          const rng2 = createSeededRng(rngSeed); // Same seed → same random sequence
          const { tx: tx2, notebookEntries: entries2 } = createMockTx({
            roomId,
            roundNumber,
            pendingClues: shuffledClues,
            mastermindLocationId,
            targetPlayers,
            neighborIds,
          });

          await resolveRoundEnd(roomId, roundNumber, tx2, rng2);

          // Both runs should produce the same number of entries
          expect(entries1.length).toBe(entries2.length);

          // Compare multisets: same entries regardless of order
          const multiset1 = toMultiset(entries1);
          const multiset2 = toMultiset(entries2);
          expect(multiset1).toEqual(multiset2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.7**
   *
   * Edge case: a single pending clue should produce the same single entry
   * regardless of "order" (trivially true but validates the test infrastructure).
   */
  it("single clue produces identical entry regardless of test setup (baseline)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // mastermindLocationId
        fc.uuid(), // playerId
        fc.uuid(), // originLocationId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.integer({ min: 1, max: 2 ** 31 - 1 }), // rng seed
        fc.integer({ min: 0, max: 6 }), // oracle distance
        clueCardIdentifierArb, // card type
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }), // neighbor IDs
        async (
          roomId,
          mastermindLocationId,
          playerId,
          originLocationId,
          roundNumber,
          rngSeed,
          oracleDistance,
          cardType,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          neighborIds
        ) => {
          fc.pre(playerId !== targetPlayerId);

          const pendingClues: PendingClueRecord[] = [
            {
              id: "clue-0",
              roomId,
              playerId,
              cardIdentifier: cardType,
              roundNumber,
              originLocationId,
              resolved: false,
            },
          ];

          const targetPlayers = [
            {
              playerId: targetPlayerId,
              status: "connected",
              locationId: targetLocationId,
              regionId: targetRegionId,
            },
          ];

          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          // Run twice with same seed
          const rng1 = createSeededRng(rngSeed);
          const { tx: tx1, notebookEntries: entries1 } = createMockTx({
            roomId,
            roundNumber,
            pendingClues,
            mastermindLocationId,
            targetPlayers,
            neighborIds,
          });
          await resolveRoundEnd(roomId, roundNumber, tx1, rng1);

          const rng2 = createSeededRng(rngSeed);
          const { tx: tx2, notebookEntries: entries2 } = createMockTx({
            roomId,
            roundNumber,
            pendingClues,
            mastermindLocationId,
            targetPlayers,
            neighborIds,
          });
          await resolveRoundEnd(roomId, roundNumber, tx2, rng2);

          expect(entries1.length).toBe(entries2.length);
          expect(toMultiset(entries1)).toEqual(toMultiset(entries2));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.7**
   *
   * Mixed card types: when clues from different card types are interleaved
   * in different orders, the multiset of entries remains the same because each
   * resolution is independent of the others.
   */
  it("mixed card types produce order-independent results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // mastermindLocationId
        fc.integer({ min: 1, max: 50 }), // roundNumber
        fc.integer({ min: 1, max: 2 ** 31 - 1 }), // rng seed
        fc.uuid(), // targetPlayerId
        fc.uuid(), // targetLocationId
        fc.uuid(), // targetRegionId
        fc.integer({ min: 0, max: 6 }), // oracle distance
        fc.array(fc.uuid(), { minLength: 2, maxLength: 4 }), // neighbor IDs
        async (
          roomId,
          mastermindLocationId,
          roundNumber,
          rngSeed,
          targetPlayerId,
          targetLocationId,
          targetRegionId,
          oracleDistance,
          neighborIds
        ) => {
          // Create one clue of each type from different players
          const pendingClues: PendingClueRecord[] = [
            {
              id: "clue-locate",
              roomId,
              playerId: "player-locate",
              cardIdentifier: "locate-the-mastermind",
              roundNumber,
              originLocationId: "origin-locate",
              resolved: false,
            },
            {
              id: "clue-bug",
              roomId,
              playerId: "player-bug",
              cardIdentifier: "bug-a-phone",
              roundNumber,
              originLocationId: "origin-bug",
              resolved: false,
            },
            {
              id: "clue-direction",
              roomId,
              playerId: "player-direction",
              cardIdentifier: "reveal-direction",
              roundNumber,
              originLocationId: "origin-direction",
              resolved: false,
            },
          ];

          fc.pre(
            !pendingClues.some((c) => c.playerId === targetPlayerId)
          );

          const targetPlayers = [
            {
              playerId: targetPlayerId,
              status: "connected",
              locationId: targetLocationId,
              regionId: targetRegionId,
            },
          ];

          mockedGetShortestPathDistance.mockResolvedValue(oracleDistance);

          // Run 1: [locate, bug, direction] order
          const rng1 = createSeededRng(rngSeed);
          const { tx: tx1, notebookEntries: entries1 } = createMockTx({
            roomId,
            roundNumber,
            pendingClues,
            mastermindLocationId,
            targetPlayers,
            neighborIds,
          });
          await resolveRoundEnd(roomId, roundNumber, tx1, rng1);

          // Run 2: reversed order [direction, bug, locate]
          const rng2 = createSeededRng(rngSeed);
          const reversedClues = [...pendingClues].reverse();
          const { tx: tx2, notebookEntries: entries2 } = createMockTx({
            roomId,
            roundNumber,
            pendingClues: reversedClues,
            mastermindLocationId,
            targetPlayers,
            neighborIds,
          });
          await resolveRoundEnd(roomId, roundNumber, tx2, rng2);

          // Run 3: interleaved order [bug, locate, direction]
          const rng3 = createSeededRng(rngSeed);
          const interleavedClues = [pendingClues[1], pendingClues[0], pendingClues[2]];
          const { tx: tx3, notebookEntries: entries3 } = createMockTx({
            roomId,
            roundNumber,
            pendingClues: interleavedClues,
            mastermindLocationId,
            targetPlayers,
            neighborIds,
          });
          await resolveRoundEnd(roomId, roundNumber, tx3, rng3);

          // All three runs should produce identical multisets
          expect(entries1.length).toBe(3);
          expect(entries2.length).toBe(3);
          expect(entries3.length).toBe(3);

          const multiset1 = toMultiset(entries1);
          const multiset2 = toMultiset(entries2);
          const multiset3 = toMultiset(entries3);

          expect(multiset1).toEqual(multiset2);
          expect(multiset1).toEqual(multiset3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
