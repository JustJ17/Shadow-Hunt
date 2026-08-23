import fc from "fast-check";
import {
  formatEventMessage,
  formatRelativeTimestamp,
  type NameLookupFn,
  type PlayerLookupFn,
} from "@/lib/game-ui/event-messages";
import type { GameEventData, GameEventType } from "@/lib/turn-engine/types";

// --- Helpers ---

const KNOWN_EVENT_TYPES: GameEventType[] = [
  "game-won",
  "game-draw",
  "capture-failed",
  "spy-captured-reward-collected",
  "player-moved",
  "card-used",
  "player-skipped",
  "turn-skipped",
  "blockade-activated",
  "blockade-lifted",
  "action-penalty-applied",
  "player-relocated",
  "extra-turn-started",
];

function makeEvent(
  type: string,
  payload: Record<string, unknown> = {},
): GameEventData {
  return {
    id: "evt-1",
    sequenceNumber: 1,
    roundNumber: 1,
    type: type as GameEventData["type"],
    payload,
    createdAt: new Date().toISOString(),
  };
}

const nameLookup: NameLookupFn = (id, kind) => {
  const map: Record<string, string> = {
    "loc-london": "London",
    "loc-paris": "Paris",
    "loc-tokyo": "Tokyo",
    "reg-europe": "Europe",
    "reg-asia": "Asia",
  };
  return map[id] ?? id;
};

const playerLookup: PlayerLookupFn = (playerId) => {
  const map: Record<string, string> = {
    "p1": "Alice",
    "p2": "Bob",
    "p3": "Charlie",
  };
  return map[playerId] ?? "someone";
};

// --- Unit Tests: formatEventMessage ---

describe("formatEventMessage", () => {
  describe("all 13 event types resolve player/location names", () => {
    it("game-won", () => {
      const event = makeEvent("game-won", {
        winnerId: "p1",
        locationId: "loc-london",
        mastermindLocationId: "loc-paris",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("London");
    });

    it("game-draw", () => {
      const event = makeEvent("game-draw", {
        roundNumber: 10,
        mastermindLocationId: "loc-tokyo",
        reason: "max-rounds-exceeded",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Tokyo");
      expect(msg).toContain("draw");
    });

    it("capture-failed", () => {
      const event = makeEvent("capture-failed", {
        playerId: "p2",
        locationId: "loc-paris",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Bob");
      expect(msg).toContain("Paris");
      expect(msg).toContain("failed");
    });

    it("spy-captured-reward-collected", () => {
      const event = makeEvent("spy-captured-reward-collected", {
        playerId: "p1",
        regionId: "reg-europe",
        rewardTier: 2,
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("Europe");
      expect(msg).toContain("2");
    });

    it("player-moved", () => {
      const event = makeEvent("player-moved", {
        playerId: "p3",
        fromLocationId: "loc-london",
        toLocationId: "loc-paris",
        transport: "plane",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Charlie");
      expect(msg).toContain("Paris");
    });

    it("card-used without target", () => {
      const event = makeEvent("card-used", {
        playerId: "p1",
        cardIdentifier: "extra-turn",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("extra-turn");
    });

    it("card-used with target", () => {
      const event = makeEvent("card-used", {
        playerId: "p1",
        cardIdentifier: "lose-an-action",
        targetPlayerId: "p2",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("Bob");
      expect(msg).toContain("lose-an-action");
    });

    it("player-skipped", () => {
      const event = makeEvent("player-skipped", { playerId: "p2" });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Bob");
      expect(msg).toContain("skipped");
    });

    it("turn-skipped", () => {
      const event = makeEvent("turn-skipped", { playerId: "p3" });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Charlie");
      expect(msg).toContain("skipped");
    });

    it("blockade-activated", () => {
      const event = makeEvent("blockade-activated", {
        playerId: "p1",
        transportType: "plane",
        roundNumber: 3,
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("plane");
      expect(msg).toContain("blockade");
    });

    it("blockade-lifted", () => {
      const event = makeEvent("blockade-lifted", {
        playerId: "p2",
        liftedCount: 3,
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Bob");
      expect(msg).toContain("3");
    });

    it("action-penalty-applied", () => {
      const event = makeEvent("action-penalty-applied", {
        playerId: "p1",
        targetPlayerId: "p3",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("Charlie");
      expect(msg).toContain("penalty");
    });

    it("player-relocated", () => {
      const event = makeEvent("player-relocated", {
        playerId: "p2",
        fromLocationId: "loc-london",
        toLocationId: "loc-tokyo",
        cause: "drop-ship",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Bob");
      expect(msg).toContain("Tokyo");
      expect(msg).toContain("relocated");
    });

    it("extra-turn-started", () => {
      const event = makeEvent("extra-turn-started", {
        playerId: "p1",
        roundNumber: 5,
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("extra turn");
    });
  });

  describe("unknown event type", () => {
    it("returns 'Unrecognised event' for unknown type", () => {
      const event = makeEvent("some-future-event", { playerId: "p1" });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toBe("Unrecognised event");
    });

    it("returns 'Unrecognised event' for empty string type", () => {
      const event = makeEvent("", {});
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toBe("Unrecognised event");
    });
  });

  describe("missing payload fields", () => {
    it("produces 'someone' for missing player reference", () => {
      const event = makeEvent("player-moved", {
        toLocationId: "loc-london",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("someone");
    });

    it("produces 'an unknown location' for missing location reference", () => {
      const event = makeEvent("player-moved", {
        playerId: "p1",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("an unknown location");
    });

    it("handles completely empty payload", () => {
      const event = makeEvent("game-won", {});
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("someone");
      expect(msg).toContain("an unknown location");
    });

    it("produces 'someone' for action-penalty-applied with missing targetPlayerId", () => {
      const event = makeEvent("action-penalty-applied", {
        playerId: "p1",
      });
      const msg = formatEventMessage(event, nameLookup, playerLookup);
      expect(msg).toContain("Alice");
      expect(msg).toContain("someone");
    });
  });
});

// --- Unit Tests: formatRelativeTimestamp ---

describe("formatRelativeTimestamp", () => {
  const now = new Date("2024-01-15T12:00:00Z");

  it("returns '0s' for same time", () => {
    expect(formatRelativeTimestamp("2024-01-15T12:00:00Z", now)).toBe("0s");
  });

  it("returns seconds for delta < 60s", () => {
    const createdAt = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeTimestamp(createdAt, now)).toBe("30s");
  });

  it("returns '59s' for 59 seconds", () => {
    const createdAt = new Date(now.getTime() - 59_000).toISOString();
    expect(formatRelativeTimestamp(createdAt, now)).toBe("59s");
  });

  it("returns minutes for delta >= 60s and < 60min", () => {
    const createdAt = new Date(now.getTime() - 60_000).toISOString();
    expect(formatRelativeTimestamp(createdAt, now)).toBe("1m");
  });

  it("returns '59m' for 59 minutes", () => {
    const createdAt = new Date(now.getTime() - 59 * 60_000).toISOString();
    expect(formatRelativeTimestamp(createdAt, now)).toBe("59m");
  });

  it("returns hours for delta >= 60min", () => {
    const createdAt = new Date(now.getTime() - 60 * 60_000).toISOString();
    expect(formatRelativeTimestamp(createdAt, now)).toBe("1h");
  });

  it("returns large hour values", () => {
    const createdAt = new Date(now.getTime() - 48 * 60 * 60_000).toISOString();
    expect(formatRelativeTimestamp(createdAt, now)).toBe("48h");
  });

  it("returns '0s' when createdAt is in the future (clamped to 0)", () => {
    const createdAt = new Date(now.getTime() + 5000).toISOString();
    expect(formatRelativeTimestamp(createdAt, now)).toBe("0s");
  });
});

// --- Property Tests ---

describe("Property tests", () => {
  /**
   * **Validates: Requirements 8.8**
   * Property 11: Relative timestamp formatting
   * For any ISO timestamp and reference time, formatRelativeTimestamp returns
   * "Xs" (delta < 60s), "Xm" (delta < 60min), or "Xh" (delta >= 60min).
   */
  it("Property 11: formatRelativeTimestamp always returns valid format", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2000-01-01"), max: new Date("2030-01-01") }),
        fc.date({ min: new Date("2000-01-01"), max: new Date("2030-01-01") }),
        (created, now) => {
          // Ensure now >= created for meaningful output
          const effectiveNow =
            now.getTime() >= created.getTime() ? now : created;
          const result = formatRelativeTimestamp(
            created.toISOString(),
            effectiveNow,
          );
          expect(result).toMatch(/^\d+[smh]$/);

          const value = parseInt(result.slice(0, -1), 10);
          const unit = result.slice(-1);
          expect(value).toBeGreaterThanOrEqual(0);

          const deltaSec = Math.floor(
            (effectiveNow.getTime() - created.getTime()) / 1000,
          );
          if (deltaSec < 60) {
            expect(unit).toBe("s");
          } else if (deltaSec < 3600) {
            expect(unit).toBe("m");
          } else {
            expect(unit).toBe("h");
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   * Property 12: Event message name resolution
   * For any known event type with player/location ids in payload,
   * formatEventMessage produces a sentence containing resolved names.
   */
  it("Property 12: known event types resolve lookup names", () => {
    const playerIds = ["p1", "p2", "p3"];
    const locationIds = ["loc-london", "loc-paris", "loc-tokyo"];
    const regionIds = ["reg-europe", "reg-asia"];

    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_EVENT_TYPES),
        fc.constantFrom(...playerIds),
        fc.constantFrom(...locationIds),
        fc.constantFrom(...regionIds),
        (eventType, playerId, locationId, regionId) => {
          const payload: Record<string, unknown> = {
            playerId,
            winnerId: playerId,
            targetPlayerId: playerIds.find((p) => p !== playerId) ?? "p2",
            locationId,
            toLocationId: locationId,
            fromLocationId: locationIds.find((l) => l !== locationId),
            mastermindLocationId: locationId,
            regionId,
            transportType: "plane",
            liftedCount: 2,
            rewardTier: 1,
            cardIdentifier: "extra-turn",
            roundNumber: 1,
            cause: "drop-ship",
          };
          const event = makeEvent(eventType, payload);
          const msg = formatEventMessage(event, nameLookup, playerLookup);

          // The message should not be "Unrecognised event" for known types
          expect(msg).not.toBe("Unrecognised event");
          // The message should be a non-empty string
          expect(msg.length).toBeGreaterThan(0);
          // Message should not contain raw ids when lookups succeed
          expect(msg).not.toContain("someone");
          expect(msg).not.toContain("an unknown location");
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.5**
   * Property 13: Unknown event type fallback
   * For any type string not in the 13 known types, formatEventMessage returns
   * "Unrecognised event".
   */
  it("Property 13: unknown event types return 'Unrecognised event'", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !KNOWN_EVENT_TYPES.includes(s as GameEventType),
        ),
        (unknownType) => {
          const event = makeEvent(unknownType, { playerId: "p1" });
          const msg = formatEventMessage(event, nameLookup, playerLookup);
          expect(msg).toBe("Unrecognised event");
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 8.6**
   * Property 14: Missing event payload fallback
   * For any known event type with an empty payload, formatEventMessage
   * substitutes "someone" for missing players and "an unknown location" for
   * missing locations — never throws.
   */
  it("Property 14: missing payload fields produce fallback text, never throw", () => {
    fc.assert(
      fc.property(fc.constantFrom(...KNOWN_EVENT_TYPES), (eventType) => {
        const event = makeEvent(eventType, {});
        // Should never throw
        const msg = formatEventMessage(event, nameLookup, playerLookup);
        expect(typeof msg).toBe("string");
        expect(msg.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
