import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomPlayer: { findMany: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    room: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { processDisconnections, checkAbandonedRooms } from "../disconnection";
import { prisma } from "@/lib/prisma";

const mockRoomPlayerFindMany = prisma.roomPlayer.findMany as ReturnType<
  typeof vi.fn
>;
const mockRoomPlayerUpdateMany = prisma.roomPlayer.updateMany as ReturnType<
  typeof vi.fn
>;
const mockRoomPlayerDelete = prisma.roomPlayer.delete as ReturnType<
  typeof vi.fn
>;
const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockRoomFindMany = prisma.room.findMany as ReturnType<typeof vi.fn>;
const mockRoomUpdate = prisma.room.update as ReturnType<typeof vi.fn>;
const mockRoomDelete = prisma.room.delete as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

// Arbitraries
const validRoomId = fc.uuid();
const validPlayerId = fc.uuid();
const validDisplayName = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

// Generate a number of seconds past the disconnect threshold (> 10s)
const staleSecondsArb = fc.integer({ min: 11, max: 300 });

// Generate a number of seconds within the connect threshold (< 10s)
const freshSecondsArb = fc.integer({ min: 0, max: 9 });

// Generate minutes past the forfeit threshold (> 5 min)
const forfeitMinutesArb = fc.integer({ min: 6, max: 60 });

// Generate seconds past the abandon threshold (> 60s)
const abandonSecondsArb = fc.integer({ min: 61, max: 600 });

// Generate 1-4 stale player records
const stalePlayersArb = (roomId: string, now: Date) =>
  fc
    .array(
      fc.record({
        id: fc.uuid(),
        playerId: fc.uuid(),
        displayName: validDisplayName,
        roomId: fc.constant(roomId),
        isHost: fc.constant(false),
        status: fc.constant("connected"),
        readyState: fc.constant("not-ready"),
        lastActivityAt: staleSecondsArb.map(
          (secs) => new Date(now.getTime() - secs * 1000)
        ),
        joinedAt: fc.constant(new Date(now.getTime() - 60000)),
        disconnectedAt: fc.constant(null),
        turnPosition: fc.constant(null),
      }),
      { minLength: 1, maxLength: 4 }
    );

/**
 * Property 14: Disconnection detection and reconnection
 * **Validates: Requirements 11.1, 11.3**
 *
 * If a player's lastActivityAt is older than 10s, processDisconnections
 * marks them as "disconnected".
 */
describe("Disconnection detection - Property 14", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Property 14: Players with lastActivityAt older than 10s are marked disconnected", async () => {
    await fc.assert(
      fc.asyncProperty(
        validRoomId,
        fc.array(
          fc.record({
            id: fc.uuid(),
            playerId: fc.uuid(),
            displayName: validDisplayName,
            isHost: fc.constant(false),
            status: fc.constant("connected"),
            readyState: fc.constant("not-ready"),
            disconnectedAt: fc.constant(null),
            turnPosition: fc.constant(null),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        staleSecondsArb,
        async (roomId, players, staleSecs) => {
          const now = new Date("2024-01-01T12:00:00.000Z");
          vi.setSystemTime(now);

          // Create stale players with lastActivityAt older than 10s
          const stalePlayers = players.map((p) => ({
            ...p,
            roomId,
            lastActivityAt: new Date(now.getTime() - staleSecs * 1000),
            joinedAt: new Date(now.getTime() - 60000),
          }));

          // findMany returns stale players
          mockRoomPlayerFindMany.mockResolvedValue(stalePlayers);
          mockRoomPlayerUpdateMany.mockResolvedValue({ count: stalePlayers.length });

          // Room refetch after marking disconnections - return "waiting" room with no host issues
          mockRoomFindUnique.mockResolvedValue({
            id: roomId,
            status: "waiting",
            players: stalePlayers.map((p) => ({
              ...p,
              status: "disconnected",
              disconnectedAt: now,
            })),
          });

          // Room delete for case where no connected players remain
          mockRoomDelete.mockResolvedValue({});

          await processDisconnections(roomId);

          // Verify updateMany was called to mark players as disconnected
          expect(mockRoomPlayerUpdateMany).toHaveBeenCalledWith({
            where: {
              id: { in: stalePlayers.map((p) => p.id) },
            },
            data: {
              status: "disconnected",
              disconnectedAt: now,
            },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 14: Players with recent activity are NOT marked disconnected", async () => {
    await fc.assert(
      fc.asyncProperty(
        validRoomId,
        freshSecondsArb,
        async (roomId, freshSecs) => {
          const now = new Date("2024-01-01T12:00:00.000Z");
          vi.setSystemTime(now);

          // findMany returns no stale players (all are fresh)
          mockRoomPlayerFindMany.mockResolvedValue([]);

          await processDisconnections(roomId);

          // updateMany should NOT have been called since no stale players found
          expect(mockRoomPlayerUpdateMany).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 16: Room abandonment on total disconnection
 * **Validates: Requirements 11.7**
 *
 * If all players in an "in-progress" room are disconnected and the earliest
 * disconnectedAt is > 60s, checkAbandonedRooms sets room status to "abandoned".
 */
describe("Room abandonment - Property 16", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Property 16: Room is abandoned when all players disconnected > 60s", async () => {
    await fc.assert(
      fc.asyncProperty(
        validRoomId,
        fc.array(
          fc.record({
            id: fc.uuid(),
            playerId: fc.uuid(),
            displayName: validDisplayName,
          }),
          { minLength: 1, maxLength: 4 }
        ),
        abandonSecondsArb,
        async (roomId, playerBases, abandonSecs) => {
          const now = new Date("2024-01-01T12:00:00.000Z");
          vi.setSystemTime(now);

          const disconnectedAt = new Date(now.getTime() - abandonSecs * 1000);

          const players = playerBases.map((p) => ({
            ...p,
            roomId,
            status: "disconnected",
            disconnectedAt,
            isHost: false,
            readyState: "not-ready",
            turnPosition: null,
          }));

          // findMany returns rooms in "in-progress" status
          mockRoomFindMany.mockResolvedValue([
            {
              id: roomId,
              status: "in-progress",
              players,
            },
          ]);

          mockRoomUpdate.mockResolvedValue({});

          await checkAbandonedRooms();

          // Room should be marked as abandoned
          expect(mockRoomUpdate).toHaveBeenCalledWith({
            where: { id: roomId },
            data: { status: "abandoned" },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 16: Room is NOT abandoned when disconnection is under 60s", async () => {
    await fc.assert(
      fc.asyncProperty(
        validRoomId,
        fc.array(
          fc.record({
            id: fc.uuid(),
            playerId: fc.uuid(),
            displayName: validDisplayName,
          }),
          { minLength: 1, maxLength: 4 }
        ),
        fc.integer({ min: 1, max: 59 }),
        async (roomId, playerBases, recentSecs) => {
          const now = new Date("2024-01-01T12:00:00.000Z");
          vi.setSystemTime(now);

          const disconnectedAt = new Date(now.getTime() - recentSecs * 1000);

          const players = playerBases.map((p) => ({
            ...p,
            roomId,
            status: "disconnected",
            disconnectedAt,
            isHost: false,
            readyState: "not-ready",
            turnPosition: null,
          }));

          mockRoomFindMany.mockResolvedValue([
            {
              id: roomId,
              status: "in-progress",
              players,
            },
          ]);

          await checkAbandonedRooms();

          // Room should NOT be marked as abandoned
          expect(mockRoomUpdate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 16: Room is NOT abandoned when at least one player is connected", async () => {
    await fc.assert(
      fc.asyncProperty(
        validRoomId,
        fc.array(
          fc.record({
            id: fc.uuid(),
            playerId: fc.uuid(),
            displayName: validDisplayName,
          }),
          { minLength: 2, maxLength: 4 }
        ),
        abandonSecondsArb,
        async (roomId, playerBases, abandonSecs) => {
          const now = new Date("2024-01-01T12:00:00.000Z");
          vi.setSystemTime(now);

          const disconnectedAt = new Date(now.getTime() - abandonSecs * 1000);

          // Make one player connected
          const players = playerBases.map((p, i) => ({
            ...p,
            roomId,
            status: i === 0 ? "connected" : "disconnected",
            disconnectedAt: i === 0 ? null : disconnectedAt,
            isHost: false,
            readyState: "not-ready",
            turnPosition: null,
          }));

          mockRoomFindMany.mockResolvedValue([
            {
              id: roomId,
              status: "in-progress",
              players,
            },
          ]);

          await checkAbandonedRooms();

          // Room should NOT be marked as abandoned (not all disconnected)
          expect(mockRoomUpdate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 17: Forfeit on extended disconnection
 * **Validates: Requirements 11.8**
 *
 * If a player in an "in-progress" room has been disconnected > 5 minutes,
 * processDisconnections removes them (deletes RoomPlayer, decrements playerCount).
 */
describe("Forfeit on extended disconnection - Property 17", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Property 17: Players disconnected > 5 minutes in in-progress games are forfeited", async () => {
    await fc.assert(
      fc.asyncProperty(
        validRoomId,
        fc.record({
          id: fc.uuid(),
          playerId: fc.uuid(),
          displayName: validDisplayName,
        }),
        forfeitMinutesArb,
        async (roomId, playerBase, forfeitMins) => {
          const now = new Date("2024-01-01T12:00:00.000Z");
          vi.setSystemTime(now);

          const disconnectedAt = new Date(
            now.getTime() - forfeitMins * 60 * 1000
          );

          const forfeitPlayer = {
            ...playerBase,
            roomId,
            status: "disconnected",
            disconnectedAt,
            isHost: false,
            readyState: "not-ready",
            turnPosition: 1,
            joinedAt: new Date(now.getTime() - 3600000),
            lastActivityAt: new Date(now.getTime() - forfeitMins * 60 * 1000),
          };

          // A connected player to keep room alive
          const connectedPlayer = {
            id: "connected-player-id",
            playerId: "connected-pid",
            displayName: "Connected",
            roomId,
            status: "connected",
            disconnectedAt: null,
            isHost: true,
            readyState: "not-ready",
            turnPosition: 2,
            joinedAt: new Date(now.getTime() - 3600000),
            lastActivityAt: now,
          };

          // We need at least one stale player so the function doesn't return early.
          // Use a "dummy" stale player that gets marked disconnected in the first pass.
          const dummyStalePlayer = {
            id: "stale-dummy-id",
            playerId: "stale-dummy-pid",
            displayName: "Stale",
            roomId,
            status: "connected",
            lastActivityAt: new Date(now.getTime() - 15000), // 15s ago = stale
            joinedAt: new Date(now.getTime() - 3600000),
          };

          // findMany returns the stale player
          mockRoomPlayerFindMany.mockResolvedValue([dummyStalePlayer]);
          mockRoomPlayerUpdateMany.mockResolvedValue({ count: 1 });

          // After marking disconnections, refetch room - now show in-progress room with forfeit player
          mockRoomFindUnique.mockResolvedValue({
            id: roomId,
            status: "in-progress",
            players: [forfeitPlayer, connectedPlayer],
          });

          // Mock the $transaction to resolve
          mockTransaction.mockResolvedValue([{}, {}]);

          // These are called within $transaction array construction
          mockRoomPlayerDelete.mockResolvedValue({});
          mockRoomUpdate.mockResolvedValue({});

          await processDisconnections(roomId);

          // Verify $transaction was called for the forfeited player
          expect(mockTransaction).toHaveBeenCalled();

          // The transaction should include the results of delete and update calls
          const transactionCalls = mockTransaction.mock.calls[0][0];
          expect(transactionCalls).toHaveLength(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 17: Players disconnected < 5 minutes are NOT forfeited", async () => {
    await fc.assert(
      fc.asyncProperty(
        validRoomId,
        fc.record({
          id: fc.uuid(),
          playerId: fc.uuid(),
          displayName: validDisplayName,
        }),
        fc.integer({ min: 1, max: 4 }),
        async (roomId, playerBase, recentMins) => {
          const now = new Date("2024-01-01T12:00:00.000Z");
          vi.setSystemTime(now);

          const disconnectedAt = new Date(
            now.getTime() - recentMins * 60 * 1000
          );

          const recentlyDisconnectedPlayer = {
            ...playerBase,
            roomId,
            status: "disconnected",
            disconnectedAt,
            isHost: false,
            readyState: "not-ready",
            turnPosition: 1,
            joinedAt: new Date(now.getTime() - 3600000),
            lastActivityAt: new Date(now.getTime() - recentMins * 60 * 1000),
          };

          const connectedPlayer = {
            id: "connected-player-id",
            playerId: "connected-pid",
            displayName: "Connected",
            roomId,
            status: "connected",
            disconnectedAt: null,
            isHost: true,
            readyState: "not-ready",
            turnPosition: 2,
            joinedAt: new Date(now.getTime() - 3600000),
            lastActivityAt: now,
          };

          // Need a stale player so function doesn't exit early
          const dummyStalePlayer = {
            id: "stale-dummy-id",
            playerId: "stale-dummy-pid",
            displayName: "Stale",
            roomId,
            status: "connected",
            lastActivityAt: new Date(now.getTime() - 15000),
            joinedAt: new Date(now.getTime() - 3600000),
          };

          mockRoomPlayerFindMany.mockResolvedValue([dummyStalePlayer]);
          mockRoomPlayerUpdateMany.mockResolvedValue({ count: 1 });

          // Room in-progress with recently disconnected player (< 5 min)
          mockRoomFindUnique.mockResolvedValue({
            id: roomId,
            status: "in-progress",
            players: [recentlyDisconnectedPlayer, connectedPlayer],
          });

          await processDisconnections(roomId);

          // $transaction should NOT be called for forfeit (< 5 minutes)
          expect(mockTransaction).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
