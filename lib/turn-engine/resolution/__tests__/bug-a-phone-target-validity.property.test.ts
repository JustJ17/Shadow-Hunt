// Feature: action-cards
// Property 15: Bug a Phone Target Validity
// **Validates: Requirements 12.2, 12.3, 12.4**

import fc from "fast-check";
import { vi } from "vitest";

/**
 * Property 15: Bug a Phone Target Validity
 *
 * For any `bug-a-phone` resolution, `targetPlayerId` differs from the playing
 * Player's identifier and identifies a member of the same Room.
 *
 * Test approach: Mock the transaction to provide a room with varying players
 * and statuses, then run `resolveRoundEnd` with a bug-a-phone PendingClue.
 * Verify:
 * 1. The selected target is never the playing player
 * 2. The selected target is always a room member
 * 3. Connected players are preferred; if none connected, all others are used
 * 4. With 2 players total, the target is always the single other player
 */

// Mock the distance module before importing resolve-round-end
vi.mock("@/lib/map/distance", () => ({
  getShortestPathDistance: vi.fn().mockResolvedValue(3),
}));

import { resolveRoundEnd } from "@/lib/turn-engine/resolution/resolve-round-end";

// --- Types ---

interface PlayerData {
  playerId: string;
  status: "connected" | "disconnected";
  locationId: string;
  regionId: string;
}

interface NotebookEntryData {
  roomId: string;
  playerId: string;
  entryType: string;
  roundNumber: number;
  payload: Record<string, unknown>;
}

// --- Mock Transaction Builder ---

function createMockTx(options: {
  roomId: string;
  cluePlayerId: string;
  roundNumber: number;
  mastermindLocationId: string;
  players: PlayerData[];
}) {
  const notebookEntries: NotebookEntryData[] = [];

  const pendingClue = {
    id: "clue-1",
    roomId: options.roomId,
    playerId: options.cluePlayerId,
    cardIdentifier: "bug-a-phone",
    roundNumber: options.roundNumber,
    originLocationId: "origin-loc",
    resolved: false,
  };

  const roomPlayers = options.players.map((p) => ({
    playerId: p.playerId,
    roomId: options.roomId,
    status: p.status,
    turnPosition: 0,
  }));

  const tx = {
    room: {
      findUnique: vi.fn().mockResolvedValue({ status: "in-progress" }),
    },
    pendingClue: {
      findMany: vi.fn().mockResolvedValue([pendingClue]),
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
      findMany: vi.fn().mockResolvedValue(roomPlayers),
    },
    playerPosition: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const player = options.players.find(
          (p) => p.playerId === where.roomId_playerId.playerId
        );
        if (!player) return Promise.resolve(null);
        return Promise.resolve({
          roomId: options.roomId,
          playerId: player.playerId,
          locationId: player.locationId,
        });
      }),
    },
    location: {
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        const player = options.players.find((p) => p.locationId === where.id);
        if (!player) return Promise.resolve(null);
        return Promise.resolve({
          id: player.locationId,
          regionId: player.regionId,
        });
      }),
    },
    gameSpy: {
      findFirst: vi.fn().mockResolvedValue(null),
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

// --- Arbitraries ---

/**
 * Generates a scenario with:
 * - A playing player (the clue owner)
 * - 1 to 5 other players with varying connected/disconnected statuses
 * - At least one other player (bug-a-phone requires at least 2 total)
 */
function arbBugAPhoneScenario() {
  return fc
    .record({
      numOtherPlayers: fc.integer({ min: 1, max: 5 }),
      rngValue: fc.double({ min: 0, max: 0.999, noNaN: true }),
      roundNumber: fc.integer({ min: 1, max: 50 }),
    })
    .chain(({ numOtherPlayers, rngValue, roundNumber }) => {
      return fc
        .array(fc.boolean(), {
          minLength: numOtherPlayers,
          maxLength: numOtherPlayers,
        })
        .map((connectionStatuses) => {
          const roomId = "room-1";
          const cluePlayerId = "player-caster";
          const mastermindLocationId = "mastermind-loc";

          const players: PlayerData[] = [
            {
              playerId: cluePlayerId,
              status: "connected",
              locationId: "loc-caster",
              regionId: "region-1",
            },
          ];

          for (let i = 0; i < numOtherPlayers; i++) {
            players.push({
              playerId: `player-${i}`,
              status: connectionStatuses[i] ? "connected" : "disconnected",
              locationId: `loc-${i}`,
              regionId: `region-${i % 6}`,
            });
          }

          return {
            roomId,
            cluePlayerId,
            mastermindLocationId,
            players,
            rngValue,
            roundNumber,
          };
        });
    });
}

/**
 * Generates a scenario with exactly 2 players (the caster + 1 other).
 */
function arbTwoPlayerScenario() {
  return fc
    .record({
      otherConnected: fc.boolean(),
      rngValue: fc.double({ min: 0, max: 0.999, noNaN: true }),
      roundNumber: fc.integer({ min: 1, max: 50 }),
    })
    .map(({ otherConnected, rngValue, roundNumber }) => {
      const roomId = "room-1";
      const cluePlayerId = "player-caster";
      const otherPlayerId = "player-other";
      const mastermindLocationId = "mastermind-loc";

      const players: PlayerData[] = [
        {
          playerId: cluePlayerId,
          status: "connected",
          locationId: "loc-caster",
          regionId: "region-1",
        },
        {
          playerId: otherPlayerId,
          status: otherConnected ? "connected" : "disconnected",
          locationId: "loc-other",
          regionId: "region-2",
        },
      ];

      return {
        roomId,
        cluePlayerId,
        otherPlayerId,
        mastermindLocationId,
        players,
        rngValue,
        roundNumber,
      };
    });
}

/**
 * Generates a scenario with all other players disconnected (forces fallback).
 */
function arbAllDisconnectedScenario() {
  return fc
    .record({
      numOtherPlayers: fc.integer({ min: 1, max: 5 }),
      rngValue: fc.double({ min: 0, max: 0.999, noNaN: true }),
      roundNumber: fc.integer({ min: 1, max: 50 }),
    })
    .map(({ numOtherPlayers, rngValue, roundNumber }) => {
      const roomId = "room-1";
      const cluePlayerId = "player-caster";
      const mastermindLocationId = "mastermind-loc";

      const players: PlayerData[] = [
        {
          playerId: cluePlayerId,
          status: "connected",
          locationId: "loc-caster",
          regionId: "region-1",
        },
      ];

      for (let i = 0; i < numOtherPlayers; i++) {
        players.push({
          playerId: `player-${i}`,
          status: "disconnected",
          locationId: `loc-${i}`,
          regionId: `region-${i % 6}`,
        });
      }

      return {
        roomId,
        cluePlayerId,
        mastermindLocationId,
        players,
        rngValue,
        roundNumber,
      };
    });
}

describe("Bug a Phone Target Validity — Property 15", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 12.2, 12.3, 12.4**
   *
   * The selected target is never the playing player.
   */
  it("target is never the playing player", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBugAPhoneScenario(),
        async ({ roomId, cluePlayerId, mastermindLocationId, players, rngValue, roundNumber }) => {
          const { tx, notebookEntries } = createMockTx({
            roomId,
            cluePlayerId,
            roundNumber,
            mastermindLocationId,
            players,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => rngValue);

          expect(notebookEntries).toHaveLength(1);
          const payload = notebookEntries[0].payload as { targetPlayerId: string };
          expect(payload.targetPlayerId).not.toBe(cluePlayerId);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 12.2, 12.3**
   *
   * The selected target is always a member of the room.
   */
  it("target is always a room member", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBugAPhoneScenario(),
        async ({ roomId, cluePlayerId, mastermindLocationId, players, rngValue, roundNumber }) => {
          const { tx, notebookEntries } = createMockTx({
            roomId,
            cluePlayerId,
            roundNumber,
            mastermindLocationId,
            players,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => rngValue);

          expect(notebookEntries).toHaveLength(1);
          const payload = notebookEntries[0].payload as { targetPlayerId: string };
          const roomMemberIds = players.map((p) => p.playerId);
          expect(roomMemberIds).toContain(payload.targetPlayerId);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirement 12.2**
   *
   * Connected players are preferred when at least one connected
   * other player exists. The target must be from the connected set.
   */
  it("connected players are preferred when available", async () => {
    // Generate scenario with at least one connected other player
    const arbWithConnected = arbBugAPhoneScenario().filter(({ players, cluePlayerId }) => {
      const others = players.filter((p) => p.playerId !== cluePlayerId);
      return others.some((p) => p.status === "connected");
    });

    await fc.assert(
      fc.asyncProperty(
        arbWithConnected,
        async ({ roomId, cluePlayerId, mastermindLocationId, players, rngValue, roundNumber }) => {
          const { tx, notebookEntries } = createMockTx({
            roomId,
            cluePlayerId,
            roundNumber,
            mastermindLocationId,
            players,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => rngValue);

          expect(notebookEntries).toHaveLength(1);
          const payload = notebookEntries[0].payload as { targetPlayerId: string };

          // Target must be one of the connected other players
          const connectedOthers = players.filter(
            (p) => p.playerId !== cluePlayerId && p.status === "connected"
          );
          const connectedIds = connectedOthers.map((p) => p.playerId);
          expect(connectedIds).toContain(payload.targetPlayerId);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirement 12.3**
   *
   * When no other player is connected, all other players form the target pool.
   * The target must be from the full set of other players (all disconnected).
   */
  it("falls back to all others when no connected players exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbAllDisconnectedScenario(),
        async ({ roomId, cluePlayerId, mastermindLocationId, players, rngValue, roundNumber }) => {
          const { tx, notebookEntries } = createMockTx({
            roomId,
            cluePlayerId,
            roundNumber,
            mastermindLocationId,
            players,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => rngValue);

          expect(notebookEntries).toHaveLength(1);
          const payload = notebookEntries[0].payload as { targetPlayerId: string };

          // Target must be one of the other players (all disconnected)
          const otherIds = players
            .filter((p) => p.playerId !== cluePlayerId)
            .map((p) => p.playerId);
          expect(otherIds).toContain(payload.targetPlayerId);
          // And must not be the caster
          expect(payload.targetPlayerId).not.toBe(cluePlayerId);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirement 12.4**
   *
   * With exactly 2 players, the target is always the single other player
   * regardless of rng value or connection status.
   */
  it("with 2 players, the target is always the single other player", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTwoPlayerScenario(),
        async ({
          roomId,
          cluePlayerId,
          otherPlayerId,
          mastermindLocationId,
          players,
          rngValue,
          roundNumber,
        }) => {
          const { tx, notebookEntries } = createMockTx({
            roomId,
            cluePlayerId,
            roundNumber,
            mastermindLocationId,
            players,
          });

          await resolveRoundEnd(roomId, roundNumber, tx, () => rngValue);

          expect(notebookEntries).toHaveLength(1);
          const payload = notebookEntries[0].payload as { targetPlayerId: string };
          expect(payload.targetPlayerId).toBe(otherPlayerId);
        }
      ),
      { numRuns: 200 }
    );
  });
});
