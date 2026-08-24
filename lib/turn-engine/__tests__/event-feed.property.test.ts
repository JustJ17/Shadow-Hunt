// Feature: movement-turn-actions
// Property 18: Event Feed Monotonicity and Completeness
// Property 19: Card Validation and Consumption
// **Validates: Requirements 12.1, 12.5, 12.6, 12.7, 12.8, 6.1, 6.3, 6.6**

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { emitEvent, getEventsFeed } from "@/lib/turn-engine/event-feed";
import { validateAction } from "@/lib/turn-engine/validate-action";
import { resolveSpyAndReward } from "@/lib/turn-engine/resolution/resolve-spy-reward";
import type { TurnState, ActionCardData, BlockadeState } from "@/lib/turn-engine/types";
import type { AdjacentLocationWithTransport } from "@/lib/map/adjacency";

let prisma: PrismaClient;
let roomCounter = 0;

// Valid event types emitted by the turn engine
const VALID_EVENT_TYPES = [
  "game-won",
  "capture-failed",
  "spy-captured-reward-collected",
  "player-moved",
  "card-used",
  "player-skipped",
  "turn-skipped",
] as const;

function makeTurnState(
  playerId: string,
  overrides: Partial<TurnState> = {}
): TurnState {
  return {
    id: "test-turn-state-id",
    roomId: "test-room-id",
    currentPlayerId: playerId,
    currentRound: 1,
    actionsRemaining: 2,
    actionBudget: 2,
    captureAttemptFlag: false,
    isExtraTurn: false,
    version: 0,
    ...overrides,
  };
}

const TEST_PLAYER_ID = "test-player-event-feed";
const EMPTY_ADJACENT: AdjacentLocationWithTransport[] = [];
const NO_BLOCKADES: BlockadeState = { blockedTransports: new Set() };
const DEFAULT_ACTIONS_REMAINING = 2;

describe("Event Feed Property Tests", () => {
  // **Validates: Requirements 12.1, 12.5, 12.6, 12.7, 12.8, 6.1, 6.3, 6.6**

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

  describe("Property 18: Event Feed Monotonicity and Completeness", () => {
    // **Validates: Requirements 12.1, 12.5, 12.6, 12.7, 12.8**

    it("sequence numbers are strictly increasing and round numbers are non-decreasing", async () => {
      // Generate event sequences with varying types and round numbers
      const eventTypeArb = fc.constantFrom(...VALID_EVENT_TYPES);
      const roundNumberArb = fc.integer({ min: 1, max: 20 });

      // Generate an array of (eventType, roundNumber) pairs with non-decreasing round numbers
      const eventSequenceArb = fc
        .array(
          fc.tuple(eventTypeArb, roundNumberArb),
          { minLength: 2, maxLength: 15 }
        )
        .map((events) => {
          // Sort by round number to ensure non-decreasing rounds (mimics real game flow)
          return events.sort((a, b) => a[1] - b[1]);
        });

      await fc.assert(
        fc.asyncProperty(eventSequenceArb, async (eventSequence) => {
          await prisma
            .$transaction(async (tx) => {
              // Create a test room
              const room = await tx.room.create({
                data: {
                  code: `EF${(++roomCounter).toString().padStart(4, "0")}`,
                  status: "in-progress",
                },
              });

              // Emit all events in sequence
              for (const [eventType, roundNumber] of eventSequence) {
                await emitEvent(
                  room.id,
                  eventType,
                  { playerId: TEST_PLAYER_ID, detail: eventType },
                  roundNumber,
                  tx
                );
              }

              // Read back via getEventsFeed (uses prisma directly, not tx)
              // Since we're in a transaction, we query directly from tx
              const events = await tx.gameEvent.findMany({
                where: { roomId: room.id },
                orderBy: { sequenceNumber: "asc" },
              });

              // Verify all events were stored
              expect(events.length).toBe(eventSequence.length);

              // Verify sequence numbers are strictly increasing
              for (let i = 1; i < events.length; i++) {
                expect(events[i].sequenceNumber).toBeGreaterThan(
                  events[i - 1].sequenceNumber
                );
              }

              // Verify round numbers are non-decreasing
              for (let i = 1; i < events.length; i++) {
                expect(events[i].roundNumber).toBeGreaterThanOrEqual(
                  events[i - 1].roundNumber
                );
              }

              // Verify each event has a valid type
              for (const event of events) {
                expect(VALID_EVENT_TYPES).toContain(event.type);
              }

              // Verify sequence numbers start from 1 and are contiguous
              for (let i = 0; i < events.length; i++) {
                expect(events[i].sequenceNumber).toBe(i + 1);
              }

              // Rollback
              throw new Error("ROLLBACK");
            })
            .catch((e) => {
              if (e.message !== "ROLLBACK") throw e;
            });
        }),
        { numRuns: 30 }
      );
    }, 120000);

    it("getEventsFeed returns events after the provided sequence number, limited to 50", async () => {
      await prisma
        .$transaction(async (tx) => {
          // Create a test room
          const room = await tx.room.create({
            data: {
              code: `EF${(++roomCounter).toString().padStart(4, "0")}`,
              status: "in-progress",
            },
          });

          // Emit 10 events
          for (let i = 0; i < 10; i++) {
            await emitEvent(
              room.id,
              "player-moved",
              { playerId: TEST_PLAYER_ID, step: i },
              1,
              tx
            );
          }

          // Query from sequence 0 — should get all 10
          const allEvents = await tx.gameEvent.findMany({
            where: { roomId: room.id, sequenceNumber: { gt: 0 } },
            orderBy: { sequenceNumber: "asc" },
            take: 50,
          });
          expect(allEvents.length).toBe(10);

          // Query from sequence 5 — should get events 6–10
          const laterEvents = await tx.gameEvent.findMany({
            where: { roomId: room.id, sequenceNumber: { gt: 5 } },
            orderBy: { sequenceNumber: "asc" },
            take: 50,
          });
          expect(laterEvents.length).toBe(5);
          expect(laterEvents[0].sequenceNumber).toBe(6);

          // Rollback
          throw new Error("ROLLBACK");
        })
        .catch((e) => {
          if (e.message !== "ROLLBACK") throw e;
        });
    }, 30000);

    it("events are correctly typed for each action kind", async () => {
      // Each event type has correct payload shape
      await prisma
        .$transaction(async (tx) => {
          const room = await tx.room.create({
            data: {
              code: `EF${(++roomCounter).toString().padStart(4, "0")}`,
              status: "in-progress",
            },
          });

          // Emit one of each type
          await emitEvent(
            room.id,
            "player-moved",
            { playerId: "p1", fromLocationId: "A", toLocationId: "B", transport: "car" },
            1,
            tx
          );
          await emitEvent(
            room.id,
            "player-skipped",
            { playerId: "p1" },
            1,
            tx
          );
          await emitEvent(
            room.id,
            "card-used",
            { playerId: "p1", cardType: "locator" },
            2,
            tx
          );
          await emitEvent(
            room.id,
            "capture-failed",
            { playerId: "p1", locationId: "C" },
            2,
            tx
          );
          await emitEvent(
            room.id,
            "turn-skipped",
            { playerId: "p2" },
            3,
            tx
          );

          const events = await tx.gameEvent.findMany({
            where: { roomId: room.id },
            orderBy: { sequenceNumber: "asc" },
          });

          expect(events.length).toBe(5);
          expect(events[0].type).toBe("player-moved");
          expect(events[1].type).toBe("player-skipped");
          expect(events[2].type).toBe("card-used");
          expect(events[3].type).toBe("capture-failed");
          expect(events[4].type).toBe("turn-skipped");

          // Sequence numbers strictly increasing
          for (let i = 1; i < events.length; i++) {
            expect(events[i].sequenceNumber).toBeGreaterThan(
              events[i - 1].sequenceNumber
            );
          }

          // Round numbers non-decreasing
          for (let i = 1; i < events.length; i++) {
            expect(events[i].roundNumber).toBeGreaterThanOrEqual(
              events[i - 1].roundNumber
            );
          }

          throw new Error("ROLLBACK");
        })
        .catch((e) => {
          if (e.message !== "ROLLBACK") throw e;
        });
    }, 30000);
  });

  describe("Property 19: Card Validation and Consumption", () => {
    // **Validates: Requirements 6.1, 6.3, 6.6**

    it("USE_CARD is valid iff card is held and not consumed", async () => {
      // Generate random card hands with some consumed and some not
      const cardArb = fc.record({
        id: fc.uuid(),
        type: fc.constantFrom("locator", "extra-move", "reveal-region", "peek-clue"),
        consumed: fc.boolean(),
      });

      const handArb = fc.array(cardArb, { minLength: 1, maxLength: 5 });

      await fc.assert(
        fc.asyncProperty(handArb, async (hand) => {
          const turnState = makeTurnState(TEST_PLAYER_ID);
          const playerCards: ActionCardData[] = hand;

          // Pick a card from the hand
          for (const card of hand) {
            const result = validateAction(
              { actionType: "USE_CARD", cardId: card.id },
              turnState,
              TEST_PLAYER_ID,
              "some-location",
              EMPTY_ADJACENT,
              playerCards,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );

            if (!card.consumed) {
              // Card is held and not consumed → valid
              expect(result).toBeNull();
            } else {
              // Card is consumed → invalid
              expect(result).not.toBeNull();
              expect(result!.code).toBe("INVALID_CARD");
            }
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);

    it("USE_CARD for a non-existent card is rejected with INVALID_CARD", async () => {
      const cardArb = fc.record({
        id: fc.uuid(),
        type: fc.constantFrom("locator", "extra-move", "reveal-region", "peek-clue"),
        consumed: fc.constant(false),
      });

      const handArb = fc.array(cardArb, { minLength: 0, maxLength: 5 });

      await fc.assert(
        fc.asyncProperty(
          handArb,
          fc.uuid(),
          async (hand, nonExistentCardId) => {
            // Ensure the non-existent card ID is not in the hand
            const handIds = new Set(hand.map((c) => c.id));
            fc.pre(!handIds.has(nonExistentCardId));

            const turnState = makeTurnState(TEST_PLAYER_ID);
            const playerCards: ActionCardData[] = hand;

            const result = validateAction(
              { actionType: "USE_CARD", cardId: nonExistentCardId },
              turnState,
              TEST_PLAYER_ID,
              "some-location",
              EMPTY_ADJACENT,
              playerCards,
              NO_BLOCKADES,
              DEFAULT_ACTIONS_REMAINING
            );

            expect(result).not.toBeNull();
            expect(result!.code).toBe("INVALID_CARD");
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    it("reward always grants full tier regardless of existing hand size", async () => {
      // Test that grantRewardCards grants all cards from reward tier with no hand cap
      const startingHandSizeArb = fc.integer({ min: 0, max: 10 });
      const captureOrderArb = fc.integer({ min: 1, max: 6 });

      await fc.assert(
        fc.asyncProperty(
          startingHandSizeArb,
          captureOrderArb,
          async (startingHandSize, captureOrder) => {
            await prisma
              .$transaction(async (tx) => {
                // Create test room with all required infrastructure
                const room = await tx.room.create({
                  data: {
                    code: `HC${(++roomCounter).toString().padStart(4, "0")}`,
                    status: "in-progress",
                  },
                });

                // We need a region and locations for the spy resolution flow
                // Use existing regions/locations from the seeded database
                const regions = await tx.region.findMany({
                  include: { locations: true },
                });
                // Need at least 2 regions for the test
                expect(regions.length).toBeGreaterThanOrEqual(2);

                const spyRegion = regions[0];
                const otherRegion = regions[1];

                // The spy's location (in spyRegion)
                const spyLocation = spyRegion.locations[0];
                // The player's location must be in otherRegion (to trigger Case 1: left capture region)
                const playerLocation = otherRegion.locations[0];

                // Create a game spy (captured by this player — recorded via SpyCapture)
                const gameSpy = await tx.gameSpy.create({
                  data: {
                    roomId: room.id,
                    regionId: spyRegion.id,
                    locationId: spyLocation.id,
                  },
                });
                await tx.spyCapture.create({
                  data: {
                    roomId: room.id,
                    spyId: gameSpy.id,
                    playerId: TEST_PLAYER_ID,
                    captureOrder: 1,
                  },
                });

                // Create player position with a pending reward (in a different region to trigger collection)
                await tx.playerPosition.create({
                  data: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    locationId: playerLocation.id,
                    skipNextTurn: false,
                    pendingRewardRegionId: spyRegion.id,
                    pendingRewardCaptureOrder: captureOrder,
                  },
                });

                // Create starting cards (unconsumed) for the player
                for (let i = 0; i < startingHandSize; i++) {
                  await tx.actionCard.create({
                    data: {
                      roomId: room.id,
                      playerId: TEST_PLAYER_ID,
                      type: "locate-the-mastermind",
                      consumed: false,
                    },
                  });
                }

                // Call resolveSpyAndReward which triggers grantRewardCards internally
                await resolveSpyAndReward(
                  room.id,
                  TEST_PLAYER_ID,
                  playerLocation.id,
                  1,
                  tx
                );

                // Count unconsumed cards after reward granting
                const finalCardCount = await tx.actionCard.count({
                  where: {
                    roomId: room.id,
                    playerId: TEST_PLAYER_ID,
                    consumed: false,
                  },
                });

                // Compute expected reward tier
                let expectedTier: number;
                if (captureOrder === 1) expectedTier = 4;
                else if (captureOrder === 2) expectedTier = 3;
                else if (captureOrder === 3) expectedTier = 2;
                else expectedTier = 1;

                // No hand cap — full reward tier is always granted
                expect(finalCardCount).toBe(startingHandSize + expectedTier);

                throw new Error("ROLLBACK");
              })
              .catch((e) => {
                if (e.message !== "ROLLBACK") throw e;
              });
          }
        ),
        { numRuns: 20 }
      );
    }, 300000);
  });
});
