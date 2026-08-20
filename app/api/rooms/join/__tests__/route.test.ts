import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/player-session", () => ({
  getOrCreatePlayerId: vi.fn().mockReturnValue("test-player-id"),
  playerIdCookieHeader: vi
    .fn()
    .mockReturnValue("player-id=test-player-id; Path=/; HttpOnly"),
}));

vi.mock("@/lib/lobby/join-room", () => ({
  joinRoom: vi.fn(),
}));

import { POST } from "../route";
import { joinRoom } from "@/lib/lobby/join-room";

const mockJoinRoom = joinRoom as ReturnType<typeof vi.fn>;

describe("POST /api/rooms/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with lobby state on successful join", async () => {
    const mockResult = {
      success: true,
      state: {
        roomCode: "ABC123",
        status: "waiting",
        visibility: "private",
        hostId: "host-player-id",
        players: [
          {
            id: "host-record-id",
            displayName: "Host",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          },
          {
            id: "joiner-record-id",
            displayName: "Alice",
            isHost: false,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          },
        ],
      },
    };
    mockJoinRoom.mockResolvedValue(mockResult);

    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "ABC123", displayName: "Alice" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.state.roomCode).toBe("ABC123");
    expect(body.state.players).toHaveLength(2);
    expect(response.headers.get("Set-Cookie")).toContain("player-id=");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("Invalid JSON body");
  });

  it("returns 400 when roomCode is missing", async () => {
    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Alice" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("roomCode is required");
  });

  it("returns 400 when displayName is missing", async () => {
    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "ABC123" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("displayName is required");
  });

  it("returns 404 when room is not found", async () => {
    mockJoinRoom.mockResolvedValue({
      success: false,
      error: "Room not found",
      code: "ROOM_NOT_FOUND",
    });

    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "ZZZZZ1", displayName: "Alice" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("ROOM_NOT_FOUND");
  });

  it("returns 409 when room is full", async () => {
    mockJoinRoom.mockResolvedValue({
      success: false,
      error: "Room is full",
      code: "ROOM_FULL",
    });

    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "ABC123", displayName: "Alice" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("ROOM_FULL");
  });

  it("returns 409 when game has already started", async () => {
    mockJoinRoom.mockResolvedValue({
      success: false,
      error: "Game has already started",
      code: "GAME_ALREADY_STARTED",
    });

    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "ABC123", displayName: "Alice" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("GAME_ALREADY_STARTED");
  });

  it("returns 409 when player is already in this room", async () => {
    mockJoinRoom.mockResolvedValue({
      success: false,
      error: "Already in this room",
      code: "ALREADY_IN_ROOM",
    });

    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "ABC123", displayName: "Alice" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("ALREADY_IN_ROOM");
  });

  it("returns 409 when player must leave current room first", async () => {
    mockJoinRoom.mockResolvedValue({
      success: false,
      error: "Must leave current room first",
      code: "MUST_LEAVE_CURRENT_ROOM",
    });

    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "ABC123", displayName: "Alice" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("MUST_LEAVE_CURRENT_ROOM");
  });

  it("passes correct parameters to joinRoom", async () => {
    mockJoinRoom.mockResolvedValue({
      success: true,
      state: {
        roomCode: "XYZ789",
        status: "waiting",
        visibility: "public",
        hostId: "host-id",
        players: [],
      },
    });

    const req = new Request("http://localhost/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: "xyz789", displayName: "Bob" }),
    });

    await POST(req);

    expect(mockJoinRoom).toHaveBeenCalledWith({
      playerId: "test-player-id",
      displayName: "Bob",
      roomCode: "xyz789",
    });
  });
});
