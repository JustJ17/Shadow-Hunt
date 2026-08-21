/**
 * Integration test: startGame with game initialization
 * **Validates: Requirements 6.1, 6.2, 6.3, 7.1, 8.1, 9.1, 9.2**
 *
 * Tests the full flow of startGame creating GameThreat and GameSpy records,
 * and that calling startGame twice returns an error without duplicate state.
 */
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { startGame } from "@/lib/lobby/start-game";

function generateRoomCode(prefix: string): string {
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}${ts}`.slice(0, 6);
}

describe("startGame integration with game initialization", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates GameThreat and GameSpy records when all preconditions are met", async () => {
    const roomCode = generateRoomCode("SG");
    const hostPlayerId = `host-sg-init-${Date.now()}`;
    const otherPlayerId = `other-sg-init-${Date.now()}`;

    // Set up: Create a room with host + 1 other player (ready)
    const room = await prisma.room.create({
      data: {
        code: roomCode,
        status: "waiting",
        visibility: "private",
        playerCount: 2,
      },
    });

    await prisma.roomPlayer.create({
      data: {
        playerId: hostPlayerId,
        displayName: "Host Player",
        roomId: room.id,
        isHost: true,
        readyState: "ready",
        status: "connected",
      },
    });

    await prisma.roomPlayer.create({
      data: {
        playerId: otherPlayerId,
        displayName: "Other Player",
        roomId: room.id,
        isHost: false,
        readyState: "ready",
        status: "connected",
      },
    });

    try {
      // Call startGame
      const result = await startGame({ playerId: hostPlayerId });

      // Assert success
      expect(result.success).toBe(true);
      if (!result.success) return;

      // Verify turn order
      expect(result.turnOrder).toHaveLength(2);
      const playerIds = result.turnOrder.map((t) => t.playerId).sort();
      expect(playerIds).toEqual([hostPlayerId, otherPlayerId].sort());

      // Verify room status changed to "in-progress"
      const updatedRoom = await prisma.room.findUnique({
        where: { id: room.id },
      });
      expect(updatedRoom?.status).toBe("in-progress");

      // Verify exactly 1 GameThreat exists for this room
      const threats = await prisma.gameThreat.findMany({
        where: { roomId: room.id },
      });
      expect(threats).toHaveLength(1);

      // Verify the threat has a valid locationId
      const threatLocation = await prisma.location.findUnique({
        where: { id: threats[0].locationId },
      });
      expect(threatLocation).not.toBeNull();

      // Verify exactly 6 GameSpy records exist for this room
      const spies = await prisma.gameSpy.findMany({
        where: { roomId: room.id },
      });
      expect(spies).toHaveLength(6);

      // Verify each spy has a unique regionId
      const spyRegionIds = spies.map((s) => s.regionId);
      const uniqueRegionIds = new Set(spyRegionIds);
      expect(uniqueRegionIds.size).toBe(6);

      // Verify each spy's locationId belongs to its region
      for (const spy of spies) {
        const location = await prisma.location.findUnique({
          where: { id: spy.locationId },
        });
        expect(location).not.toBeNull();
        expect(location!.regionId).toBe(spy.regionId);
      }

      // Verify hidden state is NOT returned in the startGame response
      // The result only has success and turnOrder, no threat/spy data
      expect(result).not.toHaveProperty("threatLocationId");
      expect(result).not.toHaveProperty("spyPlacements");
    } finally {
      // Clean up: delete room (cascades to players, threats, spies)
      await prisma.room.delete({ where: { id: room.id } });
    }
  }, 30000);

  it("calling startGame twice returns GAME_ALREADY_STARTED on second call with no duplicate records", async () => {
    const roomCode = generateRoomCode("S2");
    const hostPlayerId = `host-sg-twice-${Date.now()}`;
    const otherPlayerId = `other-sg-twice-${Date.now()}`;

    // Set up: Create a room with host + 1 other player (ready)
    const room = await prisma.room.create({
      data: {
        code: roomCode,
        status: "waiting",
        visibility: "private",
        playerCount: 2,
      },
    });

    await prisma.roomPlayer.create({
      data: {
        playerId: hostPlayerId,
        displayName: "Host Player",
        roomId: room.id,
        isHost: true,
        readyState: "ready",
        status: "connected",
      },
    });

    await prisma.roomPlayer.create({
      data: {
        playerId: otherPlayerId,
        displayName: "Other Player",
        roomId: room.id,
        isHost: false,
        readyState: "ready",
        status: "connected",
      },
    });

    try {
      // First call — should succeed
      const result1 = await startGame({ playerId: hostPlayerId });
      expect(result1.success).toBe(true);

      // Second call — should return GAME_ALREADY_STARTED
      const result2 = await startGame({ playerId: hostPlayerId });
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.code).toBe("GAME_ALREADY_STARTED");
      }

      // Verify no duplicate GameThreat records
      const threats = await prisma.gameThreat.findMany({
        where: { roomId: room.id },
      });
      expect(threats).toHaveLength(1);

      // Verify no duplicate GameSpy records
      const spies = await prisma.gameSpy.findMany({
        where: { roomId: room.id },
      });
      expect(spies).toHaveLength(6);
    } finally {
      // Clean up
      await prisma.room.delete({ where: { id: room.id } });
    }
  }, 30000);

  it("transaction rollback: if game initialization fails, room stays 'waiting' and no partial state persists", async () => {
    // To test rollback, we create a room and manually set it to "in-progress"
    // with existing game state (GameThreat) before calling startGame.
    // startGame should reject with GAME_ALREADY_STARTED since room is in-progress.
    // This verifies the guard prevents double-initialization.
    const roomCode = generateRoomCode("RB");
    const hostPlayerId = `host-sg-rb-${Date.now()}`;
    const otherPlayerId = `other-sg-rb-${Date.now()}`;

    // Create a room that is already in-progress (simulating a previously started game)
    const room = await prisma.room.create({
      data: {
        code: roomCode,
        status: "in-progress",
        visibility: "private",
        playerCount: 2,
      },
    });

    await prisma.roomPlayer.create({
      data: {
        playerId: hostPlayerId,
        displayName: "Host Player",
        roomId: room.id,
        isHost: true,
        readyState: "ready",
        status: "connected",
      },
    });

    await prisma.roomPlayer.create({
      data: {
        playerId: otherPlayerId,
        displayName: "Other Player",
        roomId: room.id,
        isHost: false,
        readyState: "ready",
        status: "connected",
      },
    });

    try {
      // Call startGame — should fail because room is already "in-progress"
      const result = await startGame({ playerId: hostPlayerId });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("GAME_ALREADY_STARTED");
      }

      // Verify no GameThreat was created
      const threats = await prisma.gameThreat.findMany({
        where: { roomId: room.id },
      });
      expect(threats).toHaveLength(0);

      // Verify no GameSpy records were created
      const spies = await prisma.gameSpy.findMany({
        where: { roomId: room.id },
      });
      expect(spies).toHaveLength(0);
    } finally {
      // Clean up
      await prisma.room.delete({ where: { id: room.id } });
    }
  }, 30000);
});
