import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/lobby/list-public-rooms", () => ({
  listPublicRooms: vi.fn(),
}));

import { GET } from "../route";
import { listPublicRooms } from "@/lib/lobby/list-public-rooms";

const mockListPublicRooms = listPublicRooms as ReturnType<typeof vi.fn>;

describe("GET /api/rooms/public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with list of public rooms", async () => {
    const mockResult = {
      rooms: [
        { roomCode: "ABC123", hostName: "Alice", playerCount: 2 },
        { roomCode: "DEF456", hostName: "Bob", playerCount: 1 },
      ],
    };
    mockListPublicRooms.mockResolvedValue(mockResult);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rooms).toHaveLength(2);
    expect(body.rooms[0].roomCode).toBe("ABC123");
    expect(body.rooms[0].hostName).toBe("Alice");
    expect(body.rooms[0].playerCount).toBe(2);
    expect(body.rooms[1].roomCode).toBe("DEF456");
  });

  it("returns 200 with empty list when no public rooms available", async () => {
    mockListPublicRooms.mockResolvedValue({ rooms: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rooms).toHaveLength(0);
  });
});
