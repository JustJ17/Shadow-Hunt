
vi.mock("@/lib/prisma", () => ({
  prisma: {
    room: {
      findUnique: vi.fn(),
    },
  },
}));

import { generateRoomCode } from "../room-code";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.room.findUnique as ReturnType<typeof vi.fn>;

describe("generateRoomCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a 6-character uppercase alphanumeric code", async () => {
    mockFindUnique.mockResolvedValue(null);

    const code = await generateRoomCode();

    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("should retry on collision and return a unique code", async () => {
    // First call finds a collision, second call finds no collision
    mockFindUnique
      .mockResolvedValueOnce({ id: "existing-room", code: "ABC123" })
      .mockResolvedValue(null);

    const code = await generateRoomCode();

    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });

  it("should throw after max retries when all codes collide", async () => {
    // All attempts find existing rooms
    mockFindUnique.mockResolvedValue({ id: "existing-room", code: "ABC123" });

    await expect(generateRoomCode()).rejects.toThrow(
      "Failed to generate unique room code after maximum retries"
    );

    expect(mockFindUnique).toHaveBeenCalledTimes(10);
  });

  it("should check DB with the generated code", async () => {
    mockFindUnique.mockResolvedValue(null);

    const code = await generateRoomCode();

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { code } });
  });
});
