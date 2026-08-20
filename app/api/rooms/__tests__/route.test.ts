import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/player-session", () => ({
  getOrCreatePlayerId: vi.fn().mockReturnValue("test-player-id"),
  playerIdCookieHeader: vi
    .fn()
    .mockReturnValue("player-id=test-player-id; Path=/; HttpOnly"),
}));

vi.mock("@/lib/lobby/create-room", () => ({
  createRoom: vi.fn(),
}));

import { POST } from "../route";
import { createRoom } from "@/lib/lobby/create-room";

const mockCreateRoom = createRoom as ReturnType<typeof vi.fn>;

describe("POST /api/rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with room data on successful creation", async () => {
    const mockResult = {
      success: true,
      roomCode: "ABC123",
      state: {
        roomCode: "ABC123",
        status: "waiting",
        visibility: "private",
        hostId: "test-player-id",
        players: [
          {
            id: "player-record-id",
            displayName: "Alice",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          },
        ],
      },
    };
    mockCreateRoom.mockResolvedValue(mockResult);

    const req = new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Alice", visibility: "private" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.roomCode).toBe("ABC123");
    expect(body.state.hostId).toBe("test-player-id");
    expect(body.state.players).toHaveLength(1);
    expect(response.headers.get("Set-Cookie")).toContain("player-id=");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/rooms", {
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

  it("returns 400 when displayName is missing", async () => {
    const req = new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: "public" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("displayName is required");
  });

  it("returns 400 when visibility is invalid", async () => {
    const req = new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Alice", visibility: "unlisted" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.error).toContain("visibility must be 'public' or 'private'");
  });

  it("returns 409 when player is already in a room", async () => {
    mockCreateRoom.mockResolvedValue({
      success: false,
      error: "Must leave current room first",
      code: "MUST_LEAVE_CURRENT_ROOM",
    });

    const req = new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Alice", visibility: "public" }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("MUST_LEAVE_CURRENT_ROOM");
  });

  it("defaults visibility to 'private' when not provided", async () => {
    mockCreateRoom.mockResolvedValue({
      success: true,
      roomCode: "XYZ789",
      state: {
        roomCode: "XYZ789",
        status: "waiting",
        visibility: "private",
        hostId: "test-player-id",
        players: [],
      },
    });

    const req = new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Bob" }),
    });

    await POST(req);

    expect(mockCreateRoom).toHaveBeenCalledWith({
      playerId: "test-player-id",
      displayName: "Bob",
      visibility: "private",
    });
  });
});
