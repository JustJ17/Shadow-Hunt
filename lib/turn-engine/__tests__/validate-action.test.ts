import { describe, it, expect } from "vitest";
import { validateAction } from "@/lib/turn-engine/validate-action";
import type {
  TurnState,
  ActionCardData,
  ActionPayload,
} from "@/lib/turn-engine/types";
import type { AdjacentLocationWithTransport } from "@/lib/map/adjacency";

function makeTurnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    id: "turn-1",
    roomId: "room-1",
    currentPlayerId: "player-1",
    currentRound: 1,
    currentSlot: 1,
    captureAttemptFlag: false,
    version: 0,
    ...overrides,
  };
}

function makeAdjacentLocations(): AdjacentLocationWithTransport[] {
  return [
    {
      id: "loc-B",
      name: "Location B",
      regionId: "region-1",
      isHub: false,
      transport: "car",
      isSameRegion: true,
    },
    {
      id: "loc-C",
      name: "Location C",
      regionId: "region-2",
      isHub: true,
      transport: "plane",
      isSameRegion: false,
    },
    {
      id: "loc-D",
      name: "Location D",
      regionId: "region-1",
      isHub: false,
      transport: "boat",
      isSameRegion: true,
    },
    {
      id: "loc-E",
      name: "Location E",
      regionId: "region-2",
      isHub: false,
      transport: "plane",
      isSameRegion: false,
    },
  ];
}

function makeCards(): ActionCardData[] {
  return [
    { id: "card-1", type: "locator", consumed: false },
    { id: "card-2", type: "extra-move", consumed: true },
  ];
}

describe("validateAction", () => {
  const playerPosition = "loc-A";
  const adjacentLocations = makeAdjacentLocations();
  const playerCards = makeCards();

  describe("turn ownership", () => {
    it("returns NOT_YOUR_TURN if player is not the current player", () => {
      const turnState = makeTurnState({ currentPlayerId: "player-2" });
      const action: ActionPayload = { actionType: "SKIP" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).not.toBeNull();
      expect(result!.code).toBe("NOT_YOUR_TURN");
      expect(result!.success).toBe(false);
    });

    it("returns null for the current player", () => {
      const turnState = makeTurnState({ currentPlayerId: "player-1" });
      const action: ActionPayload = { actionType: "SKIP" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).toBeNull();
    });
  });

  describe("MOVE action", () => {
    const turnState = makeTurnState();

    it("returns null for a valid car move to adjacent location", () => {
      const action: ActionPayload = { actionType: "MOVE", targetLocationId: "loc-B" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).toBeNull();
    });

    it("returns null for a valid boat move to adjacent location", () => {
      const action: ActionPayload = { actionType: "MOVE", targetLocationId: "loc-D" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).toBeNull();
    });

    it("returns null for a valid plane move to a hub", () => {
      const action: ActionPayload = { actionType: "MOVE", targetLocationId: "loc-C" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).toBeNull();
    });

    it("returns SAME_LOCATION_MOVE when target equals current position", () => {
      const action: ActionPayload = { actionType: "MOVE", targetLocationId: "loc-A" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).not.toBeNull();
      expect(result!.code).toBe("SAME_LOCATION_MOVE");
    });

    it("returns INVALID_MOVE when target is not adjacent", () => {
      const action: ActionPayload = { actionType: "MOVE", targetLocationId: "loc-X" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).not.toBeNull();
      expect(result!.code).toBe("INVALID_MOVE");
    });

    it("returns INVALID_TRANSPORT when plane target is not a hub", () => {
      const action: ActionPayload = { actionType: "MOVE", targetLocationId: "loc-E" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).not.toBeNull();
      expect(result!.code).toBe("INVALID_TRANSPORT");
    });
  });

  describe("SKIP action", () => {
    it("always returns null (valid)", () => {
      const turnState = makeTurnState();
      const action: ActionPayload = { actionType: "SKIP" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).toBeNull();
    });
  });

  describe("CAPTURE_ATTEMPT action", () => {
    it("returns null when no prior capture attempt this turn", () => {
      const turnState = makeTurnState({ captureAttemptFlag: false });
      const action: ActionPayload = { actionType: "CAPTURE_ATTEMPT" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).toBeNull();
    });

    it("returns DUPLICATE_CAPTURE_ATTEMPT when flag already set", () => {
      const turnState = makeTurnState({ captureAttemptFlag: true });
      const action: ActionPayload = { actionType: "CAPTURE_ATTEMPT" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).not.toBeNull();
      expect(result!.code).toBe("DUPLICATE_CAPTURE_ATTEMPT");
    });
  });

  describe("USE_CARD action", () => {
    it("returns null for a valid unconsumed card", () => {
      const turnState = makeTurnState();
      const action: ActionPayload = { actionType: "USE_CARD", cardId: "card-1" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).toBeNull();
    });

    it("returns INVALID_CARD for a consumed card", () => {
      const turnState = makeTurnState();
      const action: ActionPayload = { actionType: "USE_CARD", cardId: "card-2" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).not.toBeNull();
      expect(result!.code).toBe("INVALID_CARD");
    });

    it("returns INVALID_CARD for a card not in hand", () => {
      const turnState = makeTurnState();
      const action: ActionPayload = { actionType: "USE_CARD", cardId: "card-999" };

      const result = validateAction(
        action,
        turnState,
        "player-1",
        playerPosition,
        adjacentLocations,
        playerCards
      );

      expect(result).not.toBeNull();
      expect(result!.code).toBe("INVALID_CARD");
    });
  });
});
