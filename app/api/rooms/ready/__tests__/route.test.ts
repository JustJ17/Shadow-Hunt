import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/player-session", () => ({
  getOrCreatePlayerId: vi.fn().mockReturnValue("test-player-id"),
}));

vi.mock("@/lib/lobby/toggle-ready", () => ({
  toggleReady: vi.fn(),
}));

import { POST } from "../route";
import { toggleReady } from "@/lib/lobby/toggle-ready";

const mockToggleReady = toggleReady as ReturnType<typeof vi.fn>;

describe("POST /api/rooms/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with newReadyState 'ready' on successful toggle", async () => {
    mockToggleReady.mockResolvedValue({
      success: true,
      newReadyState: "ready",
    });

    const req = new Request("http://localhost/api/rooms/ready", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.newReadyState).toBe("ready");
  });

  it("returns 200 with newReadyState 'not-ready' on successful toggle", async () => {
    mockToggleReady.mockResolvedValue({
      success: true,
      newReadyState: "not-ready",
    });

    const req = new Request("http://localhost/api/rooms/ready", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.newReadyState).toBe("not-ready");
  });

  it("returns 404 when player is not in any room", async () => {
    mockToggleReady.mockResolvedValue({
      success: false,
      error: "Not in a room",
      code: "NOT_IN_ROOM",
    });

    const req = new Request("http://localhost/api/rooms/ready", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_IN_ROOM");
  });

  it("returns 409 when game has already started", async () => {
    mockToggleReady.mockResolvedValue({
      success: false,
      error: "Game has already started",
      code: "GAME_ALREADY_STARTED",
    });

    const req = new Request("http://localhost/api/rooms/ready", {
      method: "POST",
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe("GAME_ALREADY_STARTED");
  });

  it("passes correct playerId to toggleReady", async () => {
    mockToggleReady.mockResolvedValue({
      success: true,
      newReadyState: "ready",
    });

    const req = new Request("http://localhost/api/rooms/ready", {
      method: "POST",
    });

    await POST(req);

    expect(mockToggleReady).toHaveBeenCalledWith({
      playerId: "test-player-id",
    });
  });
});
