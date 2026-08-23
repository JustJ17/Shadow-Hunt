// Feature: action-cards
// Property 4: Map Immutability
// **Validates: Requirements 4.7, 5.6, 7.5**
//
// For any sequence of card plays (blockade creation, blockade expiry,
// open-all-roads, drop-ship), the complete set of Adjacency rows and
// Location/Region rows is byte-identical before and after.
//
// Key insight: card handlers never call any create/update/delete on
// adjacency, location, or region tables. We mock the transaction, play
// various card effects, and verify that no mutation was called on those tables.

import fc from "fast-check";
import { describe, it, expect, vi } from "vitest";
import { handleCloseAllRoads, handleCloseAllAirways, handleCloseAllSeaRoutes } from "@/lib/turn-engine/cards/effects/blockade";
import { handleOpenAllRoads } from "@/lib/turn-engine/cards/effects/open-all-roads";
import { handleDropShip } from "@/lib/turn-engine/cards/effects/drop-ship";
import type { CardEffectContext } from "@/lib/turn-engine/cards/types";

// --- Mock helpers ---

/**
 * Builds a mock transaction that tracks all calls to adjacency, location,
 * and region tables. Write operations (create, update, updateMany, delete,
 * deleteMany, upsert) are spied on and expected to never be called.
 */
function makeMockTx() {
  const mutationMethods = () => ({
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockResolvedValue({}),
  });

  // Map tables — these must NEVER be mutated by card handlers
  const adjacency = {
    ...mutationMethods(),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockResolvedValue({ _max: {} }),
    count: vi.fn().mockResolvedValue(0),
  };

  const location = {
    ...mutationMethods(),
    findMany: vi.fn().mockResolvedValue([
      { id: "loc-1", regionId: "region-a" },
      { id: "loc-2", regionId: "region-a" },
      { id: "loc-3", regionId: "region-b" },
      { id: "loc-4", regionId: "region-b" },
      { id: "loc-5", regionId: "region-c" },
      { id: "loc-6", regionId: "region-c" },
    ]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockResolvedValue({ _max: {} }),
    count: vi.fn().mockResolvedValue(0),
  };

  const region = {
    ...mutationMethods(),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockResolvedValue({ _max: {} }),
    count: vi.fn().mockResolvedValue(0),
  };

  // Non-map tables (these are expected to be written to by card handlers)
  const blockade = {
    create: vi.fn().mockResolvedValue({ id: "blockade-1" }),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };

  const playerPosition = {
    update: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue({ locationId: "loc-1" }),
  };

  const gameEvent = {
    aggregate: vi.fn().mockResolvedValue({ _max: { sequenceNumber: 0 } }),
    create: vi.fn().mockResolvedValue({}),
  };

  const pendingClue = {
    create: vi.fn().mockResolvedValue({}),
  };

  const roomPlayer = {
    findUnique: vi.fn().mockResolvedValue({ playerId: "target-1", roomId: "room-1" }),
  };

  return {
    adjacency,
    location,
    region,
    blockade,
    playerPosition,
    gameEvent,
    pendingClue,
    roomPlayer,
  } as any;
}

/**
 * Asserts that no mutation method was called on any of the map tables
 * (adjacency, location, region).
 */
function assertMapTablesUnmutated(tx: ReturnType<typeof makeMockTx>) {
  const mapTables = ["adjacency", "location", "region"] as const;
  const writeMethods = ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"] as const;

  for (const table of mapTables) {
    for (const method of writeMethods) {
      expect(tx[table][method], `${table}.${method} should not have been called`).not.toHaveBeenCalled();
    }
  }
}

// --- Arbitraries ---

type BlockadeCardHandler = typeof handleCloseAllRoads;
type MapSafeCardHandler = BlockadeCardHandler | typeof handleOpenAllRoads | typeof handleDropShip;

const blockadeHandlers: { name: string; handler: BlockadeCardHandler }[] = [
  { name: "close-all-roads", handler: handleCloseAllRoads },
  { name: "close-all-airways", handler: handleCloseAllAirways },
  { name: "close-all-sea-routes", handler: handleCloseAllSeaRoutes },
];

const allMapSafeHandlers: { name: string; handler: MapSafeCardHandler }[] = [
  ...blockadeHandlers,
  { name: "open-all-roads", handler: handleOpenAllRoads },
  { name: "drop-ship", handler: handleDropShip },
];

const arbHandlerEntry = fc.constantFrom(...allMapSafeHandlers);

const arbHandlerSequence = fc.array(arbHandlerEntry, { minLength: 1, maxLength: 6 });

const arbRound = fc.integer({ min: 1, max: 20 });
const arbTurnPosition = fc.integer({ min: 0, max: 3 });
const arbRng = fc.double({ min: 0, max: 0.9999, noNaN: true });

// --- vi.mock for distance utility (drop-ship uses it) ---
vi.mock("@/lib/map/distance", () => ({
  getShortestPathDistance: vi.fn().mockResolvedValue(5),
}));

// --- Tests ---

describe("Property 4: Map Immutability", () => {
  // **Validates: Requirements 4.7, 5.6, 7.5**

  it("no card handler sequence mutates adjacency, location, or region tables", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbHandlerSequence,
        arbRound,
        arbTurnPosition,
        arbRng,
        async (handlers, round, turnPosition, rngValue) => {
          const tx = makeMockTx();

          // Execute each handler in sequence on the same transaction mock
          for (const { handler } of handlers) {
            const ctx: CardEffectContext = {
              roomId: "room-1",
              playerId: "player-1",
              targetPlayerId: undefined,
              playerLocationId: "loc-1",
              currentRound: round,
              casterTurnPosition: turnPosition,
              tx,
              rng: () => rngValue,
            };

            await handler(ctx);
          }

          // The core assertion: map tables must have no write operations
          assertMapTablesUnmutated(tx);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("blockade creation never writes to adjacency table", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...blockadeHandlers),
        arbRound,
        arbTurnPosition,
        async ({ handler }, round, turnPosition) => {
          const tx = makeMockTx();

          const ctx: CardEffectContext = {
            roomId: "room-1",
            playerId: "player-1",
            playerLocationId: "loc-1",
            currentRound: round,
            casterTurnPosition: turnPosition,
            tx,
            rng: Math.random,
          };

          await handler(ctx);

          assertMapTablesUnmutated(tx);

          // Additionally verify blockade was created (sanity check)
          expect(tx.blockade.create).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("open-all-roads lifting blockades never modifies adjacency, location, or region rows", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            transportType: fc.constantFrom("car", "plane", "boat"),
            casterPlayerId: fc.uuid(),
            creationRound: fc.integer({ min: 1, max: 10 }),
            casterTurnPosition: fc.integer({ min: 0, max: 3 }),
            lifted: fc.constant(false),
            roomId: fc.constant("room-1"),
          }),
          { minLength: 0, maxLength: 5 }
        ),
        arbRound,
        arbTurnPosition,
        async (existingBlockades, round, turnPosition) => {
          const tx = makeMockTx();

          // Set up blockade.findMany to return existing blockades
          // that are within the blockade window for this turn
          tx.blockade.findMany.mockResolvedValue(existingBlockades);

          const ctx: CardEffectContext = {
            roomId: "room-1",
            playerId: "player-1",
            playerLocationId: "loc-1",
            currentRound: round,
            casterTurnPosition: turnPosition,
            tx,
            rng: Math.random,
          };

          await handleOpenAllRoads(ctx);

          // Map tables must remain untouched
          assertMapTablesUnmutated(tx);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("drop-ship reads locations but never writes to adjacency, location, or region", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("loc-1", "loc-2", "loc-3", "loc-4", "loc-5", "loc-6"),
        arbRound,
        arbTurnPosition,
        arbRng,
        async (originLocationId, round, turnPosition, rngValue) => {
          const tx = makeMockTx();

          const ctx: CardEffectContext = {
            roomId: "room-1",
            playerId: "player-1",
            playerLocationId: originLocationId,
            currentRound: round,
            casterTurnPosition: turnPosition,
            tx,
            rng: () => rngValue,
          };

          await handleDropShip(ctx);

          // Map tables must remain untouched (drop-ship only reads location.findMany)
          assertMapTablesUnmutated(tx);

          // Verify that location.findMany was called (read is expected)
          expect(tx.location.findMany).toHaveBeenCalled();

          // Verify player was relocated (write to playerPosition is expected)
          expect(tx.playerPosition.update).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
