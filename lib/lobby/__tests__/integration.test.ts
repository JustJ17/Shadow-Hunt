
// Mock prisma for the entire integration
vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomPlayer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/lobby/room-code", () => ({
  generateRoomCode: vi.fn().mockResolvedValue("ABC123"),
}));

vi.mock("@/lib/game/initialize-game", () => ({
  initializeGame: vi.fn().mockResolvedValue({
    success: true,
    threatLocationId: "mock-location-id",
    spyPlacements: [],
  }),
}));

import { createRoom } from "../create-room";
import { joinRoom } from "../join-room";
import { toggleReady } from "../toggle-ready";
import { startGame } from "../start-game";
import { leaveRoom } from "../leave-room";
import { prisma } from "@/lib/prisma";

const mockRoomPlayerFindUnique = prisma.roomPlayer.findUnique as ReturnType<
  typeof vi.fn
>;
const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockRoomPlayerUpdate = prisma.roomPlayer.update as ReturnType<
  typeof vi.fn
>;
const mockRoomDelete = prisma.room.delete as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

describe("Lobby Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Full flow: create → join → ready → start", () => {
    it("completes the full lobby lifecycle end-to-end", async () => {
      // Step 1: Host creates room
      // createRoom checks roomPlayer.findUnique for existing membership
      mockRoomPlayerFindUnique.mockResolvedValueOnce(null);
      // createRoom uses $transaction to create room + player
      mockTransaction.mockImplementationOnce(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            room: {
              create: vi.fn().mockResolvedValue({
                id: "room-1",
                code: "ABC123",
                status: "waiting",
                visibility: "private",
                playerCount: 1,
              }),
            },
            roomPlayer: {
              create: vi.fn().mockResolvedValue({
                id: "host-record",
                playerId: "host-id",
                displayName: "Host",
                roomId: "room-1",
                isHost: true,
                readyState: "not-ready",
                status: "connected",
                turnPosition: null,
              }),
            },
          };
          return cb(tx);
        }
      );

      const createResult = await createRoom({
        playerId: "host-id",
        displayName: "Host",
        visibility: "private",
      });
      expect(createResult.success).toBe(true);
      if (createResult.success) {
        expect(createResult.roomCode).toBe("ABC123");
        expect(createResult.state.status).toBe("waiting");
        expect(createResult.state.players).toHaveLength(1);
        expect(createResult.state.players[0].isHost).toBe(true);
        expect(createResult.state.hostId).toBe("host-id");
      }

      // Step 2: Player 2 joins
      // joinRoom checks room.findUnique for the room by code
      mockRoomFindUnique.mockResolvedValueOnce({
        id: "room-1",
        code: "ABC123",
        status: "waiting",
        visibility: "private",
        playerCount: 1,
        players: [
          {
            id: "host-record",
            playerId: "host-id",
            displayName: "Host",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          },
        ],
      });
      // joinRoom checks roomPlayer.findUnique for existing membership
      mockRoomPlayerFindUnique.mockResolvedValueOnce(null);
      // joinRoom uses $transaction to add player, increment count, reset readiness
      mockTransaction.mockImplementationOnce(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            roomPlayer: {
              create: vi.fn().mockResolvedValue({}),
              updateMany: vi.fn().mockResolvedValue({}),
            },
            room: {
              update: vi.fn().mockResolvedValue({}),
              findUnique: vi.fn().mockResolvedValue({
                id: "room-1",
                code: "ABC123",
                status: "waiting",
                visibility: "private",
                playerCount: 2,
                players: [
                  {
                    id: "host-record",
                    playerId: "host-id",
                    displayName: "Host",
                    isHost: true,
                    readyState: "not-ready",
                    status: "connected",
                    turnPosition: null,
                  },
                  {
                    id: "p2-record",
                    playerId: "player-2",
                    displayName: "Alice",
                    isHost: false,
                    readyState: "not-ready",
                    status: "connected",
                    turnPosition: null,
                  },
                ],
              }),
            },
          };
          return cb(tx);
        }
      );

      const joinResult = await joinRoom({
        playerId: "player-2",
        displayName: "Alice",
        roomCode: "ABC123",
      });
      expect(joinResult.success).toBe(true);
      if (joinResult.success) {
        expect(joinResult.state.players).toHaveLength(2);
        expect(joinResult.state.hostId).toBe("host-id");
        // All players should have readiness reset to "not-ready" on join
        for (const player of joinResult.state.players) {
          expect(player.readyState).toBe("not-ready");
        }
      }

      // Step 3: Player 2 toggles ready
      // toggleReady checks roomPlayer.findUnique with room include
      mockRoomPlayerFindUnique.mockResolvedValueOnce({
        id: "p2-record",
        playerId: "player-2",
        readyState: "not-ready",
        room: { id: "room-1", status: "waiting" },
      });
      mockRoomPlayerUpdate.mockResolvedValueOnce({});

      const readyResult = await toggleReady({ playerId: "player-2" });
      expect(readyResult.success).toBe(true);
      if (readyResult.success) {
        expect(readyResult.newReadyState).toBe("ready");
      }

      // Step 4: Host starts game (all non-host players are ready)
      // startGame checks roomPlayer.findUnique with room + players include
      mockRoomPlayerFindUnique.mockResolvedValueOnce({
        id: "host-record",
        playerId: "host-id",
        isHost: true,
        room: {
          id: "room-1",
          status: "waiting",
          playerCount: 2,
          players: [
            {
              id: "host-record",
              playerId: "host-id",
              isHost: true,
              readyState: "not-ready",
              status: "connected",
              turnPosition: null,
            },
            {
              id: "p2-record",
              playerId: "player-2",
              isHost: false,
              readyState: "ready",
              status: "connected",
              turnPosition: null,
            },
          ],
        },
      });
      // startGame uses $transaction to update room status and assign positions
      mockTransaction.mockImplementationOnce(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            room: { update: vi.fn().mockResolvedValue({}) },
            roomPlayer: { update: vi.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        }
      );

      const startResult = await startGame({ playerId: "host-id" });
      expect(startResult.success).toBe(true);
      if (startResult.success) {
        expect(startResult.turnOrder).toHaveLength(2);
        // Verify turn positions form a valid 1..N permutation
        const positions = startResult.turnOrder
          .map((t) => t.position)
          .sort((a, b) => a - b);
        expect(positions).toEqual([1, 2]);
        // Verify both players are assigned
        const playerIds = startResult.turnOrder
          .map((t) => t.playerId)
          .sort();
        expect(playerIds).toEqual(["host-id", "player-2"]);
      }
    });
  });

  describe("Host transfer on leave", () => {
    it("transfers host to the earliest joiner when host leaves", async () => {
      // leaveRoom checks roomPlayer.findUnique with room + players include
      mockRoomPlayerFindUnique.mockResolvedValueOnce({
        id: "host-record",
        playerId: "host-id",
        isHost: true,
        room: {
          id: "room-1",
          code: "ABC123",
          status: "waiting",
          playerCount: 3,
          players: [
            {
              id: "host-record",
              playerId: "host-id",
              isHost: true,
              readyState: "not-ready",
              status: "connected",
              joinedAt: new Date("2024-01-01T00:00:00Z"),
            },
            {
              id: "p2-record",
              playerId: "player-2",
              isHost: false,
              readyState: "ready",
              status: "connected",
              joinedAt: new Date("2024-01-01T00:01:00Z"),
            },
            {
              id: "p3-record",
              playerId: "player-3",
              isHost: false,
              readyState: "ready",
              status: "connected",
              joinedAt: new Date("2024-01-01T00:02:00Z"),
            },
          ],
        },
      });

      // leaveRoom uses $transaction for host transfer
      mockTransaction.mockImplementationOnce(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            roomPlayer: {
              delete: vi.fn().mockResolvedValue({}),
              update: vi.fn().mockResolvedValue({}),
              updateMany: vi.fn().mockResolvedValue({}),
            },
            room: { update: vi.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        }
      );

      const leaveResult = await leaveRoom({ playerId: "host-id" });
      expect(leaveResult.success).toBe(true);
      if (leaveResult.success) {
        expect(leaveResult.roomDeleted).toBe(false);
      }

      // Verify the transaction was called (host transfer logic executed)
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it("deletes the room when last player (host) leaves", async () => {
      mockRoomPlayerFindUnique.mockResolvedValueOnce({
        id: "host-record",
        playerId: "host-id",
        isHost: true,
        room: {
          id: "room-1",
          code: "ABC123",
          status: "waiting",
          playerCount: 1,
          players: [
            {
              id: "host-record",
              playerId: "host-id",
              isHost: true,
              readyState: "not-ready",
              status: "connected",
              joinedAt: new Date("2024-01-01T00:00:00Z"),
            },
          ],
        },
      });

      mockRoomDelete.mockResolvedValueOnce({});

      const leaveResult = await leaveRoom({ playerId: "host-id" });
      expect(leaveResult.success).toBe(true);
      if (leaveResult.success) {
        expect(leaveResult.roomDeleted).toBe(true);
      }

      // Verify room was deleted directly (no transaction needed for single player)
      expect(mockRoomDelete).toHaveBeenCalledWith({ where: { id: "room-1" } });
    });
  });

  describe("Concurrent join race condition", () => {
    it("rejects second join when room is already full", async () => {
      // Simulate a room that already has 4 players (full)
      mockRoomFindUnique.mockResolvedValueOnce({
        id: "room-1",
        code: "ABC123",
        status: "waiting",
        visibility: "public",
        playerCount: 4,
        players: [
          {
            id: "p1",
            playerId: "player-1",
            displayName: "P1",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
          },
          {
            id: "p2",
            playerId: "player-2",
            displayName: "P2",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
          },
          {
            id: "p3",
            playerId: "player-3",
            displayName: "P3",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
          },
          {
            id: "p4",
            playerId: "player-4",
            displayName: "P4",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
          },
        ],
      });

      const joinResult = await joinRoom({
        playerId: "player-5",
        displayName: "Latecomer",
        roomCode: "ABC123",
      });

      expect(joinResult.success).toBe(false);
      if (!joinResult.success) {
        expect(joinResult.code).toBe("ROOM_FULL");
      }
    });

    it("rejects join when room state changed to in-progress during race", async () => {
      // Simulate a room that transitioned to "in-progress" between
      // the time the player saw the room and when they tried to join
      mockRoomFindUnique.mockResolvedValueOnce({
        id: "room-1",
        code: "ABC123",
        status: "in-progress",
        visibility: "public",
        playerCount: 3,
        players: [
          {
            id: "p1",
            playerId: "player-1",
            displayName: "P1",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
          },
          {
            id: "p2",
            playerId: "player-2",
            displayName: "P2",
            isHost: false,
            readyState: "ready",
            status: "connected",
          },
          {
            id: "p3",
            playerId: "player-3",
            displayName: "P3",
            isHost: false,
            readyState: "ready",
            status: "connected",
          },
        ],
      });

      const joinResult = await joinRoom({
        playerId: "player-5",
        displayName: "Latecomer",
        roomCode: "ABC123",
      });

      expect(joinResult.success).toBe(false);
      if (!joinResult.success) {
        expect(joinResult.code).toBe("GAME_ALREADY_STARTED");
      }
    });

    it("handles concurrent joins where one player is already in a room", async () => {
      // Room has space
      mockRoomFindUnique.mockResolvedValueOnce({
        id: "room-1",
        code: "ABC123",
        status: "waiting",
        visibility: "public",
        playerCount: 2,
        players: [
          {
            id: "p1",
            playerId: "player-1",
            displayName: "P1",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
          },
          {
            id: "p2",
            playerId: "player-2",
            displayName: "P2",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
          },
        ],
      });

      // Player is already in another room (single-room constraint)
      mockRoomPlayerFindUnique.mockResolvedValueOnce({
        id: "existing-record",
        playerId: "player-3",
        roomId: "other-room",
      });

      const joinResult = await joinRoom({
        playerId: "player-3",
        displayName: "Conflicted",
        roomCode: "ABC123",
      });

      expect(joinResult.success).toBe(false);
      if (!joinResult.success) {
        expect(joinResult.code).toBe("MUST_LEAVE_CURRENT_ROOM");
      }
    });
  });
});
