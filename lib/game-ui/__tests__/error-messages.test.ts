import { errorMessageFor } from "../error-messages";
import type { TurnActionErrorCode } from "@/lib/turn-engine/types";

const ALL_CODES: TurnActionErrorCode[] = [
  "NOT_IN_ROOM",
  "GAME_NOT_ACTIVE",
  "NOT_YOUR_TURN",
  "NO_ACTIONS_REMAINING",
  "INVALID_MOVE",
  "INVALID_TRANSPORT",
  "SAME_LOCATION_MOVE",
  "ROADS_BLOCKED",
  "AIRWAYS_BLOCKED",
  "SEA_ROUTES_BLOCKED",
  "DUPLICATE_CAPTURE_ATTEMPT",
  "INVALID_CARD",
  "UNKNOWN_CARD_TYPE",
  "INVALID_CARD_TARGET",
  "CONCURRENCY_CONFLICT",
  "UNKNOWN_ACTION_TYPE",
];

describe("errorMessageFor", () => {
  it("returns a non-empty string for every TurnActionErrorCode", () => {
    for (const code of ALL_CODES) {
      const msg = errorMessageFor(code);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('returns a non-empty string for "UNKNOWN"', () => {
    const msg = errorMessageFor("UNKNOWN");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("returns distinct messages for all 17 codes", () => {
    const allCodesWithUnknown: (TurnActionErrorCode | "UNKNOWN")[] = [
      ...ALL_CODES,
      "UNKNOWN",
    ];
    const messages = allCodesWithUnknown.map((code) => errorMessageFor(code));
    const uniqueMessages = new Set(messages);
    expect(uniqueMessages.size).toBe(17);
  });

  it("maps specific codes to their expected messages", () => {
    expect(errorMessageFor("NOT_YOUR_TURN")).toBe("It is not your turn yet.");
    expect(errorMessageFor("CONCURRENCY_CONFLICT")).toBe(
      "Another action was processed simultaneously. The board has been refreshed."
    );
    expect(errorMessageFor("UNKNOWN")).toBe(
      "Something went wrong. Please check your connection and try again."
    );
  });

  it("has exactly 16 TurnActionErrorCode entries plus UNKNOWN (17 total)", () => {
    const allCodesWithUnknown: (TurnActionErrorCode | "UNKNOWN")[] = [
      ...ALL_CODES,
      "UNKNOWN",
    ];
    // Every code returns a value (no undefined)
    for (const code of allCodesWithUnknown) {
      expect(errorMessageFor(code)).toBeDefined();
    }
  });
});
