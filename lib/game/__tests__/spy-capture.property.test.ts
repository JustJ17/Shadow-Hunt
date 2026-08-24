// Feature: map-game-initialization, Property 15: Spy capture records the captor
// Updated for multi-capture model: SpyCapture join table, all 4 players can capture each spy

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { initializeGame } from "@/lib/game/initialize-game";
import { recordSpyCapture } from "@/lib/game/query-game-state";

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
  // **Validates: Requirements 9.3 (multi-capture model)**

  describe("Property 15: Spy capture records the captor via SpyCapture table", () => {
    it("after capture, a SpyCapture row exists with correct playerId and captureOrder", async () => {
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

              // Record the capture via recordSpyCapture
              const captureOrder = await recordSpyCapture(
                targetSpy.id,
                room.id,
                captorPlayerId
              );

              // captureOrder should be 1 (first to capture this spy)
              expect(captureOrder).toBe(1);

              // A SpyCapture row must exist for this spy + player
              const capture = await prisma.spyCapture.findUnique({
                where: {
                  spyId_playerId: {
                    spyId: targetSpy.id,
                    playerId: captorPlayerId,
                  },
                },
              });
              expect(capture).not.toBeNull();
              expect(capture!.playerId).toBe(captorPlayerId);
              expect(capture!.captureOrder).toBe(1);
              expect(capture!.roomId).toBe(room.id);

              // All OTHER spies must have NO SpyCapture rows
              const otherSpies = spies.filter((s) => s.id !== targetSpy.id);
              expect(otherSpies.length).toBe(5);
              for (const spy of otherSpies) {
                const otherCaptures = await prisma.spyCapture.findMany({
                  where: { spyId: spy.id },
                });
                expect(otherCaptures.length).toBe(0);
              }
            } finally {
              // Clean up: delete the room (cascade deletes game state + spyCaptures)
              await prisma.room.delete({ where: { id: room.id } });
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 60000);

    it("multiple players can capture the same spy with increasing captureOrder", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          async (spyIndex) => {
            const roomCode = `M${Date.now().toString(36).slice(-5)}`;
            const room = await prisma.room.create({
              data: {
                code: roomCode,
                status: "waiting",
                visibility: "private",
                playerCount: 0,
              },
            });

            try {
              const result = await prisma.$transaction(async (tx) => {
                return initializeGame(room.id, tx);
              });

              expect(result.success).toBe(true);
              if (!result.success) return;

              const spies = await prisma.gameSpy.findMany({
                where: { roomId: room.id },
                orderBy: { createdAt: "asc" },
              });

              const targetSpy = spies[spyIndex];
              const playerIds = ["player-A", "player-B", "player-C", "player-D"];

              // All 4 players capture the same spy — each gets a higher captureOrder
              for (let i = 0; i < playerIds.length; i++) {
                const order = await recordSpyCapture(
                  targetSpy.id,
                  room.id,
                  playerIds[i]
                );
                expect(order).toBe(i + 1); // 1st, 2nd, 3rd, 4th
              }

              // Verify all 4 SpyCapture rows exist with correct orders
              const captures = await prisma.spyCapture.findMany({
                where: { spyId: targetSpy.id },
                orderBy: { captureOrder: "asc" },
              });

              expect(captures.length).toBe(4);
              for (let i = 0; i < 4; i++) {
                expect(captures[i].playerId).toBe(playerIds[i]);
                expect(captures[i].captureOrder).toBe(i + 1);
              }
            } finally {
              await prisma.room.delete({ where: { id: room.id } });
            }
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);
  });
});
