import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

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

// Feature: lobby-player-join, Property 1: Room creation produces valid initial state (code format subset)
describe("Room code generation - Property tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null); // No collisions
  });

  /**
   * **Validates: Requirements 1.3**
   * THE Lobby_System SHALL generate Room_Codes that are exactly 6 alphanumeric characters,
   * case-insensitive, and unique across all active rooms.
   */
  it("Property 1: Generated codes are always exactly 6 characters", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), async () => {
        const code = await generateRoomCode();
        expect(code).toHaveLength(6);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 2: Generated codes contain only uppercase alphanumeric characters", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), async () => {
        const code = await generateRoomCode();
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 3: All characters in generated codes are from the valid charset", async () => {
    const VALID_CHARS = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""));
    await fc.assert(
      fc.asyncProperty(fc.integer(), async () => {
        const code = await generateRoomCode();
        for (const char of code) {
          expect(VALID_CHARS.has(char)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
