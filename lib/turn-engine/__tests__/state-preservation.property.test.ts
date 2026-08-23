// Feature: movement-turn-actions
// Property 3: Non-Current-Player Rejection
// Property 4: Inactive Game Rejection
// Property 9: Failed Action State Preservation
// Property 10: SKIP Is a No-Op
// **Validates: Requirements 1.5, 1.6, 2.6, 4.1, 7.4, 14.2, 15.7, 15.8**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { submitAction } from "@/lib/turn-engine/submit-action";

interface LocationRecord {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

interface Edge {
  id: string;
  locationAId: string;
  locationBId: string;
  isSameRegion: boolean;
  transport: string;
}

let allLocations: LocationRecord[] = [];
let allEdges: Edge[] = [];
let prisma: PrismaClient;

// Pre-computed adjacency lookup: locationId -> set of adjacent location IDs
let adjacencySet: Map<string, Set<string>>;

// Counter for unique room codes
let roomCounter = 0;

function uniqueRoomCode(): string {
  return `SP${(++roomCounter).toString().padStart(4, "0")}`;
}

function uniquePlayerId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Get all location IDs NOT adjacent to a given location.
 */
function getNonAdjacentLocationIds(locationId: string): string[] {
  const adjacent = adjacencySet.get(locationId) ?? new Set();
  return allLocations
    .filter((loc) => loc.id !== locationId && !adjacent.has(loc.id))
    .map((loc) => loc.id);
}

/**
 * Creates a full game setup for submitAction tests.
 * Returns IDs of the created resources for later cleanup.
 */
async function createGameSetup(opts: {
  roomStatus?: string;
  playerCount: number;
  currentPlayerIdx: number;
  locationId: string;
}): Promise<{
  roomId: string;
  playerIds: string[];
  gameTurnId: string;
}> {
  const { roomStatus = "in-progress", playerCount, currentPlayerIdx, locationId } = opts;
  const playerIds = Array.from({ length: playerCount }, (_, i) =>
    uniquePlayerId("sp", i)
  );

  const room = await prisma.room.create({
    data: {
      code: uniqueRoomCode(),
      status: roomStatus,
    },
  });

  for (let i = 0; i < playerCount; i++) {
    await prisma.roomPlayer.create({
      data: {
        playerId: playerIds[i],
        displayName: `Player ${i + 1}`,
        roomId: room.id,
        turnPosition: i + 1,
      },
    });
  }

  for (let i = 0; i < playerCount; i++) {
    await prisma.playerPosition.create({
      data: {
        roomId: room.id,
        playerId: playerIds[i],
        locationId,
        skipNextTurn: false,
      },
    });
  }

  // Only create GameTurn if room is in-progress (submitAction checks for it)
  let gameTurnId = "";
  if (roomStatus === "in-progress") {
    const gameTurn = await prisma.gameTurn.create({
      data: {
        roomId: room.id,
        currentPlayerId: playerIds[currentPlayerIdx],
        currentRound: 1,
        actionsRemaining: 2,
        actionBudget: 2,
        captureAttemptFlag: false,
        version: 0,
      },
    });
    gameTurnId = gameTurn.id;
  }

  return { roomId: room.id, playerIds, gameTurnId };
}

/**
 * Cleans up all test data for a given room.
 */
async function cleanupRoom(roomId: string): Promise<void> {
  // Delete in dependency order
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

describe("State Preservation Property Tests", () => {
  // **Validates: Requirements 1.5, 1.6, 2.6, 4.1, 7.4, 14.2, 15.7, 15.8**

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

    allLocations = await prisma.location.findMany();
    allEdges = await prisma.adjacency.findMany();

    // Build adjacency set for quick lookup
    adjacencySet = new Map<string, Set<string>>();
    for (const loc of allLocations) {
      adjacencySet.set(loc.id, new Set());
    }
    for (const edge of allEdges) {
      adjacencySet.get(edge.locationAId)!.add(edge.locationBId);
      adjacencySet.get(edge.locationBId)!.add(edge.locationAId);
    }
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Property 3: Non-Current-Player Rejection", () => {
    // **Validates: Requirements 1.5, 15.7**
    // Actions from non-current player rejected, no state change.

    it("actions from non-current player are rejected with NOT_YOUR_TURN and no state changes", async () => {
      expect(allLocations.length).toBe(40);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // playerCount
          fc.integer({ min: 0, max: allLocations.length - 1 }), // location index
          async (playerCount: number, locIdx: number) => {
            const location = allLocations[locIdx];
            // Current player is always index 0, non-current player is index 1
            const setup = await createGameSetup({
              playerCount,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              // Capture state before action
              const positionsBefore = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });
              const turnBefore = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });
              const eventsBefore = await prisma.gameEvent.findMany({
                where: { roomId: setup.roomId },
              });

              // Submit action from player who is NOT the current player
              const nonCurrentPlayerId = setup.playerIds[1];
              const result = await submitAction(setup.roomId, nonCurrentPlayerId, {
                actionType: "SKIP",
              });

              // Verify rejection
              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("NOT_YOUR_TURN");
              }

              // Verify no state changed
              const positionsAfter = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });
              const turnAfter = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });
              const eventsAfter = await prisma.gameEvent.findMany({
                where: { roomId: setup.roomId },
              });

              // Positions unchanged
              expect(positionsAfter.map((p) => ({ playerId: p.playerId, locationId: p.locationId }))).toEqual(
                positionsBefore.map((p) => ({ playerId: p.playerId, locationId: p.locationId }))
              );

              // Turn state unchanged
              expect(turnAfter!.currentPlayerId).toBe(turnBefore!.currentPlayerId);
              expect(turnAfter!.currentRound).toBe(turnBefore!.currentRound);
              expect(turnAfter!.actionsRemaining).toBe(turnBefore!.actionsRemaining);
              expect(turnAfter!.captureAttemptFlag).toBe(turnBefore!.captureAttemptFlag);

              // No events emitted
              expect(eventsAfter.length).toBe(eventsBefore.length);
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("MOVE action from non-current player is also rejected without state change", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }), // location index
          async (locIdx: number) => {
            const location = allLocations[locIdx];
            const adjacent = adjacencySet.get(location.id);
            // Need at least one adjacent location for a valid MOVE target
            if (!adjacent || adjacent.size === 0) return;
            const targetLocationId = [...adjacent][0];

            const setup = await createGameSetup({
              playerCount: 3,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              const positionsBefore = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });

              // Non-current player tries a MOVE to a valid target
              const result = await submitAction(setup.roomId, setup.playerIds[2], {
                actionType: "MOVE",
                targetLocationId,
              });

              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("NOT_YOUR_TURN");
              }

              // Positions unchanged
              const positionsAfter = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });
              expect(positionsAfter.map((p) => p.locationId)).toEqual(
                positionsBefore.map((p) => p.locationId)
              );
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);
  });

  describe("Property 4: Inactive Game Rejection", () => {
    // **Validates: Requirements 1.6, 14.2**
    // Actions on non-in-progress room rejected, no state change.

    it("actions on 'finished' room are rejected with GAME_NOT_ACTIVE", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];

            const setup = await createGameSetup({
              roomStatus: "finished",
              playerCount: 2,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              // Try to submit an action on a finished game
              const result = await submitAction(setup.roomId, setup.playerIds[0], {
                actionType: "SKIP",
              });

              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("GAME_NOT_ACTIVE");
              }

              // Verify no events were emitted
              const events = await prisma.gameEvent.findMany({
                where: { roomId: setup.roomId },
              });
              expect(events.length).toBe(0);

              // Verify positions unchanged
              const positions = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
              });
              for (const pos of positions) {
                expect(pos.locationId).toBe(location.id);
              }
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("actions on 'waiting' room are rejected with GAME_NOT_ACTIVE", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];

            const setup = await createGameSetup({
              roomStatus: "waiting",
              playerCount: 2,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              const result = await submitAction(setup.roomId, setup.playerIds[0], {
                actionType: "MOVE",
                targetLocationId: allLocations[(locIdx + 1) % allLocations.length].id,
              });

              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("GAME_NOT_ACTIVE");
              }

              // No state changes
              const events = await prisma.gameEvent.findMany({
                where: { roomId: setup.roomId },
              });
              expect(events.length).toBe(0);
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("different action types all rejected on inactive room", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("finished", "waiting"),
          fc.constantFrom("SKIP", "CAPTURE_ATTEMPT") as fc.Arbitrary<"SKIP" | "CAPTURE_ATTEMPT">,
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (roomStatus: string, actionType: "SKIP" | "CAPTURE_ATTEMPT", locIdx: number) => {
            const location = allLocations[locIdx];

            const setup = await createGameSetup({
              roomStatus,
              playerCount: 2,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              const action =
                actionType === "SKIP"
                  ? { actionType: "SKIP" as const }
                  : { actionType: "CAPTURE_ATTEMPT" as const };

              const result = await submitAction(setup.roomId, setup.playerIds[0], action);

              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("GAME_NOT_ACTIVE");
              }
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);
  });

  describe("Property 9: Failed Action State Preservation", () => {
    // **Validates: Requirements 2.6, 7.4, 15.8**
    // Invalid actions leave all state unchanged.

    it("invalid MOVE to non-adjacent location rejected, all state unchanged", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];
            const nonAdjacentIds = getNonAdjacentLocationIds(location.id);

            // Need at least one non-adjacent location to test
            fc.pre(nonAdjacentIds.length > 0);

            const targetId = nonAdjacentIds[0];

            const setup = await createGameSetup({
              playerCount: 2,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              // Capture state before
              const positionsBefore = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });
              const turnBefore = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });
              const eventsBefore = await prisma.gameEvent.findMany({
                where: { roomId: setup.roomId },
              });
              const notebookBefore = await prisma.notebookEntry.findMany({
                where: { roomId: setup.roomId },
              });

              // Submit invalid MOVE (non-adjacent)
              const result = await submitAction(setup.roomId, setup.playerIds[0], {
                actionType: "MOVE",
                targetLocationId: targetId,
              });

              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("INVALID_MOVE");
              }

              // Verify all state unchanged
              const positionsAfter = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });
              const turnAfter = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });
              const eventsAfter = await prisma.gameEvent.findMany({
                where: { roomId: setup.roomId },
              });
              const notebookAfter = await prisma.notebookEntry.findMany({
                where: { roomId: setup.roomId },
              });

              // Positions unchanged
              expect(positionsAfter.map((p) => ({ playerId: p.playerId, locationId: p.locationId }))).toEqual(
                positionsBefore.map((p) => ({ playerId: p.playerId, locationId: p.locationId }))
              );

              // Turn state unchanged
              expect(turnAfter!.currentPlayerId).toBe(turnBefore!.currentPlayerId);
              expect(turnAfter!.currentRound).toBe(turnBefore!.currentRound);
              expect(turnAfter!.actionsRemaining).toBe(turnBefore!.actionsRemaining);
              expect(turnAfter!.captureAttemptFlag).toBe(turnBefore!.captureAttemptFlag);
              expect(turnAfter!.version).toBe(turnBefore!.version);

              // No events emitted
              expect(eventsAfter.length).toBe(eventsBefore.length);

              // No notebook entries added
              expect(notebookAfter.length).toBe(notebookBefore.length);
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("MOVE to same location rejected, state preserved", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];

            const setup = await createGameSetup({
              playerCount: 2,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              const turnBefore = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });

              // Submit MOVE to SAME location
              const result = await submitAction(setup.roomId, setup.playerIds[0], {
                actionType: "MOVE",
                targetLocationId: location.id,
              });

              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("SAME_LOCATION_MOVE");
              }

              // Turn state unchanged
              const turnAfter = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });
              expect(turnAfter!.actionsRemaining).toBe(turnBefore!.actionsRemaining);
              expect(turnAfter!.currentPlayerId).toBe(turnBefore!.currentPlayerId);

              // Position unchanged
              const pos = await prisma.playerPosition.findFirst({
                where: { roomId: setup.roomId, playerId: setup.playerIds[0] },
              });
              expect(pos!.locationId).toBe(location.id);
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("duplicate CAPTURE_ATTEMPT rejected, state preserved", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];

            // Create setup with captureAttemptFlag already set (simulating slot 2)
            const playerIds = Array.from({ length: 2 }, (_, i) =>
              uniquePlayerId("sp-dup", i)
            );

            const room = await prisma.room.create({
              data: {
                code: uniqueRoomCode(),
                status: "in-progress",
              },
            });

            for (let i = 0; i < 2; i++) {
              await prisma.roomPlayer.create({
                data: {
                  playerId: playerIds[i],
                  displayName: `Player ${i + 1}`,
                  roomId: room.id,
                  turnPosition: i + 1,
                },
              });
              await prisma.playerPosition.create({
                data: {
                  roomId: room.id,
                  playerId: playerIds[i],
                  locationId: location.id,
                  skipNextTurn: false,
                },
              });
            }

            // Create turn at slot 2 with captureAttemptFlag already true
            await prisma.gameTurn.create({
              data: {
                roomId: room.id,
                currentPlayerId: playerIds[0],
                currentRound: 1,
                actionsRemaining: 1,
                actionBudget: 2,
                captureAttemptFlag: true,
                version: 0,
              },
            });

            try {
              const turnBefore = await prisma.gameTurn.findUnique({
                where: { roomId: room.id },
              });

              // Submit duplicate CAPTURE_ATTEMPT
              const result = await submitAction(room.id, playerIds[0], {
                actionType: "CAPTURE_ATTEMPT",
              });

              expect(result.success).toBe(false);
              if (!result.success) {
                expect(result.code).toBe("DUPLICATE_CAPTURE_ATTEMPT");
              }

              // Turn state unchanged
              const turnAfter = await prisma.gameTurn.findUnique({
                where: { roomId: room.id },
              });
              expect(turnAfter!.actionsRemaining).toBe(turnBefore!.actionsRemaining);
              expect(turnAfter!.captureAttemptFlag).toBe(true);
              expect(turnAfter!.currentPlayerId).toBe(turnBefore!.currentPlayerId);

              // No events
              const events = await prisma.gameEvent.findMany({
                where: { roomId: room.id },
              });
              expect(events.length).toBe(0);
            } finally {
              await cleanupRoom(room.id);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);
  });

  describe("Property 10: SKIP Is a No-Op", () => {
    // **Validates: Requirements 4.1**
    // SKIP changes nothing except slot counter.

    it("SKIP at slot 1 advances slot to 2 but changes nothing else", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          fc.integer({ min: 2, max: 4 }), // playerCount
          async (locIdx: number, playerCount: number) => {
            const location = allLocations[locIdx];

            const setup = await createGameSetup({
              playerCount,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              // Capture full state before
              const positionsBefore = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });
              const turnBefore = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });
              const notebookBefore = await prisma.notebookEntry.findMany({
                where: { roomId: setup.roomId },
              });
              const cardsBefore = await prisma.actionCard.findMany({
                where: { roomId: setup.roomId },
              });

              // Submit SKIP at slot 1
              const result = await submitAction(setup.roomId, setup.playerIds[0], {
                actionType: "SKIP",
              });

              expect(result.success).toBe(true);
              if (result.success) {
                expect(result.actionType).toBe("SKIP");
                expect(result.actionsRemaining).toBe(1);
              }

              // Verify actionsRemaining decremented
              const turnAfter = await prisma.gameTurn.findUnique({
                where: { roomId: setup.roomId },
              });
              expect(turnAfter!.actionsRemaining).toBe(1);

              // Verify nothing else changed
              expect(turnAfter!.currentPlayerId).toBe(turnBefore!.currentPlayerId);
              expect(turnAfter!.currentRound).toBe(turnBefore!.currentRound);
              expect(turnAfter!.captureAttemptFlag).toBe(false);

              // Positions unchanged
              const positionsAfter = await prisma.playerPosition.findMany({
                where: { roomId: setup.roomId },
                orderBy: { playerId: "asc" },
              });
              expect(positionsAfter.map((p) => ({ playerId: p.playerId, locationId: p.locationId, skipNextTurn: p.skipNextTurn }))).toEqual(
                positionsBefore.map((p) => ({ playerId: p.playerId, locationId: p.locationId, skipNextTurn: p.skipNextTurn }))
              );

              // No notebook entries added
              const notebookAfter = await prisma.notebookEntry.findMany({
                where: { roomId: setup.roomId },
              });
              expect(notebookAfter.length).toBe(notebookBefore.length);

              // No cards changed
              const cardsAfter = await prisma.actionCard.findMany({
                where: { roomId: setup.roomId },
              });
              expect(cardsAfter.length).toBe(cardsBefore.length);
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("SKIP does not modify player position regardless of current location", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];

            const setup = await createGameSetup({
              playerCount: 2,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              // Submit SKIP
              const result = await submitAction(setup.roomId, setup.playerIds[0], {
                actionType: "SKIP",
              });

              expect(result.success).toBe(true);

              // Position must remain unchanged
              const pos = await prisma.playerPosition.findFirst({
                where: { roomId: setup.roomId, playerId: setup.playerIds[0] },
              });
              expect(pos!.locationId).toBe(location.id);

              // updatedLocationId should NOT be present for SKIP
              if (result.success) {
                expect(result.updatedLocationId).toBeUndefined();
              }
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);

    it("SKIP emits player-skipped event but no other side effects", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: allLocations.length - 1 }),
          async (locIdx: number) => {
            const location = allLocations[locIdx];

            const setup = await createGameSetup({
              playerCount: 2,
              currentPlayerIdx: 0,
              locationId: location.id,
            });

            try {
              // Submit SKIP
              const result = await submitAction(setup.roomId, setup.playerIds[0], {
                actionType: "SKIP",
              });

              expect(result.success).toBe(true);

              // A player-skipped event should be emitted (per design: SKIP emits event)
              const events = await prisma.gameEvent.findMany({
                where: { roomId: setup.roomId },
                orderBy: { sequenceNumber: "asc" },
              });
              expect(events.length).toBe(1);
              expect(events[0].type).toBe("player-skipped");
              const payload = events[0].payload as Record<string, unknown>;
              expect(payload.playerId).toBe(setup.playerIds[0]);

              // No notebook entries
              const notebook = await prisma.notebookEntry.findMany({
                where: { roomId: setup.roomId },
              });
              expect(notebook.length).toBe(0);

              // No action cards consumed
              const cards = await prisma.actionCard.findMany({
                where: { roomId: setup.roomId, consumed: true },
              });
              expect(cards.length).toBe(0);
            } finally {
              await cleanupRoom(setup.roomId);
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 300000);
  });
});
