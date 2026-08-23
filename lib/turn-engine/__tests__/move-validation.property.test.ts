// Feature: movement-turn-actions
// Property 5: Move Adjacency Validation
// Property 6: Transport-Mode Movement Rules
// Property 7: Position Update on Valid Move
// Property 8: Sequential Slot Position Chaining
// **Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 7.3**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { validateAction } from "@/lib/turn-engine/validate-action";
import { executeMove } from "@/lib/turn-engine/actions/execute-move";
import type { TurnState, ActionCardData, BlockadeState } from "@/lib/turn-engine/types";
import type { AdjacentLocationWithTransport } from "@/lib/map/adjacency";

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

// Pre-computed adjacency lookup: locationId -> AdjacentLocationWithTransport[]
let adjacencyMap: Map<string, AdjacentLocationWithTransport[]>;
// Location lookup by id
let locationById: Map<string, LocationRecord>;

/**
 * Creates a mock TurnState for the given player.
 */
function makeTurnState(playerId: string): TurnState {
  return {
    id: "test-turn-state-id",
    roomId: "test-room-id",
    currentPlayerId: playerId,
    currentRound: 1,
    actionsRemaining: 2,
    actionBudget: 2,
    captureAttemptFlag: false,
    isExtraTurn: false,
    version: 0,
  };
}

const TEST_PLAYER_ID = "test-player-move-validation";
const EMPTY_CARDS: ActionCardData[] = [];
const NO_BLOCKADES: BlockadeState = { blockedTransports: new Set() };
const DEFAULT_ACTIONS_REMAINING = 2;

// Counter for generating unique room codes within rolled-back transactions
let roomCounter = 0;

describe("Move Validation Property Tests", () => {
  // **Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 7.3**

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

    allLocations = await prisma.location.findMany();
    allEdges = await prisma.adjacency.findMany();

    // Build location lookup
    locationById = new Map<string, LocationRecord>();
    for (const loc of allLocations) {
      locationById.set(loc.id, loc);
    }

    // Build adjacency map: for each location, compute its adjacent locations with transport info
    adjacencyMap = new Map<string, AdjacentLocationWithTransport[]>();
    for (const loc of allLocations) {
      adjacencyMap.set(loc.id, []);
    }
    for (const edge of allEdges) {
      const locA = locationById.get(edge.locationAId)!;
      const locB = locationById.get(edge.locationBId)!;

      // Add B as adjacent to A
      adjacencyMap.get(edge.locationAId)!.push({
        id: locB.id,
        name: locB.name,
        regionId: locB.regionId,
        isHub: locB.isHub,
        transport: edge.transport as "car" | "boat" | "plane",
        isSameRegion: edge.isSameRegion,
      });

      // Add A as adjacent to B (edges are bidirectional)
      adjacencyMap.get(edge.locationBId)!.push({
        id: locA.id,
        name: locA.name,
        regionId: locA.regionId,
        isHub: locA.isHub,
        transport: edge.transport as "car" | "boat" | "plane",
        isSameRegion: edge.isSameRegion,
      });
    }
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Property 5: Move Adjacency Validation", () => {
    // **Validates: Requirements 3.1, 3.4, 3.8**

    it("MOVE to an adjacent location (non-plane or valid plane) is accepted", async () => {
      expect(allLocations.length).toBe(40);

      // Build valid move pairs: location + adjacent target (filtering plane to hub-only)
      const validMovePairs: { source: LocationRecord; target: string }[] = [];
      for (const loc of allLocations) {
        const adjacent = adjacencyMap.get(loc.id)!;
        for (const adj of adjacent) {
          // For plane edges, both endpoints must be hubs
          if (adj.transport === "plane") {
            if (loc.isHub && adj.isHub) {
              validMovePairs.push({ source: loc, target: adj.id });
            }
          } else {
            validMovePairs.push({ source: loc, target: adj.id });
          }
        }
      }

      expect(validMovePairs.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...validMovePairs),
          async (pair: { source: LocationRecord; target: string }) => {
            const turnState = makeTurnState(TEST_PLAYER_ID);
            const adjacentLocations = adjacencyMap.get(pair.source.id)!;

            const result = validateAction(
              { actionType: "MOVE", targetLocationId: pair.target },
              turnState,
              TEST_PLAYER_ID,
              pair.source.id,
              adjacentLocations,
              EMPTY_CARDS,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );

            // Should be valid (null means no error)
            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);

    it("MOVE to a non-adjacent location is rejected with INVALID_MOVE", async () => {
      // Build non-adjacent pairs: for each location, pick a location that is NOT adjacent
      const nonAdjacentPairs: { source: LocationRecord; target: string }[] = [];
      for (const loc of allLocations) {
        const adjacentIds = new Set(adjacencyMap.get(loc.id)!.map((a) => a.id));
        for (const other of allLocations) {
          if (other.id !== loc.id && !adjacentIds.has(other.id)) {
            nonAdjacentPairs.push({ source: loc, target: other.id });
          }
        }
      }

      expect(nonAdjacentPairs.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...nonAdjacentPairs),
          async (pair: { source: LocationRecord; target: string }) => {
            const turnState = makeTurnState(TEST_PLAYER_ID);
            const adjacentLocations = adjacencyMap.get(pair.source.id)!;

            const result = validateAction(
              { actionType: "MOVE", targetLocationId: pair.target },
              turnState,
              TEST_PLAYER_ID,
              pair.source.id,
              adjacentLocations,
              EMPTY_CARDS,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );

            // Should be rejected
            expect(result).not.toBeNull();
            expect(result!.code).toBe("INVALID_MOVE");
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);

    it("MOVE to same location is rejected with SAME_LOCATION_MOVE", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allLocations),
          async (loc: LocationRecord) => {
            const turnState = makeTurnState(TEST_PLAYER_ID);
            const adjacentLocations = adjacencyMap.get(loc.id)!;

            const result = validateAction(
              { actionType: "MOVE", targetLocationId: loc.id },
              turnState,
              TEST_PLAYER_ID,
              loc.id,
              adjacentLocations,
              EMPTY_CARDS,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );

            expect(result).not.toBeNull();
            expect(result!.code).toBe("SAME_LOCATION_MOVE");
          }
        ),
        { numRuns: 40 }
      );
    }, 30000);
  });

  describe("Property 6: Transport-Mode Movement Rules", () => {
    // **Validates: Requirements 3.2, 3.3, 3.5**

    it("car/boat edges are always valid regardless of hub status", async () => {
      // Collect all car/boat edge pairs
      const carBoatPairs: {
        source: LocationRecord;
        target: AdjacentLocationWithTransport;
      }[] = [];
      for (const loc of allLocations) {
        const adjacent = adjacencyMap.get(loc.id)!;
        for (const adj of adjacent) {
          if (adj.transport === "car" || adj.transport === "boat") {
            carBoatPairs.push({ source: loc, target: adj });
          }
        }
      }

      expect(carBoatPairs.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...carBoatPairs),
          async (pair: {
            source: LocationRecord;
            target: AdjacentLocationWithTransport;
          }) => {
            const turnState = makeTurnState(TEST_PLAYER_ID);
            const adjacentLocations = adjacencyMap.get(pair.source.id)!;

            const result = validateAction(
              { actionType: "MOVE", targetLocationId: pair.target.id },
              turnState,
              TEST_PLAYER_ID,
              pair.source.id,
              adjacentLocations,
              EMPTY_CARDS,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );

            // Car and boat edges should always be valid
            expect(result).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    }, 60000);

    it("plane edges valid only if target isHub=true", async () => {
      // Collect all plane edges
      const planeEdges: {
        source: LocationRecord;
        target: AdjacentLocationWithTransport;
      }[] = [];
      for (const loc of allLocations) {
        const adjacent = adjacencyMap.get(loc.id)!;
        for (const adj of adjacent) {
          if (adj.transport === "plane") {
            planeEdges.push({ source: loc, target: adj });
          }
        }
      }

      expect(planeEdges.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...planeEdges),
          async (pair: {
            source: LocationRecord;
            target: AdjacentLocationWithTransport;
          }) => {
            const turnState = makeTurnState(TEST_PLAYER_ID);
            const adjacentLocations = adjacencyMap.get(pair.source.id)!;

            const result = validateAction(
              { actionType: "MOVE", targetLocationId: pair.target.id },
              turnState,
              TEST_PLAYER_ID,
              pair.source.id,
              adjacentLocations,
              EMPTY_CARDS,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );

            if (pair.target.isHub) {
              // Valid plane edge (both endpoints are hubs since map only creates plane edges between hubs)
              expect(result).toBeNull();
            } else {
              // Invalid plane edge — target is not a hub
              expect(result).not.toBeNull();
              expect(result!.code).toBe("INVALID_TRANSPORT");
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });

  describe("Property 7: Position Update on Valid Move", () => {
    // **Validates: Requirements 3.6, 7.3**

    it("after executeMove, player position equals targetLocationId", async () => {
      // Build valid move pairs (car/boat only for simplicity — always valid)
      const validMovePairs: { source: LocationRecord; target: string }[] = [];
      for (const loc of allLocations) {
        const adjacent = adjacencyMap.get(loc.id)!;
        for (const adj of adjacent) {
          if (adj.transport === "car" || adj.transport === "boat") {
            validMovePairs.push({ source: loc, target: adj.id });
          }
        }
      }

      expect(validMovePairs.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...validMovePairs),
          async (pair: { source: LocationRecord; target: string }) => {
            // Run within a transaction that rolls back to avoid polluting the database
            await prisma
              .$transaction(async (tx) => {
                // Create a temporary room for FK constraint satisfaction
                const room = await tx.room.create({
                  data: {
                    code: `MV${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                  },
                });

                // Create a temporary player position at the source location
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    locationId: pair.source.id,
                    skipNextTurn: false,
                  },
                });

                // Execute the move
                await executeMove(
                  TEST_PLAYER_ID,
                  room.id,
                  pair.target,
                  tx
                );

                // Read back the position
                const position = await tx.playerPosition.findUnique({
                  where: {
                    roomId_playerId: {
                      roomId: room.id,
                      playerId: TEST_PLAYER_ID,
                    },
                  },
                  select: { locationId: true },
                });

                // After executeMove, position should equal the target
                expect(position).not.toBeNull();
                expect(position!.locationId).toBe(pair.target);

                // Rollback the transaction by throwing
                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);
  });

  describe("Property 8: Sequential Slot Position Chaining", () => {
    // **Validates: Requirements 2.2, 3.7**

    it("second action validates from post-move position (slot 1 MOVE to T1, slot 2 validates from T1)", async () => {
      // Build move chains: source -> T1 -> T2 where T1 is adjacent to source
      // and T2 is adjacent to T1 (but NOT necessarily adjacent to source)
      const moveChains: {
        source: LocationRecord;
        t1: string;
        t2: string;
      }[] = [];

      for (const loc of allLocations) {
        const adjacent = adjacencyMap.get(loc.id)!;
        for (const adj of adjacent) {
          // Only car/boat for slot 1 (always valid)
          if (adj.transport !== "car" && adj.transport !== "boat") continue;

          const t1Adjacent = adjacencyMap.get(adj.id)!;
          for (const adj2 of t1Adjacent) {
            // Only car/boat for slot 2 (always valid)
            if (adj2.transport !== "car" && adj2.transport !== "boat") continue;
            // T2 must differ from T1
            if (adj2.id === adj.id) continue;

            moveChains.push({ source: loc, t1: adj.id, t2: adj2.id });
          }
        }
      }

      expect(moveChains.length).toBeGreaterThan(0);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...moveChains),
          async (chain: { source: LocationRecord; t1: string; t2: string }) => {
            // Simulate slot 1: validate MOVE from source to T1
            const turnStateSlot1 = makeTurnState(TEST_PLAYER_ID);
            const adjacentFromSource = adjacencyMap.get(chain.source.id)!;

            const slot1Result = validateAction(
              { actionType: "MOVE", targetLocationId: chain.t1 },
              turnStateSlot1,
              TEST_PLAYER_ID,
              chain.source.id,
              adjacentFromSource,
              EMPTY_CARDS,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );
            expect(slot1Result).toBeNull();

            // Simulate slot 2: validate MOVE from T1 (post-move position) to T2
            const turnStateSlot2: TurnState = {
              ...turnStateSlot1,
              actionsRemaining: 1,
            };
            const adjacentFromT1 = adjacencyMap.get(chain.t1)!;

            const slot2Result = validateAction(
              { actionType: "MOVE", targetLocationId: chain.t2 },
              turnStateSlot2,
              TEST_PLAYER_ID,
              chain.t1, // Player's position is now T1 after slot 1 MOVE
              adjacentFromT1,
              EMPTY_CARDS,
              NO_BLOCKADES,
              turnStateSlot2.actionsRemaining
            );

            // Slot 2 validates from T1, so MOVE to T2 (adjacent to T1) should be valid
            expect(slot2Result).toBeNull();

            // Also verify that validating slot 2 from the ORIGINAL source position
            // would correctly reject T2 if T2 is not adjacent to source
            // (and T2 != source, to avoid SAME_LOCATION_MOVE taking precedence)
            const t2AdjacentToSource = adjacentFromSource.some(
              (a) => a.id === chain.t2
            );
            const t2IsSource = chain.t2 === chain.source.id;
            if (!t2AdjacentToSource && !t2IsSource) {
              const wrongSlot2Result = validateAction(
                { actionType: "MOVE", targetLocationId: chain.t2 },
                turnStateSlot2,
                TEST_PLAYER_ID,
                chain.source.id, // Wrong! Using pre-move position
                adjacentFromSource,
                EMPTY_CARDS,
                NO_BLOCKADES,
                turnStateSlot2.actionsRemaining
              );
              // Should be rejected since T2 is not adjacent to source
              expect(wrongSlot2Result).not.toBeNull();
              expect(wrongSlot2Result!.code).toBe("INVALID_MOVE");
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });
});
