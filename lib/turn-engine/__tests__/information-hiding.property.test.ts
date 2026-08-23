// Feature: movement-turn-actions
// Property 17: Information Hiding in Responses
// **Validates: Requirements 8.6, 11.1, 11.5, 16.4**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getGamePollState } from "@/lib/turn-engine/query-turn-state";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

let allLocations: LocationRecord[] = [];
let prisma: PrismaClient;
let roomCounter = 0;

function uniqueRoomCode(): string {
  return `IH${(++roomCounter).toString().padStart(4, "0")}`;
}

const PLAYER_A_ID = "info-hide-player-a";
const PLAYER_B_ID = "info-hide-player-b";

/**
 * Creates a full game setup for information hiding tests.
 * Places a Mastermind at a specified location and uncaptured spies at specified locations.
 * Creates two players with positions and notebook entries for player A.
 */
async function createGameSetup(opts: {
  mastermindLocationId: string;
  spyLocations: { regionId: string; locationId: string }[];
  playerALocationId: string;
  playerBLocationId: string;
  notebookEntries: { regionId: string; roundNumber: number; stepsAway: number }[];
}): Promise<{ roomId: string }> {
  const {
    mastermindLocationId,
    spyLocations,
    playerALocationId,
    playerBLocationId,
    notebookEntries,
  } = opts;

  const room = await prisma.room.create({
    data: {
      code: uniqueRoomCode(),
      status: "in-progress",
    },
  });

  // Create RoomPlayer records
  await prisma.roomPlayer.create({
    data: {
      playerId: PLAYER_A_ID,
      displayName: "Player A",
      roomId: room.id,
      turnPosition: 1,
    },
  });
  await prisma.roomPlayer.create({
    data: {
      playerId: PLAYER_B_ID,
      displayName: "Player B",
      roomId: room.id,
      turnPosition: 2,
    },
  });

  // Place Mastermind
  await prisma.gameThreat.create({
    data: {
      roomId: room.id,
      locationId: mastermindLocationId,
    },
  });

  // Place uncaptured spies
  for (const spy of spyLocations) {
    await prisma.gameSpy.create({
      data: {
        roomId: room.id,
        regionId: spy.regionId,
        locationId: spy.locationId,
        captured: false,
      },
    });
  }

  // Create player positions
  await prisma.playerPosition.create({
    data: {
      roomId: room.id,
      playerId: PLAYER_A_ID,
      locationId: playerALocationId,
      skipNextTurn: false,
    },
  });
  await prisma.playerPosition.create({
    data: {
      roomId: room.id,
      playerId: PLAYER_B_ID,
      locationId: playerBLocationId,
      skipNextTurn: false,
    },
  });

  // Create GameTurn
  await prisma.gameTurn.create({
    data: {
      roomId: room.id,
      currentPlayerId: PLAYER_A_ID,
      currentRound: 1,
      actionsRemaining: 2,
      actionBudget: 2,
      captureAttemptFlag: false,
      version: 0,
    },
  });

  // Create notebook entries for Player A only
  for (const entry of notebookEntries) {
    await prisma.notebookEntry.create({
      data: {
        roomId: room.id,
        playerId: PLAYER_A_ID,
        entryType: "spy-proximity",
        regionId: entry.regionId,
        roundNumber: entry.roundNumber,
        stepsAway: entry.stepsAway,
      },
    });
  }

  return { roomId: room.id };
}

/**
 * Cleans up all test data for a given room.
 */
async function cleanupRoom(roomId: string): Promise<void> {
  await prisma.gameEvent.deleteMany({ where: { roomId } });
  await prisma.notebookEntry.deleteMany({ where: { roomId } });
  await prisma.actionCard.deleteMany({ where: { roomId } });
  await prisma.playerPosition.deleteMany({ where: { roomId } });
  await prisma.gameTurn.deleteMany({ where: { roomId } });
  await prisma.gameThreat.deleteMany({ where: { roomId } });
  await prisma.gameSpy.deleteMany({ where: { roomId } });
  await prisma.roomPlayer.deleteMany({ where: { roomId } });
  await prisma.room.delete({ where: { id: roomId } });
}

describe("Information Hiding Property Tests", () => {
  // **Validates: Requirements 8.6, 11.1, 11.5, 16.4**

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

    allLocations = await prisma.location.findMany();
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Property 17: Information Hiding in Responses", () => {
    // **Validates: Requirements 8.6, 11.1, 11.5, 16.4**
    // Poll responses never contain Mastermind location or uncaptured Spy locations;
    // notebook visible only to owner.

    it("poll response does not contain Mastermind locationId or uncaptured Spy locationIds", async () => {
      expect(allLocations.length).toBe(40);

      // Group locations by region for spy placement
      const locationsByRegion = new Map<string, LocationRecord[]>();
      for (const loc of allLocations) {
        const existing = locationsByRegion.get(loc.regionId) ?? [];
        existing.push(loc);
        locationsByRegion.set(loc.regionId, existing);
      }
      const regionIds = [...locationsByRegion.keys()];

      // Arbitraries:
      // - Pick a mastermind location (any location)
      // - Pick 2-4 spy locations from distinct regions
      // - Pick player locations (different from mastermind and spy locations)
      const mastermindIdxArb = fc.integer({ min: 0, max: allLocations.length - 1 });
      const spyCountArb = fc.integer({ min: 2, max: Math.min(4, regionIds.length) });
      const playerLocIdxArb = fc.integer({ min: 0, max: allLocations.length - 1 });

      await fc.assert(
        fc.asyncProperty(
          mastermindIdxArb,
          spyCountArb,
          playerLocIdxArb,
          playerLocIdxArb,
          fc.integer({ min: 1, max: 10 }), // round number for notebook entry
          fc.integer({ min: 1, max: 5 }), // steps away for notebook entry
          async (
            mastermindIdx: number,
            spyCount: number,
            playerALocIdx: number,
            playerBLocIdx: number,
            notebookRound: number,
            notebookSteps: number
          ) => {
            const mastermindLoc = allLocations[mastermindIdx];
            const playerALoc = allLocations[playerALocIdx];
            const playerBLoc = allLocations[playerBLocIdx];

            // Pick spy locations from distinct regions (different from mastermind loc to ensure uniqueness)
            const spyLocations: { regionId: string; locationId: string }[] = [];
            const usedRegions = new Set<string>();
            for (const regionId of regionIds) {
              if (spyLocations.length >= spyCount) break;
              const locs = locationsByRegion.get(regionId)!;
              // Pick a location that is not the mastermind or a player location
              const spyLoc = locs.find(
                (l) =>
                  l.id !== mastermindLoc.id &&
                  l.id !== playerALoc.id &&
                  l.id !== playerBLoc.id &&
                  !usedRegions.has(regionId)
              );
              if (spyLoc) {
                spyLocations.push({ regionId, locationId: spyLoc.id });
                usedRegions.add(regionId);
              }
            }

            // Need at least 1 spy to test
            fc.pre(spyLocations.length >= 1);

            // Pick a notebook entry region from one of the spy regions
            const notebookRegionId = spyLocations[0].regionId;

            const { roomId } = await createGameSetup({
              mastermindLocationId: mastermindLoc.id,
              spyLocations,
              playerALocationId: playerALoc.id,
              playerBLocationId: playerBLoc.id,
              notebookEntries: [
                {
                  regionId: notebookRegionId,
                  roundNumber: notebookRound,
                  stepsAway: notebookSteps,
                },
              ],
            });

            try {
              // Call getGamePollState for Player A
              const stateA = await getGamePollState(roomId, PLAYER_A_ID, 0);

              // Stringify the entire response to check for hidden info
              const serialized = JSON.stringify(stateA);

              // The Mastermind location should NOT appear in the response
              // (The mastermind locationId should not be found anywhere unless it
              // coincidentally matches a player's current location)
              const mastermindLocationId = mastermindLoc.id;

              // Check that mastermind location does not appear unless a player happens
              // to be at that location (which is legitimate to include as player position)
              const playerIsAtMastermind =
                playerALoc.id === mastermindLocationId ||
                playerBLoc.id === mastermindLocationId;

              if (!playerIsAtMastermind) {
                expect(serialized).not.toContain(mastermindLocationId);
              }

              // Uncaptured spy locations should NOT appear in the response
              for (const spy of spyLocations) {
                const playerIsAtSpyLocation =
                  playerALoc.id === spy.locationId ||
                  playerBLoc.id === spy.locationId;

                if (!playerIsAtSpyLocation) {
                  expect(serialized).not.toContain(spy.locationId);
                }
              }

              // Verify Player A can see their own notebook entries
              expect(stateA.privateData.notebook.length).toBe(1);
              const entry = stateA.privateData.notebook[0] as { entryType: string; regionId: string; roundNumber: number; stepsAway: number };
              expect(entry.regionId).toBe(notebookRegionId);
              expect(entry.roundNumber).toBe(notebookRound);
              expect(entry.stepsAway).toBe(notebookSteps);
            } finally {
              await cleanupRoom(roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 180000);

    it("player B cannot see player A notebook entries in poll response", async () => {
      expect(allLocations.length).toBe(40);

      // Group locations by region for spy placement
      const locationsByRegion = new Map<string, LocationRecord[]>();
      for (const loc of allLocations) {
        const existing = locationsByRegion.get(loc.regionId) ?? [];
        existing.push(loc);
        locationsByRegion.set(loc.regionId, existing);
      }
      const regionIds = [...locationsByRegion.keys()];

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }), // mastermind loc
          fc.integer({ min: 0, max: allLocations.length - 1 }), // player A loc
          fc.integer({ min: 0, max: allLocations.length - 1 }), // player B loc
          fc.integer({ min: 1, max: 10 }), // notebook round
          fc.integer({ min: 1, max: 5 }), // notebook steps
          fc.integer({ min: 1, max: 3 }), // number of notebook entries
          async (
            mastermindIdx: number,
            playerALocIdx: number,
            playerBLocIdx: number,
            notebookRound: number,
            notebookSteps: number,
            notebookCount: number
          ) => {
            const mastermindLoc = allLocations[mastermindIdx];
            const playerALoc = allLocations[playerALocIdx];
            const playerBLoc = allLocations[playerBLocIdx];

            // Place at least one spy in a distinct region
            const spyLocations: { regionId: string; locationId: string }[] = [];
            for (const regionId of regionIds) {
              if (spyLocations.length >= 1) break;
              const locs = locationsByRegion.get(regionId)!;
              const spyLoc = locs.find(
                (l) =>
                  l.id !== mastermindLoc.id &&
                  l.id !== playerALoc.id &&
                  l.id !== playerBLoc.id
              );
              if (spyLoc) {
                spyLocations.push({ regionId, locationId: spyLoc.id });
              }
            }
            fc.pre(spyLocations.length >= 1);

            // Create multiple notebook entries for Player A
            const notebookEntries = Array.from({ length: notebookCount }, (_, i) => ({
              regionId: spyLocations[0].regionId,
              roundNumber: notebookRound + i,
              stepsAway: notebookSteps,
            }));

            const { roomId } = await createGameSetup({
              mastermindLocationId: mastermindLoc.id,
              spyLocations,
              playerALocationId: playerALoc.id,
              playerBLocationId: playerBLoc.id,
              notebookEntries,
            });

            try {
              // Poll as Player B — should NOT see Player A's notebook entries
              const stateB = await getGamePollState(roomId, PLAYER_B_ID, 0);

              // Player B's notebook should be empty (no entries were created for B)
              expect(stateB.privateData.notebook.length).toBe(0);

              // Verify the response structure is correct
              expect(stateB.roomId).toBe(roomId);
              expect(stateB.status).toBe("in-progress");
              expect(stateB.players.length).toBe(2);

              // Also verify Player A can see their own entries
              const stateA = await getGamePollState(roomId, PLAYER_A_ID, 0);
              expect(stateA.privateData.notebook.length).toBe(notebookCount);

              // Verify none of Player A's notebook content appears in Player B's response
              const serializedB = JSON.stringify(stateB);
              // The notebook regionId would appear in Player B's response only
              // if it's also present as a player position, event, etc.
              // But the critical assertion is that B's privateData.notebook is empty
              expect(stateB.privateData.notebook).toEqual([]);
            } finally {
              await cleanupRoom(roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 180000);
  });
});
