
vi.mock("@/lib/auth/player-session", () => ({
  getOrCreatePlayerId: vi.fn().mockReturnValue("test-player-id"),
}));

vi.mock("@/lib/lobby/start-game", () => ({
  startGame: vi.fn(),
}));

import { POST } from "../route";
import { startGame } from "@/lib/lobby/start-game";

const mockStartGame = startGame as ReturnType<typeof vi.fn>;

describe("POST /api/rooms/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with turnOrder on successful game start", async () => {
    const mockResult = {
      success: true,
      turnOrder: [
        { playerId: "player-1", position: 1 },
        { playerId: "player-2", position: 2 },
        { playerId: "player-3", position: 3 },
      ],
    };
    mockStartGame.mockResolvedValue(mockResult);

    const req = new Request("http://localhost/api/rooms/start", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.turnOrder).toHaveLength(3);
    expect(body.turnOrder[0]).toEqual({ playerId: "player-1", position: 1 });
    expect(body.turnOrder[1]).toEqual({ playerId: "player-2", position: 2 });
    expect(body.turnOrder[2]).toEqual({ playerId: "player-3", position: 3 });
  });

  it("returns 404 when player is not in any room", async () => {
    mockStartGame.mockResolvedValue({
      success: false,
      error: "Not in a room",
      code: "NOT_IN_ROOM",
    });

    const req = new Request("http://localhost/api/rooms/start", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_IN_ROOM");
  });

  it("returns 403 when player is not the host", async () => {
    mockStartGame.mockResolvedValue({
      success: false,
      error: "Only the host can start the game",
      code: "NOT_HOST",
    });

    const req = new Request("http://localhost/api/rooms/start", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_HOST");
  });

  it("returns 409 when game has already started", async () => {
    mockStartGame.mockResolvedValue({
      success: false,
      error: "Game has already started",
      code: "GAME_ALREADY_STARTED",
    });

    const req = new Request("http://localhost/api/rooms/start", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("GAME_ALREADY_STARTED");
  });

  it("returns 422 when there are insufficient players", async () => {
    mockStartGame.mockResolvedValue({
      success: false,
      error: "At least 2 players are required to start",
      code: "INSUFFICIENT_PLAYERS",
    });

    const req = new Request("http://localhost/api/rooms/start", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INSUFFICIENT_PLAYERS");
  });

  it("returns 422 when not all players are ready", async () => {
    mockStartGame.mockResolvedValue({
      success: false,
      error: "Not all players are ready",
      code: "PLAYERS_NOT_READY",
    });

    const req = new Request("http://localhost/api/rooms/start", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.code).toBe("PLAYERS_NOT_READY");
  });

  it("passes correct playerId to startGame", async () => {
    mockStartGame.mockResolvedValue({
      success: true,
      turnOrder: [{ playerId: "test-player-id", position: 1 }],
    });

    const req = new Request("http://localhost/api/rooms/start", {
      method: "POST",
    });

    await POST(req);

    expect(mockStartGame).toHaveBeenCalledWith({
      playerId: "test-player-id",
    });
  });
});
