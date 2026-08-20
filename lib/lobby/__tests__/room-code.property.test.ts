import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// Feature: lobby-player-join, Property 1: Room creation produces valid initial state (code format subset)

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

describe("Room code generation properties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * Property 1: Generated codes are always 6 chars, uppercase, alphanumeric.
   * For any random generation, the output must match /^[A-Z0-9]{6}$/.
   */
  it("Property 1: Generated codes are always 6 chars, uppercase, alphanumeric", async () => {
    mockFindUnique.mockResolvedValue(null); // No collisions

    await fc.assert(
      fc.asyncProperty(fc.integer(), async () => {
        const code = await generateRoomCode();
        expect(code).toHaveLength(6);
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
      }),
      { numRuns: 100 }
    );
  });
});
