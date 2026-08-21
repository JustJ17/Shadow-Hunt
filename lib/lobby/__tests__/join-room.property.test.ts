import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findUnique: vi.fn() },
    roomPlayer: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { joinRoom } from "../join-room";
import { prisma } from "@/lib/prisma";

const mockRoomFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;
const mockPlayerFindUnique = prisma.roomPlayer.findUnique as ReturnType<
  typeof vi.fn
>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

// Arbitraries
const validDisplayName = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);
const validPlayerId = fc.uuid();
const validRoomCode = fc.stringMatching(/^[A-Z0-9]{6}$/);
const validPlayerCount = fc.integer({ min: 1, max: 3 });

function makeExistingPlayers(count: number, readyStates?: string[]) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-record-${i}`,
    playerId: `existing-player-${i}`,
    displayName: `Player ${i}`,
    isHost: i === 0,
    readyState: readyStates ? readyStates[i] : "ready",
    status: "connected",
    turnPosition: null,
  }));
}

// Feature: lobby-player-join, Property 3: Join succeeds only when all preconditions are met
// Feature: lobby-player-join, Property 4: Player count invariant (join subset)
// Feature: lobby-player-join, Property 5: Player count arithmetic (join subset)
// Feature: lobby-player-join, Property 8: Membership changes reset readiness (join subset)
describe("Room joining - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 5.1**
   *
   * For any valid inputs where the room exists, is in "waiting" status,
   * has <4 players, and the player is not in any room, joinRoom succeeds.
   * The newly joined player's readyState is "not-ready".
   */
  it("Property 3: Join succeeds only when all preconditions are met", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validDisplayName,
        validRoomCode,
        validPlayerCount,
        async (playerId, displayName, roomCode, playerCount) => {
          const existingPlayers = makeExistingPlayers(playerCount);

          // Room exists, in "waiting" status, not full
          mockRoomFindUnique.mockResolvedValue({
            id: "room-id-1",
            code: roomCode,
            status: "waiting",
            visibility: "private",
            playerCount,
            players: existingPlayers,
          });

          // Player is not in any room
          mockPlayerFindUnique.mockResolvedValue(null);

          // Mock transaction
          const newPlayer = {
            id: "new-player-record-id",
            playerId,
            displayName: displayName.trim(),
            roomId: "room-id-1",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          };

          const updatedPlayers = [
            ...existingPlayers.map((p) => ({ ...p, readyState: "not-ready" })),
            newPlayer,
          ];

          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              roomPlayer: {
                create: vi.fn().mockResolvedValue(newPlayer),
                updateMany: vi.fn().mockResolvedValue({ count: playerCount }),
              },
              room: {
                update: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  playerCount: playerCount + 1,
                }),
                findUnique: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  status: "waiting",
                  visibility: "private",
                  playerCount: playerCount + 1,
                  players: updatedPlayers,
                }),
              },
            };
            return cb(mockTx);
          });

          const result = await joinRoom({ playerId, displayName, roomCode });

          expect(result.success).toBe(true);
          if (result.success) {
            // The newly joined player has readyState "not-ready"
            const joinedPlayer = result.state.players.find(
              (p) => p.id === "new-player-record-id"
            );
            expect(joinedPlayer).toBeDefined();
            expect(joinedPlayer!.readyState).toBe("not-ready");
            expect(joinedPlayer!.isHost).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * On successful join, player count in the result equals previous count + 1.
   */
  it("Property 4: Player count invariant (join subset)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validDisplayName,
        validRoomCode,
        validPlayerCount,
        async (playerId, displayName, roomCode, playerCount) => {
          const existingPlayers = makeExistingPlayers(playerCount);

          mockRoomFindUnique.mockResolvedValue({
            id: "room-id-1",
            code: roomCode,
            status: "waiting",
            visibility: "private",
            playerCount,
            players: existingPlayers,
          });

          mockPlayerFindUnique.mockResolvedValue(null);

          const newPlayer = {
            id: "new-player-record-id",
            playerId,
            displayName: displayName.trim(),
            roomId: "room-id-1",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          };

          const updatedPlayers = [
            ...existingPlayers.map((p) => ({ ...p, readyState: "not-ready" })),
            newPlayer,
          ];

          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              roomPlayer: {
                create: vi.fn().mockResolvedValue(newPlayer),
                updateMany: vi.fn().mockResolvedValue({ count: playerCount }),
              },
              room: {
                update: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  playerCount: playerCount + 1,
                }),
                findUnique: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  status: "waiting",
                  visibility: "private",
                  playerCount: playerCount + 1,
                  players: updatedPlayers,
                }),
              },
            };
            return cb(mockTx);
          });

          const result = await joinRoom({ playerId, displayName, roomCode });

          expect(result.success).toBe(true);
          if (result.success) {
            // Player count = previous count + 1
            expect(result.state.players.length).toBe(playerCount + 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * The number of players in the result's state matches the room's playerCount after join.
   */
  it("Property 5: Player count arithmetic (join subset)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validDisplayName,
        validRoomCode,
        validPlayerCount,
        async (playerId, displayName, roomCode, playerCount) => {
          const existingPlayers = makeExistingPlayers(playerCount);

          mockRoomFindUnique.mockResolvedValue({
            id: "room-id-1",
            code: roomCode,
            status: "waiting",
            visibility: "private",
            playerCount,
            players: existingPlayers,
          });

          mockPlayerFindUnique.mockResolvedValue(null);

          const newPlayer = {
            id: "new-player-record-id",
            playerId,
            displayName: displayName.trim(),
            roomId: "room-id-1",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          };

          const expectedCount = playerCount + 1;
          const updatedPlayers = [
            ...existingPlayers.map((p) => ({ ...p, readyState: "not-ready" })),
            newPlayer,
          ];

          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              roomPlayer: {
                create: vi.fn().mockResolvedValue(newPlayer),
                updateMany: vi.fn().mockResolvedValue({ count: playerCount }),
              },
              room: {
                update: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  playerCount: expectedCount,
                }),
                findUnique: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  status: "waiting",
                  visibility: "private",
                  playerCount: expectedCount,
                  players: updatedPlayers,
                }),
              },
            };
            return cb(mockTx);
          });

          const result = await joinRoom({ playerId, displayName, roomCode });

          expect(result.success).toBe(true);
          if (result.success) {
            // The number of players in the result equals the expected playerCount
            expect(result.state.players.length).toBe(expectedCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.4**
   *
   * On successful join, all existing players have readyState "not-ready" (readiness was reset).
   */
  it("Property 8: Membership changes reset readiness (join subset)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerId,
        validDisplayName,
        validRoomCode,
        validPlayerCount,
        fc.array(fc.constantFrom("ready", "not-ready"), {
          minLength: 1,
          maxLength: 3,
        }),
        async (
          playerId,
          displayName,
          roomCode,
          playerCount,
          readyStates
        ) => {
          // Make readyStates match playerCount
          const states = readyStates.slice(0, playerCount);
          while (states.length < playerCount) {
            states.push("ready");
          }

          const existingPlayers = makeExistingPlayers(playerCount, states);

          mockRoomFindUnique.mockResolvedValue({
            id: "room-id-1",
            code: roomCode,
            status: "waiting",
            visibility: "private",
            playerCount,
            players: existingPlayers,
          });

          mockPlayerFindUnique.mockResolvedValue(null);

          const newPlayer = {
            id: "new-player-record-id",
            playerId,
            displayName: displayName.trim(),
            roomId: "room-id-1",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          };

          // After join, all players (including existing) should have readyState "not-ready"
          const updatedPlayers = [
            ...existingPlayers.map((p) => ({ ...p, readyState: "not-ready" })),
            newPlayer,
          ];

          mockTransaction.mockImplementation(async (cb: Function) => {
            const mockTx = {
              roomPlayer: {
                create: vi.fn().mockResolvedValue(newPlayer),
                updateMany: vi.fn().mockResolvedValue({ count: playerCount }),
              },
              room: {
                update: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  playerCount: playerCount + 1,
                }),
                findUnique: vi.fn().mockResolvedValue({
                  id: "room-id-1",
                  code: roomCode,
                  status: "waiting",
                  visibility: "private",
                  playerCount: playerCount + 1,
                  players: updatedPlayers,
                }),
              },
            };
            return cb(mockTx);
          });

          const result = await joinRoom({ playerId, displayName, roomCode });

          expect(result.success).toBe(true);
          if (result.success) {
            // ALL players (existing + new) should have readyState "not-ready"
            for (const player of result.state.players) {
              expect(player.readyState).toBe("not-ready");
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
