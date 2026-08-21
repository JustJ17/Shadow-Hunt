// Feature: map-game-initialization, Property 15: Spy capture records the captor

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { initializeGame } from "@/lib/game/initialize-game";
import { markSpyCaptured } from "@/lib/game/query-game-state";

let prisma: PrismaClient;

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter });
}, 30000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Spy Capture Property Tests", () => {
  // **Validates: Requirements 9.3**

  describe("Property 15: Spy capture records the captor", () => {
    // Feature: map-game-initialization, Property 15: Spy capture records the captor
    it("after capture, only the targeted spy is updated with captured=true and the correct capturedByPlayerId", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          fc.string({ minLength: 5, maxLength: 10 }),
          async (spyIndex, captorPlayerId) => {
            // Create a unique room for this iteration
            const roomCode = `C${Date.now().toString(36).slice(-5)}`;
            const room = await prisma.room.create({
              data: {
                code: roomCode,
                status: "waiting",
                visibility: "private",
                playerCount: 0,
              },
            });

            try {
              // Initialize game: creates 1 threat + 6 spies
              const result = await prisma.$transaction(async (tx) => {
                return initializeGame(room.id, tx);
              });

              expect(result.success).toBe(true);
              if (!result.success) return;

              // Query all spies for the room
              const spies = await prisma.gameSpy.findMany({
                where: { roomId: room.id },
                orderBy: { createdAt: "asc" },
              });

              expect(spies.length).toBe(6);

              // Pick the spy at the random index
              const targetSpy = spies[spyIndex];

              // Call markSpyCaptured
              await markSpyCaptured(targetSpy.id, captorPlayerId);

              // Query all spies again after capture
              const spiesAfter = await prisma.gameSpy.findMany({
                where: { roomId: room.id },
              });

              // Assert: the targeted spy has captured=true and correct capturedByPlayerId
              const capturedSpy = spiesAfter.find(
                (s) => s.id === targetSpy.id
              );
              expect(capturedSpy).toBeDefined();
              expect(capturedSpy!.captured).toBe(true);
              expect(capturedSpy!.capturedByPlayerId).toBe(captorPlayerId);

              // Assert: all OTHER spies still have captured=false and capturedByPlayerId=null
              const otherSpies = spiesAfter.filter(
                (s) => s.id !== targetSpy.id
              );
              expect(otherSpies.length).toBe(5);
              for (const spy of otherSpies) {
                expect(spy.captured).toBe(false);
                expect(spy.capturedByPlayerId).toBeNull();
              }
            } finally {
              // Clean up: delete the room (cascade deletes game state)
              await prisma.room.delete({ where: { id: room.id } });
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 60000);
  });
});
