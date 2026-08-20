import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/player-session", () => ({
  getOrCreatePlayerId: vi.fn().mockReturnValue("test-player-id"),
}));

vi.mock("@/lib/lobby/leave-room", () => ({
  leaveRoom: vi.fn(),
}));

import { POST } from "../route";
import { leaveRoom } from "@/lib/lobby/leave-room";

const mockLeaveRoom = leaveRoom as ReturnType<typeof vi.fn>;

describe("POST /api/rooms/leave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 when non-host player leaves", async () => {
    mockLeaveRoom.mockResolvedValue({
      success: true,
      roomDeleted: false,
    });

    const req = new Request("http://localhost/api/rooms/leave", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.roomDeleted).toBe(false);
  });

  it("returns 200 when host leaves with transfer to another player", async () => {
    mockLeaveRoom.mockResolvedValue({
      success: true,
      roomDeleted: false,
    });

    const req = new Request("http://localhost/api/rooms/leave", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.roomDeleted).toBe(false);
  });

  it("returns 200 with roomDeleted true when host leaves empty room", async () => {
    mockLeaveRoom.mockResolvedValue({
      success: true,
      roomDeleted: true,
    });

    const req = new Request("http://localhost/api/rooms/leave", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.roomDeleted).toBe(true);
  });

  it("returns 404 when player is not in any room", async () => {
    mockLeaveRoom.mockResolvedValue({
      success: false,
      error: "Not in a room",
      code: "NOT_IN_ROOM",
    });

    const req = new Request("http://localhost/api/rooms/leave", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_IN_ROOM");
  });

  it("returns 409 when player tries to leave an active game", async () => {
    mockLeaveRoom.mockResolvedValue({
      success: false,
      error: "Cannot leave during an active game",
      code: "CANNOT_LEAVE_ACTIVE_GAME",
    });

    const req = new Request("http://localhost/api/rooms/leave", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("CANNOT_LEAVE_ACTIVE_GAME");
  });

  it("passes correct playerId to leaveRoom", async () => {
    mockLeaveRoom.mockResolvedValue({
      success: true,
      roomDeleted: false,
    });

    const req = new Request("http://localhost/api/rooms/leave", {
      method: "POST",
    });

    await POST(req);

    expect(mockLeaveRoom).toHaveBeenCalledWith({
      playerId: "test-player-id",
    });
  });
});
