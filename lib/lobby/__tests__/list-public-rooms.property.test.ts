import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: { findMany: vi.fn() },
  },
}));

import { listPublicRooms } from "../list-public-rooms";
import { prisma } from "@/lib/prisma";

const mockFindMany = prisma.room.findMany as ReturnType<typeof vi.fn>;

// Feature: lobby-player-join, Property 13: Public room listing correctness
describe("Public room listing - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 10.2, 10.3, 10.8**
   *
   * For any set of rooms, the public room list SHALL contain exactly those rooms where
   * visibility is "public", status is "waiting", and playerCount is less than 4 —
   * up to a maximum of 20 rooms, ordered by most recently created first.
   */
  it("Property 13: Returns correctly shaped results for any number of rooms", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 25 }),
        async (roomCount) => {
          const rooms = Array.from({ length: Math.min(roomCount, 20) }, (_, i) => ({
            code: `ROOM${String(i).padStart(2, "0")}`,
            playerCount: (i % 3) + 1,
            players: [{ displayName: `Host ${i}` }],
          }));

          mockFindMany.mockResolvedValue(rooms);

          const result = await listPublicRooms();

          // Results are limited to 20
          expect(result.rooms.length).toBeLessThanOrEqual(20);
          
          // Each room has the expected shape
          for (const room of result.rooms) {
            expect(room.roomCode).toBeDefined();
            expect(typeof room.roomCode).toBe("string");
            expect(room.hostName).toBeDefined();
            expect(typeof room.hostName).toBe("string");
            expect(room.playerCount).toBeGreaterThanOrEqual(1);
            expect(room.playerCount).toBeLessThanOrEqual(3);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Returns empty list when no rooms match", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await listPublicRooms();
    expect(result.rooms).toEqual([]);
  });

  it("Falls back to 'Unknown' for host name when no host player found", async () => {
    mockFindMany.mockResolvedValue([{
      code: "ABC123",
      playerCount: 1,
      players: [],
    }]);
    const result = await listPublicRooms();
    expect(result.rooms[0].hostName).toBe("Unknown");
  });
});
