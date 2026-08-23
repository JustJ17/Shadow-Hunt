
vi.mock("@/lib/auth/player-session", () => ({
  getOrCreatePlayerId: vi.fn().mockReturnValue("test-player-id"),
}));

vi.mock("@/lib/lobby/poll-state", () => ({
  pollState: vi.fn(),
}));

import { GET } from "../route";
import { pollState } from "@/lib/lobby/poll-state";

const mockPollState = pollState as ReturnType<typeof vi.fn>;

describe("GET /api/rooms/poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with lobby state on successful poll", async () => {
    const mockResult = {
      success: true,
      state: {
        roomCode: "ABC123",
        roomId: "room-uuid-123",
        status: "waiting",
        visibility: "public",
        hostId: "host-player-id",
        players: [
          {
            id: "player-record-1",
            displayName: "Host",
            isHost: true,
            readyState: "not-ready",
            status: "connected",
            turnPosition: null,
          },
          {
            id: "player-record-2",
            displayName: "Alice",
            isHost: false,
            readyState: "ready",
            status: "connected",
            turnPosition: null,
          },
        ],
      },
    };
    mockPollState.mockResolvedValue(mockResult);

    const req = new Request("http://localhost/api/rooms/poll", {
      method: "GET",
    });

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.state.roomCode).toBe("ABC123");
    expect(body.state.roomId).toBe("room-uuid-123");
    expect(body.state.players).toHaveLength(2);
  });

  it("returns 404 when player is not in any room", async () => {
    mockPollState.mockResolvedValue({
      success: false,
      error: "Player is not in any room",
      code: "NOT_IN_ROOM",
    });

    const req = new Request("http://localhost/api/rooms/poll", {
      method: "GET",
    });

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_IN_ROOM");
  });

  it("passes correct playerId to pollState", async () => {
    mockPollState.mockResolvedValue({
      success: true,
      state: {
        roomCode: "XYZ789",
        status: "waiting",
        visibility: "private",
        hostId: "test-player-id",
        players: [],
      },
    });

    const req = new Request("http://localhost/api/rooms/poll", {
      method: "GET",
    });

    await GET(req);

    expect(mockPollState).toHaveBeenCalledWith({
      playerId: "test-player-id",
    });
  });
});
