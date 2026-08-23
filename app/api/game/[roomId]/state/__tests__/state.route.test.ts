vi.mock("@/lib/turn-engine", () => ({
  getGamePollState: vi.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "../route";
import { getGamePollState } from "@/lib/turn-engine";
import { GamePollState } from "@/lib/turn-engine/types";

const mockGetGamePollState = getGamePollState as ReturnType<typeof vi.fn>;

function createRequest(
  roomId: string,
  options?: { cookie?: string; afterSequence?: number }
): NextRequest {
  const url = new URL(`http://localhost/api/game/${roomId}/state`);
  if (options?.afterSequence !== undefined) {
    url.searchParams.set("afterSequence", String(options.afterSequence));
  }
  const headers: Record<string, string> = {};
  if (options?.cookie) {
    headers["cookie"] = options.cookie;
  }
  return new NextRequest(url, { method: "GET", headers });
}

function createParams(roomId: string) {
  return { params: Promise.resolve({ roomId }) };
}

describe("GET /api/game/[roomId]/state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no player-id cookie is present", async () => {
    const req = createRequest("test-room-id");
    const response = await GET(req, createParams("test-room-id"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Authentication required");
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(mockGetGamePollState).not.toHaveBeenCalled();
  });

  it("returns 200 with full game state on success", async () => {
    const mockState: GamePollState = {
      roomId: "test-room-id",
      status: "in-progress",
      viewerPlayerId: "player-1",
      currentPlayerId: "player-1",
      currentRound: 3,
      currentSlot: 1,
      players: [
        {
          playerId: "player-1",
          displayName: "Alice",
          locationId: "loc-1",
          turnPosition: 1,
          skipNextTurn: false,
        },
        {
          playerId: "player-2",
          displayName: "Bob",
          locationId: "loc-2",
          turnPosition: 2,
          skipNextTurn: true,
        },
      ],
      privateData: {
        notebook: [
          { regionId: "region-1", roundNumber: 2, stepsAway: 3 },
        ],
        actionCards: [
          { id: "card-1", type: "locator", consumed: false },
          { id: "card-2", type: "extra-move", consumed: true },
        ],
        pendingReward: {
          regionId: "region-2",
          captureOrder: 1,
          rewardTier: 4,
        },
        skipNextTurn: false,
      },
      events: [
        {
          id: "event-1",
          sequenceNumber: 1,
          roundNumber: 1,
          type: "player-moved",
          payload: { playerId: "player-1", from: "loc-0", to: "loc-1", transport: "car" },
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "event-2",
          sequenceNumber: 2,
          roundNumber: 2,
          type: "player-skipped",
          payload: { playerId: "player-2" },
          createdAt: "2024-01-01T01:00:00.000Z",
        },
      ],
    };
    mockGetGamePollState.mockResolvedValue(mockState);

    const req = createRequest("test-room-id", { cookie: "player-id=player-1" });
    const response = await GET(req, createParams("test-room-id"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.roomId).toBe("test-room-id");
    expect(body.status).toBe("in-progress");
    expect(body.currentPlayerId).toBe("player-1");
    expect(body.currentRound).toBe(3);
    expect(body.currentSlot).toBe(1);
    expect(body.players).toHaveLength(2);
    expect(body.players[0]).toEqual({
      playerId: "player-1",
      displayName: "Alice",
      locationId: "loc-1",
      turnPosition: 1,
      skipNextTurn: false,
    });
    expect(body.privateData).toBeDefined();
    expect(body.events).toHaveLength(2);
  });

  it("passes afterSequence query param to getGamePollState", async () => {
    mockGetGamePollState.mockResolvedValue({
      roomId: "test-room-id",
      status: "in-progress",
      viewerPlayerId: "player-1",
      currentPlayerId: "player-1",
      currentRound: 1,
      currentSlot: 1,
      players: [],
      privateData: { notebook: [], actionCards: [], pendingReward: null, skipNextTurn: false },
      events: [],
    });

    const req = createRequest("test-room-id", {
      cookie: "player-id=player-1",
      afterSequence: 5,
    });
    const response = await GET(req, createParams("test-room-id"));

    expect(response.status).toBe(200);
    expect(mockGetGamePollState).toHaveBeenCalledWith("test-room-id", "player-1", 5);
  });

  it("returns 403 when player is not a member of the room", async () => {
    mockGetGamePollState.mockRejectedValue(
      new Error("Access denied: player is not a member of this room")
    );

    const req = createRequest("test-room-id", { cookie: "player-id=non-member" });
    const response = await GET(req, createParams("test-room-id"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe("ACCESS_DENIED");
  });

  it("returns 404 when room does not exist", async () => {
    mockGetGamePollState.mockRejectedValue(new Error("Room not found"));

    const req = createRequest("non-existent-room", { cookie: "player-id=player-1" });
    const response = await GET(req, createParams("non-existent-room"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("response includes players array with position data", async () => {
    const mockState: GamePollState = {
      roomId: "room-1",
      status: "in-progress",
      viewerPlayerId: "player-1",
      currentPlayerId: "player-1",
      currentRound: 1,
      currentSlot: 2,
      players: [
        {
          playerId: "player-1",
          displayName: "Alice",
          locationId: "hub-region-1",
          turnPosition: 1,
          skipNextTurn: false,
        },
        {
          playerId: "player-2",
          displayName: "Bob",
          locationId: "hub-region-2",
          turnPosition: 2,
          skipNextTurn: false,
        },
        {
          playerId: "player-3",
          displayName: "Charlie",
          locationId: "loc-5",
          turnPosition: 3,
          skipNextTurn: true,
        },
      ],
      privateData: {
        notebook: [],
        actionCards: [],
        pendingReward: null,
        skipNextTurn: false,
      },
      events: [],
    };
    mockGetGamePollState.mockResolvedValue(mockState);

    const req = createRequest("room-1", { cookie: "player-id=player-1" });
    const response = await GET(req, createParams("room-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.players).toHaveLength(3);
    expect(body.players[0].playerId).toBe("player-1");
    expect(body.players[0].locationId).toBe("hub-region-1");
    expect(body.players[0].turnPosition).toBe(1);
    expect(body.players[2].skipNextTurn).toBe(true);
  });

  it("response includes private data structure for requesting player", async () => {
    const mockState: GamePollState = {
      roomId: "room-1",
      status: "in-progress",
      viewerPlayerId: "player-1",
      currentPlayerId: "player-1",
      currentRound: 4,
      currentSlot: 1,
      players: [
        {
          playerId: "player-1",
          displayName: "Alice",
          locationId: "loc-1",
          turnPosition: 1,
          skipNextTurn: false,
        },
      ],
      privateData: {
        notebook: [
          { regionId: "region-1", roundNumber: 1, stepsAway: 2 },
          { regionId: "region-3", roundNumber: 3, stepsAway: 1 },
        ],
        actionCards: [
          { id: "card-1", type: "locator", consumed: false },
          { id: "card-2", type: "extra-move", consumed: false },
          { id: "card-3", type: "reveal-region", consumed: true },
        ],
        pendingReward: {
          regionId: "region-2",
          captureOrder: 2,
          rewardTier: 3,
        },
        skipNextTurn: true,
      },
      events: [],
    };
    mockGetGamePollState.mockResolvedValue(mockState);

    const req = createRequest("room-1", { cookie: "player-id=player-1" });
    const response = await GET(req, createParams("room-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Verify notebook entries
    expect(body.privateData.notebook).toHaveLength(2);
    expect(body.privateData.notebook[0]).toEqual({
      regionId: "region-1",
      roundNumber: 1,
      stepsAway: 2,
    });
    // Verify action cards
    expect(body.privateData.actionCards).toHaveLength(3);
    expect(body.privateData.actionCards[0].type).toBe("locator");
    expect(body.privateData.actionCards[2].consumed).toBe(true);
    // Verify pending reward
    expect(body.privateData.pendingReward).toEqual({
      regionId: "region-2",
      captureOrder: 2,
      rewardTier: 3,
    });
    // Verify skip flag
    expect(body.privateData.skipNextTurn).toBe(true);
  });

  it("does not expose hidden state (Mastermind or Spy locations)", async () => {
    const mockState: GamePollState = {
      roomId: "room-1",
      status: "in-progress",
      viewerPlayerId: "player-1",
      currentPlayerId: "player-1",
      currentRound: 1,
      currentSlot: 1,
      players: [
        {
          playerId: "player-1",
          displayName: "Alice",
          locationId: "loc-1",
          turnPosition: 1,
          skipNextTurn: false,
        },
      ],
      privateData: {
        notebook: [],
        actionCards: [],
        pendingReward: null,
        skipNextTurn: false,
      },
      events: [],
    };
    mockGetGamePollState.mockResolvedValue(mockState);

    const req = createRequest("room-1", { cookie: "player-id=player-1" });
    const response = await GET(req, createParams("room-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Verify no Mastermind or Spy location fields exposed
    const responseString = JSON.stringify(body);
    expect(responseString).not.toContain("mastermindLocation");
    expect(responseString).not.toContain("spyLocation");
    expect(responseString).not.toContain("mastermindLocationId");
    expect(responseString).not.toContain("spyLocationId");
    // Verify top-level keys are limited to expected fields
    const topLevelKeys = Object.keys(body).sort();
    expect(topLevelKeys).toEqual([
      "currentPlayerId",
      "currentRound",
      "currentSlot",
      "events",
      "players",
      "privateData",
      "roomId",
      "status",
      "viewerPlayerId",
    ]);
  });

  it("calls getGamePollState without afterSequence when query param is absent", async () => {
    mockGetGamePollState.mockResolvedValue({
      roomId: "room-1",
      status: "in-progress",
      viewerPlayerId: "player-1",
      currentPlayerId: "player-1",
      currentRound: 1,
      currentSlot: 1,
      players: [],
      privateData: { notebook: [], actionCards: [], pendingReward: null, skipNextTurn: false },
      events: [],
    });

    const req = createRequest("room-1", { cookie: "player-id=player-1" });
    await GET(req, createParams("room-1"));

    expect(mockGetGamePollState).toHaveBeenCalledWith("room-1", "player-1", undefined);
  });

  it("returns 500 for unexpected errors", async () => {
    mockGetGamePollState.mockRejectedValue(new Error("Database connection failed"));

    const req = createRequest("room-1", { cookie: "player-id=player-1" });
    const response = await GET(req, createParams("room-1"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
