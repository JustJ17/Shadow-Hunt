// Feature: action-cards
// Property 19: Notebook Write/Read Round Trip
// **Validates: Requirements 15.4, 15.5, 15.6, 15.10**

import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notebookEntry: { findMany: vi.fn() },
  },
}));

import { getPlayerNotebook } from "@/lib/turn-engine/notebook";
import { prisma } from "@/lib/prisma";
import type { DiscriminatedNotebookEntry } from "@/lib/turn-engine/types";

const mockFindMany = prisma.notebookEntry.findMany as ReturnType<typeof vi.fn>;

/**
 * Property 19: Notebook Write/Read Round Trip
 *
 * For any generated Notebook entry of all four entry types, writing the entry
 * and then reading it through `getPlayerNotebook` yields field values equal to
 * those written. Since getPlayerNotebook uses prisma directly, we mock the DB
 * layer and verify the mapping/parsing logic correctly reconstructs all entry
 * types from their stored format.
 *
 * The four entry types and their storage:
 * - spy-proximity: uses regionId and stepsAway columns directly (no payload)
 * - mastermind_distance: payload JSON { type, locationId, roundNumber, stepsAway }
 * - mastermind_direction: payload JSON { type, locationId, roundNumber }
 * - phone_bug: payload JSON { type, roundNumber, targetPlayerId, targetLocationId,
 *                             mastermindStepsAway, spyRegionId, spyCaptured }
 */

// --- Arbitraries ---

const locationId = fc.uuid();
const playerId = fc.uuid();
const regionId = fc.uuid();
const roundNumber = fc.integer({ min: 1, max: 50 });
const stepsAway = fc.integer({ min: 0, max: 6 });

/**
 * Generates a spy-proximity entry in raw DB format and expected parsed output.
 */
function arbSpyProximityEntry() {
  return fc
    .record({
      regionId,
      roundNumber,
      stepsAway,
    })
    .map((fields) => ({
      raw: {
        entryType: "spy-proximity",
        regionId: fields.regionId,
        roundNumber: fields.roundNumber,
        stepsAway: fields.stepsAway,
        payload: null,
      },
      expected: {
        entryType: "spy-proximity" as const,
        regionId: fields.regionId,
        roundNumber: fields.roundNumber,
        stepsAway: fields.stepsAway,
      },
    }));
}

/**
 * Generates a mastermind_distance entry in raw DB format and expected parsed output.
 * Req 15.4: payload fields type, locationId, roundNumber, stepsAway
 */
function arbMastermindDistanceEntry() {
  return fc
    .record({
      locationId,
      roundNumber,
      stepsAway,
    })
    .map((fields) => ({
      raw: {
        entryType: "mastermind_distance",
        regionId: null,
        roundNumber: fields.roundNumber,
        stepsAway: null,
        payload: {
          type: "mastermind_distance",
          locationId: fields.locationId,
          roundNumber: fields.roundNumber,
          stepsAway: fields.stepsAway,
        },
      },
      expected: {
        entryType: "mastermind_distance" as const,
        locationId: fields.locationId,
        roundNumber: fields.roundNumber,
        stepsAway: fields.stepsAway,
      },
    }));
}

/**
 * Generates a mastermind_direction entry in raw DB format and expected parsed output.
 * Req 15.5: payload fields type, locationId, roundNumber
 */
function arbMastermindDirectionEntry() {
  return fc
    .record({
      locationId,
      roundNumber,
    })
    .map((fields) => ({
      raw: {
        entryType: "mastermind_direction",
        regionId: null,
        roundNumber: fields.roundNumber,
        stepsAway: null,
        payload: {
          type: "mastermind_direction",
          locationId: fields.locationId,
          roundNumber: fields.roundNumber,
        },
      },
      expected: {
        entryType: "mastermind_direction" as const,
        locationId: fields.locationId,
        roundNumber: fields.roundNumber,
      },
    }));
}

/**
 * Generates a phone_bug entry in raw DB format and expected parsed output.
 * Req 15.6: payload fields type, roundNumber, targetPlayerId, targetLocationId,
 *           mastermindStepsAway, spyRegionId, spyCaptured
 */
function arbPhoneBugEntry() {
  return fc
    .record({
      roundNumber,
      targetPlayerId: playerId,
      targetLocationId: locationId,
      mastermindStepsAway: stepsAway,
      spyRegionId: fc.option(regionId, { nil: null }),
      spyCaptured: fc.boolean(),
    })
    .map((fields) => ({
      raw: {
        entryType: "phone_bug",
        regionId: null,
        roundNumber: fields.roundNumber,
        stepsAway: null,
        payload: {
          type: "phone_bug",
          roundNumber: fields.roundNumber,
          targetPlayerId: fields.targetPlayerId,
          targetLocationId: fields.targetLocationId,
          mastermindStepsAway: fields.mastermindStepsAway,
          spyRegionId: fields.spyRegionId,
          spyCaptured: fields.spyCaptured,
        },
      },
      expected: {
        entryType: "phone_bug" as const,
        roundNumber: fields.roundNumber,
        targetPlayerId: fields.targetPlayerId,
        targetLocationId: fields.targetLocationId,
        mastermindStepsAway: fields.mastermindStepsAway,
        spyRegionId: fields.spyRegionId,
        spyCaptured: fields.spyCaptured,
      },
    }));
}

/**
 * Generates any of the four entry types (uniform distribution).
 */
function arbAnyEntry() {
  return fc.oneof(
    arbSpyProximityEntry(),
    arbMastermindDistanceEntry(),
    arbMastermindDirectionEntry(),
    arbPhoneBugEntry()
  );
}

describe("Notebook Write/Read Round Trip — Property 19", () => {
  // **Validates: Requirements 15.4, 15.5, 15.6, 15.10**

  const testRoomId = "room-round-trip";
  const testPlayerId = "player-round-trip";

  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it("spy-proximity entries round-trip with identical field values", async () => {
    await fc.assert(
      fc.asyncProperty(arbSpyProximityEntry(), async (entry) => {
        mockFindMany.mockResolvedValueOnce([entry.raw]);

        const result: DiscriminatedNotebookEntry[] = await getPlayerNotebook(
          testRoomId,
          testPlayerId,
          testPlayerId
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(entry.expected);
      }),
      { numRuns: 200 }
    );
  });

  it("mastermind_distance entries round-trip with identical field values", async () => {
    await fc.assert(
      fc.asyncProperty(arbMastermindDistanceEntry(), async (entry) => {
        mockFindMany.mockResolvedValueOnce([entry.raw]);

        const result: DiscriminatedNotebookEntry[] = await getPlayerNotebook(
          testRoomId,
          testPlayerId,
          testPlayerId
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(entry.expected);
      }),
      { numRuns: 200 }
    );
  });

  it("mastermind_direction entries round-trip with identical field values", async () => {
    await fc.assert(
      fc.asyncProperty(arbMastermindDirectionEntry(), async (entry) => {
        mockFindMany.mockResolvedValueOnce([entry.raw]);

        const result: DiscriminatedNotebookEntry[] = await getPlayerNotebook(
          testRoomId,
          testPlayerId,
          testPlayerId
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(entry.expected);
      }),
      { numRuns: 200 }
    );
  });

  it("phone_bug entries round-trip with identical field values", async () => {
    await fc.assert(
      fc.asyncProperty(arbPhoneBugEntry(), async (entry) => {
        mockFindMany.mockResolvedValueOnce([entry.raw]);

        const result: DiscriminatedNotebookEntry[] = await getPlayerNotebook(
          testRoomId,
          testPlayerId,
          testPlayerId
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(entry.expected);
      }),
      { numRuns: 200 }
    );
  });

  it("mixed entries of all four types round-trip preserving order and values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbAnyEntry(), { minLength: 1, maxLength: 20 }),
        async (entries) => {
          const rawEntries = entries.map((e) => e.raw);
          const expectedEntries = entries.map((e) => e.expected);

          mockFindMany.mockResolvedValueOnce(rawEntries);

          const result: DiscriminatedNotebookEntry[] = await getPlayerNotebook(
            testRoomId,
            testPlayerId,
            testPlayerId
          );

          expect(result).toHaveLength(expectedEntries.length);
          for (let i = 0; i < expectedEntries.length; i++) {
            expect(result[i]).toEqual(expectedEntries[i]);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("phone_bug entries with null spyRegionId round-trip correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbPhoneBugEntry().filter((e) => e.expected.spyRegionId === null),
        async (entry) => {
          mockFindMany.mockResolvedValueOnce([entry.raw]);

          const result: DiscriminatedNotebookEntry[] = await getPlayerNotebook(
            testRoomId,
            testPlayerId,
            testPlayerId
          );

          expect(result).toHaveLength(1);
          const phoneBug = result[0];
          expect(phoneBug.entryType).toBe("phone_bug");
          if (phoneBug.entryType === "phone_bug") {
            expect(phoneBug.spyRegionId).toBeNull();
            expect(phoneBug.spyCaptured).toBe(entry.expected.spyCaptured);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("respects the 200-entry cap regardless of how many entries exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 201, max: 300 }),
        async (totalEntries: number) => {
          // Generate more than 200 entries — mock returns all of them
          // but getPlayerNotebook should request at most 200 via take
          const rawEntries = Array.from({ length: totalEntries }, (_, i) => ({
            entryType: "spy-proximity",
            regionId: `region-${i}`,
            roundNumber: i + 1,
            stepsAway: i % 7,
            payload: null,
          }));

          mockFindMany.mockResolvedValueOnce(rawEntries);

          await getPlayerNotebook(testRoomId, testPlayerId, testPlayerId);

          // The function passes take: Math.min(limit, 200) to prisma
          const callArgs = mockFindMany.mock.calls[
            mockFindMany.mock.calls.length - 1
          ][0];
          expect(callArgs.take).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("entries with every field at boundary values round-trip correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Boundary: stepsAway at 0 and 6 (map diameter bounds)
          stepsAway: fc.constantFrom(0, 6),
          roundNumber: fc.constantFrom(1, 50),
          spyCaptured: fc.boolean(),
        }),
        async (bounds) => {
          const entries = [
            {
              entryType: "spy-proximity",
              regionId: "boundary-region",
              roundNumber: bounds.roundNumber,
              stepsAway: bounds.stepsAway,
              payload: null,
            },
            {
              entryType: "mastermind_distance",
              regionId: null,
              roundNumber: bounds.roundNumber,
              stepsAway: null,
              payload: {
                type: "mastermind_distance",
                locationId: "boundary-loc",
                roundNumber: bounds.roundNumber,
                stepsAway: bounds.stepsAway,
              },
            },
            {
              entryType: "phone_bug",
              regionId: null,
              roundNumber: bounds.roundNumber,
              stepsAway: null,
              payload: {
                type: "phone_bug",
                roundNumber: bounds.roundNumber,
                targetPlayerId: "target-id",
                targetLocationId: "target-loc",
                mastermindStepsAway: bounds.stepsAway,
                spyRegionId: null,
                spyCaptured: bounds.spyCaptured,
              },
            },
          ];

          mockFindMany.mockResolvedValueOnce(entries);

          const result: DiscriminatedNotebookEntry[] = await getPlayerNotebook(
            testRoomId,
            testPlayerId,
            testPlayerId
          );

          expect(result).toHaveLength(3);

          // spy-proximity
          expect(result[0]).toEqual({
            entryType: "spy-proximity",
            regionId: "boundary-region",
            roundNumber: bounds.roundNumber,
            stepsAway: bounds.stepsAway,
          });

          // mastermind_distance
          expect(result[1]).toEqual({
            entryType: "mastermind_distance",
            locationId: "boundary-loc",
            roundNumber: bounds.roundNumber,
            stepsAway: bounds.stepsAway,
          });

          // phone_bug
          expect(result[2]).toEqual({
            entryType: "phone_bug",
            roundNumber: bounds.roundNumber,
            targetPlayerId: "target-id",
            targetLocationId: "target-loc",
            mastermindStepsAway: bounds.stepsAway,
            spyRegionId: null,
            spyCaptured: bounds.spyCaptured,
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
