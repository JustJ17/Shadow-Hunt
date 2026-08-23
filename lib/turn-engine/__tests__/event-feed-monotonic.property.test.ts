// Feature: action-cards
// Property 31: Event Feed Monotonic Ordering
// **Validates: Requirements 18.5, 18.6**
//
// For any sequence of events within a Room, sequence numbers are strictly
// monotonically increasing and `extra-turn-started` events are ordered after
// all events from the granting turn.

import fc from "fast-check";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitEvent } from "@/lib/turn-engine/event-feed";

// --- Types ---

interface StoredEvent {
  roomId: string;
  sequenceNumber: number;
  roundNumber: number;
  type: string;
  payload: Record<string, unknown>;
}

// --- Mock Transaction Builder ---

/**
 * Creates a mock transaction client that tracks gameEvent writes and
 * simulates the sequence-number-by-aggregate behavior of emitEvent.
 * Each call to gameEvent.aggregate returns the current max sequence,
 * and gameEvent.create stores the event.
 */
function makeMockTx() {
  const events: StoredEvent[] = [];

  const tx = {
    gameEvent: {
      aggregate: vi.fn().mockImplementation(({ where }: any) => {
        const roomId = where.roomId;
        const roomEvents = events.filter((e) => e.roomId === roomId);
        const maxSeq =
          roomEvents.length > 0
            ? Math.max(...roomEvents.map((e) => e.sequenceNumber))
            : null;
        return Promise.resolve({ _max: { sequenceNumber: maxSeq } });
      }),
      create: vi.fn().mockImplementation(({ data }: any) => {
        events.push({
          roomId: data.roomId,
          sequenceNumber: data.sequenceNumber,
          roundNumber: data.roundNumber,
          type: data.type,
          payload: data.payload,
        });
        return Promise.resolve(data);
      }),
    },
  } as any;

  return { tx, events };
}

// --- Event types emitted during card-system turns ---

const TURN_EVENT_TYPES = [
  "player-moved",
  "card-used",
  "player-skipped",
  "blockade-activated",
  "blockade-lifted",
  "action-penalty-applied",
  "player-relocated",
  "capture-failed",
  "spy-captured-reward-collected",
] as const;

// --- Arbitraries ---

const arbRoomId = fc.uuid();
const arbPlayerId = fc.uuid();
const arbRoundNumber = fc.integer({ min: 1, max: 20 });
const arbTurnEventType = fc.constantFrom(...TURN_EVENT_TYPES);

/** Generates a sequence of N turn-action event types (events from a single turn). */
function arbTurnEvents(min: number, max: number) {
  return fc.array(arbTurnEventType, { minLength: min, maxLength: max });
}

describe("Property 31: Event Feed Monotonic Ordering", () => {
  // **Validates: Requirements 18.5, 18.6**

  describe("Multiple calls to emitEvent produce strictly increasing sequence numbers", () => {
    it("for any sequence of events in a room, sequence numbers are strictly monotonically increasing", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoomId,
          arbPlayerId,
          fc.array(
            fc.tuple(arbTurnEventType, arbRoundNumber),
            { minLength: 2, maxLength: 20 }
          ),
          async (roomId, playerId, eventSpecs) => {
            const { tx, events } = makeMockTx();

            // Emit events in sequence (simulating multiple turn actions)
            for (const [eventType, roundNumber] of eventSpecs) {
              await emitEvent(
                roomId,
                eventType,
                { playerId },
                roundNumber,
                tx
              );
            }

            // Verify all events stored
            expect(events.length).toBe(eventSpecs.length);

            // Verify sequence numbers are strictly increasing
            for (let i = 1; i < events.length; i++) {
              expect(events[i].sequenceNumber).toBeGreaterThan(
                events[i - 1].sequenceNumber
              );
            }

            // Verify sequence numbers start at 1 and are contiguous
            for (let i = 0; i < events.length; i++) {
              expect(events[i].sequenceNumber).toBe(i + 1);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it("sequence numbers remain strictly increasing across varying round numbers", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoomId,
          arbPlayerId,
          // Generate round numbers that may not be monotonic (but seq numbers must be)
          fc.array(arbRoundNumber, { minLength: 3, maxLength: 15 }),
          async (roomId, playerId, roundNumbers) => {
            const { tx, events } = makeMockTx();

            for (const roundNumber of roundNumbers) {
              const eventType =
                TURN_EVENT_TYPES[
                  Math.floor(Math.random() * TURN_EVENT_TYPES.length)
                ];
              await emitEvent(
                roomId,
                eventType,
                { playerId },
                roundNumber,
                tx
              );
            }

            // Regardless of round number ordering, sequence numbers are strictly increasing
            for (let i = 1; i < events.length; i++) {
              expect(events[i].sequenceNumber).toBeGreaterThan(
                events[i - 1].sequenceNumber
              );
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe("extra-turn-started events are ordered after all events from the granting turn", () => {
    it("extra-turn-started has a higher sequence number than any event emitted during the granting turn", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoomId,
          arbPlayerId,
          arbRoundNumber,
          arbTurnEvents(1, 4), // events from the granting turn (1-4 actions)
          async (roomId, playerId, roundNumber, grantingTurnEvents) => {
            const { tx, events } = makeMockTx();

            // Phase 1: Emit events from the granting turn
            // (player-moved, card-used, etc. — including the extra-turn card-used event)
            for (const eventType of grantingTurnEvents) {
              await emitEvent(
                roomId,
                eventType,
                { playerId },
                roundNumber,
                tx
              );
            }

            // Record the highest sequence number from the granting turn
            const grantingTurnMaxSeq =
              events.length > 0
                ? Math.max(...events.map((e) => e.sequenceNumber))
                : 0;

            // Phase 2: advanceTurn emits extra-turn-started AFTER the granting turn completes
            await emitEvent(
              roomId,
              "extra-turn-started",
              { playerId, roundNumber },
              roundNumber,
              tx
            );

            // Find the extra-turn-started event
            const extraTurnEvent = events.find(
              (e) => e.type === "extra-turn-started"
            );
            expect(extraTurnEvent).toBeDefined();

            // The extra-turn-started sequence number must be strictly greater
            // than ALL events from the granting turn
            expect(extraTurnEvent!.sequenceNumber).toBeGreaterThan(
              grantingTurnMaxSeq
            );

            // All granting-turn events come before extra-turn-started
            const grantingEvents = events.filter(
              (e) => e.type !== "extra-turn-started"
            );
            for (const ge of grantingEvents) {
              expect(ge.sequenceNumber).toBeLessThan(
                extraTurnEvent!.sequenceNumber
              );
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it("multiple extra-turn-started events maintain strict ordering with their respective granting turns", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoomId,
          arbPlayerId,
          arbRoundNumber,
          arbTurnEvents(1, 3), // events from first granting turn
          arbTurnEvents(1, 3), // events from extra turn (which grants another)
          async (roomId, playerId, roundNumber, firstTurnEvents, extraTurnEvents) => {
            const { tx, events } = makeMockTx();

            // Phase 1: First granting turn actions
            for (const eventType of firstTurnEvents) {
              await emitEvent(
                roomId,
                eventType,
                { playerId, turn: "granting-1" },
                roundNumber,
                tx
              );
            }

            const afterFirstTurnSeq = events.length;

            // Phase 2: extra-turn-started for the first extra turn
            await emitEvent(
              roomId,
              "extra-turn-started",
              { playerId, roundNumber },
              roundNumber,
              tx
            );

            const firstExtraTurnStartedSeq = events[events.length - 1].sequenceNumber;

            // Phase 3: Extra turn actions (which may play another extra-turn card)
            for (const eventType of extraTurnEvents) {
              await emitEvent(
                roomId,
                eventType,
                { playerId, turn: "extra-1" },
                roundNumber,
                tx
              );
            }

            const afterExtraTurnSeq = events[events.length - 1].sequenceNumber;

            // Phase 4: Second extra-turn-started
            await emitEvent(
              roomId,
              "extra-turn-started",
              { playerId, roundNumber, extraTurnIndex: 2 },
              roundNumber,
              tx
            );

            const secondExtraTurnStartedSeq = events[events.length - 1].sequenceNumber;

            // Verify ordering:
            // 1. First extra-turn-started > all first granting turn events
            for (let i = 0; i < afterFirstTurnSeq; i++) {
              expect(firstExtraTurnStartedSeq).toBeGreaterThan(
                events[i].sequenceNumber
              );
            }

            // 2. Second extra-turn-started > all extra turn action events
            expect(secondExtraTurnStartedSeq).toBeGreaterThan(afterExtraTurnSeq);

            // 3. Second extra-turn-started > first extra-turn-started (overall monotonicity)
            expect(secondExtraTurnStartedSeq).toBeGreaterThan(
              firstExtraTurnStartedSeq
            );

            // 4. Overall strict monotonicity across ALL events
            for (let i = 1; i < events.length; i++) {
              expect(events[i].sequenceNumber).toBeGreaterThan(
                events[i - 1].sequenceNumber
              );
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it("extra-turn-started event is distinguishable from granting turn events in the feed", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbRoomId,
          arbPlayerId,
          arbRoundNumber,
          arbTurnEvents(1, 4),
          async (roomId, playerId, roundNumber, grantingTurnEvents) => {
            const { tx, events } = makeMockTx();

            // Emit granting turn events
            for (const eventType of grantingTurnEvents) {
              await emitEvent(
                roomId,
                eventType,
                { playerId },
                roundNumber,
                tx
              );
            }

            // Emit extra-turn-started
            await emitEvent(
              roomId,
              "extra-turn-started",
              { playerId, roundNumber },
              roundNumber,
              tx
            );

            // The extra-turn-started event marks the boundary between granting turn
            // and the extra turn in the event feed. All events before it belong to
            // the granting turn, establishing clear turn delineation.
            const extraTurnIdx = events.findIndex(
              (e) => e.type === "extra-turn-started"
            );
            expect(extraTurnIdx).toBe(grantingTurnEvents.length);

            // The extra-turn-started is the (N+1)th event where N is the granting turn event count
            expect(events[extraTurnIdx].sequenceNumber).toBe(
              grantingTurnEvents.length + 1
            );
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe("sequence number isolation across rooms", () => {
    it("events in different rooms have independent sequence numbers", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(arbRoomId, arbRoomId).filter(([a, b]) => a !== b),
          arbPlayerId,
          arbRoundNumber,
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 5 }),
          async ([roomA, roomB], playerId, roundNumber, countA, countB) => {
            const { tx, events } = makeMockTx();

            // Emit events interleaved between two rooms
            for (let i = 0; i < Math.max(countA, countB); i++) {
              if (i < countA) {
                await emitEvent(
                  roomA,
                  "player-moved",
                  { playerId },
                  roundNumber,
                  tx
                );
              }
              if (i < countB) {
                await emitEvent(
                  roomB,
                  "card-used",
                  { playerId },
                  roundNumber,
                  tx
                );
              }
            }

            // Each room's events should have their own monotonic sequence
            const roomAEvents = events.filter((e) => e.roomId === roomA);
            const roomBEvents = events.filter((e) => e.roomId === roomB);

            expect(roomAEvents.length).toBe(countA);
            expect(roomBEvents.length).toBe(countB);

            // Room A: strictly increasing from 1
            for (let i = 0; i < roomAEvents.length; i++) {
              expect(roomAEvents[i].sequenceNumber).toBe(i + 1);
            }

            // Room B: strictly increasing from 1 (independent of Room A)
            for (let i = 0; i < roomBEvents.length; i++) {
              expect(roomBEvents[i].sequenceNumber).toBe(i + 1);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
