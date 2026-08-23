// Feature: action-cards
// Property 25: Rejected Submissions Are Inert
// **Validates: Requirements 2.3, 2.5, 2.6, 6.6, 22.3**
//
// For any rejected USE_CARD or MOVE submission (due to INVALID_CARD, INVALID_CARD_TARGET,
// UNKNOWN_CARD_TYPE, ROADS_BLOCKED, etc.), the full game state — cards, positions,
// Blockades, Notebook, Actions_Remaining, Event_Feed — is unchanged from the
// pre-submission snapshot.

import fc from "fast-check";
import { describe, it, expect, vi } from "vitest";
import { validateAction } from "@/lib/turn-engine/validate-action";
import { dispatchCard } from "@/lib/turn-engine/cards/dispatcher";
import { LEGACY_CARD_TYPES } from "@/lib/turn-engine/cards/types";
import type {
  TurnState,
  ActionCardData,
  BlockadeState,
  ActionPayload,
} from "@/lib/turn-engine/types";
import type { AdjacentLocationWithTransport } from "@/lib/map/adjacency";
import type { TransportType } from "@/lib/map/types";

// --- Test Helpers ---

function makeTurnState(overrides: Partial<TurnState> = {}): TurnState {
  return {
    id: "turn-1",
    roomId: "room-1",
    currentPlayerId: "player-1",
    currentRound: 1,
    actionsRemaining: 2,
    actionBudget: 2,
    captureAttemptFlag: false,
    isExtraTurn: false,
    version: 0,
    ...overrides,
  };
}

function makeAdjacentLocations(transports: TransportType[]): AdjacentLocationWithTransport[] {
  return transports.map((transport, idx) => ({
    id: `adj-loc-${idx}`,
    name: `Adjacent ${idx}`,
    regionId: `region-${idx % 3}`,
    isHub: transport === "plane" && idx % 2 === 0,
    transport,
    isSameRegion: idx % 2 === 0,
  }));
}

function makeCards(cards: Array<{ consumed: boolean }>): ActionCardData[] {
  return cards.map((c, idx) => ({
    id: `card-${idx}`,
    type: idx % 2 === 0 ? "close-all-roads" : "extra-turn",
    consumed: c.consumed,
  }));
}

function makeMockTx() {
  return {
    roomPlayer: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    playerPosition: {
      update: vi.fn().mockResolvedValue({}),
    },
    blockade: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    gameEvent: {
      aggregate: vi.fn().mockResolvedValue({ _max: { sequenceNumber: 0 } }),
      create: vi.fn().mockResolvedValue({}),
    },
    pendingClue: {
      create: vi.fn().mockResolvedValue({}),
    },
    location: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

// --- Arbitraries ---

const arbTransportType: fc.Arbitrary<TransportType> = fc.constantFrom("car", "plane", "boat");

const arbBlockedTransports: fc.Arbitrary<Set<TransportType>> = fc
  .subarray(["car", "plane", "boat"] as TransportType[], { minLength: 1, maxLength: 3 })
  .map((arr) => new Set(arr));

const arbActionsRemaining: fc.Arbitrary<number> = fc.integer({ min: 1, max: 3 });

/**
 * Generates an adjacent location list that includes at least one edge of the given transport.
 */
function arbAdjacentWithTransport(
  transport: TransportType
): fc.Arbitrary<AdjacentLocationWithTransport[]> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 5 }), // number of other adjacencies
      fc.boolean() // isHub for the target edge
    )
    .map(([otherCount, isHub]) => {
      const targetEdge: AdjacentLocationWithTransport = {
        id: "target-loc",
        name: "Target",
        regionId: "region-target",
        isHub,
        transport,
        isSameRegion: false,
      };
      const others: AdjacentLocationWithTransport[] = Array.from(
        { length: otherCount },
        (_, i) => ({
          id: `other-loc-${i}`,
          name: `Other ${i}`,
          regionId: `region-${i}`,
          isHub: false,
          transport: (["car", "plane", "boat"] as TransportType[])[i % 3],
          isSameRegion: i % 2 === 0,
        })
      );
      return [targetEdge, ...others];
    });
}

describe("Property 25: Rejected Submissions Are Inert", () => {
  // **Validates: Requirements 2.3, 2.5, 2.6, 6.6, 22.3**

  describe("validateAction rejections — pure function guarantees no state mutation", () => {
    it("MOVE to non-adjacent location returns INVALID_MOVE with no input mutation", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }), // actionsRemaining
          fc.array(arbTransportType, { minLength: 1, maxLength: 5 }),
          (actionsRemaining, transports) => {
            const turnState = makeTurnState();
            const adjacentLocations = makeAdjacentLocations(transports);
            const playerCards = makeCards([{ consumed: false }]);
            const blockadeState: BlockadeState = { blockedTransports: new Set() };
            const playerPosition = "player-pos";

            // Deep copy inputs to verify no mutation
            const turnStateCopy = JSON.parse(JSON.stringify(turnState));
            const adjacentCopy = JSON.parse(JSON.stringify(adjacentLocations));
            const cardsCopy = JSON.parse(JSON.stringify(playerCards));

            const action: ActionPayload = {
              actionType: "MOVE",
              targetLocationId: "non-existent-location",
            };

            const result = validateAction(
              action,
              turnState,
              "player-1",
              playerPosition,
              adjacentLocations,
              playerCards,
              blockadeState,
              actionsRemaining
            );

            // Must return an error
            expect(result).not.toBeNull();
            expect(result!.success).toBe(false);
            expect(result!.code).toBe("INVALID_MOVE");

            // Inputs remain unchanged (pure function guarantee)
            expect(JSON.parse(JSON.stringify(turnState))).toEqual(turnStateCopy);
            expect(JSON.parse(JSON.stringify(adjacentLocations))).toEqual(adjacentCopy);
            expect(JSON.parse(JSON.stringify(playerCards))).toEqual(cardsCopy);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("MOVE on blocked transport returns appropriate BLOCKED error with no input mutation", () => {
      fc.assert(
        fc.property(
          arbTransportType,
          fc.integer({ min: 1, max: 3 }),
          (blockedTransport, actionsRemaining) => {
            const turnState = makeTurnState();
            const adjacentLocations: AdjacentLocationWithTransport[] = [
              {
                id: "target-loc",
                name: "Target",
                regionId: "region-1",
                isHub: true,
                transport: blockedTransport,
                isSameRegion: false,
              },
            ];
            const playerCards = makeCards([{ consumed: false }]);
            const blockadeState: BlockadeState = {
              blockedTransports: new Set([blockedTransport]),
            };
            const playerPosition = "player-pos";

            // Deep copy inputs
            const turnStateCopy = JSON.parse(JSON.stringify(turnState));
            const cardsCopy = JSON.parse(JSON.stringify(playerCards));

            const action: ActionPayload = {
              actionType: "MOVE",
              targetLocationId: "target-loc",
            };

            const result = validateAction(
              action,
              turnState,
              "player-1",
              playerPosition,
              adjacentLocations,
              playerCards,
              blockadeState,
              actionsRemaining
            );

            // Must return a blockade error
            expect(result).not.toBeNull();
            expect(result!.success).toBe(false);

            const expectedCodes: Record<TransportType, string> = {
              car: "ROADS_BLOCKED",
              plane: "AIRWAYS_BLOCKED",
              boat: "SEA_ROUTES_BLOCKED",
            };
            expect(result!.code).toBe(expectedCodes[blockedTransport]);

            // Inputs remain unchanged
            expect(JSON.parse(JSON.stringify(turnState))).toEqual(turnStateCopy);
            expect(JSON.parse(JSON.stringify(playerCards))).toEqual(cardsCopy);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("USE_CARD with consumed card returns INVALID_CARD with no input mutation", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 0, max: 4 }), // number of unconsumed cards
          (actionsRemaining, unconsumedCount) => {
            const turnState = makeTurnState();
            // Create a card set where the targeted card is consumed
            const playerCards: ActionCardData[] = [
              { id: "consumed-card", type: "close-all-roads", consumed: true },
              ...Array.from({ length: unconsumedCount }, (_, i) => ({
                id: `card-${i}`,
                type: "extra-turn",
                consumed: false,
              })),
            ];
            const blockadeState: BlockadeState = { blockedTransports: new Set() };
            const playerPosition = "player-pos";
            const adjacentLocations = makeAdjacentLocations(["car"]);

            // Deep copy
            const turnStateCopy = JSON.parse(JSON.stringify(turnState));
            const cardsCopy = JSON.parse(JSON.stringify(playerCards));

            const action: ActionPayload = {
              actionType: "USE_CARD",
              cardId: "consumed-card",
            };

            const result = validateAction(
              action,
              turnState,
              "player-1",
              playerPosition,
              adjacentLocations,
              playerCards,
              blockadeState,
              actionsRemaining
            );

            expect(result).not.toBeNull();
            expect(result!.success).toBe(false);
            expect(result!.code).toBe("INVALID_CARD");

            // Inputs remain unchanged
            expect(JSON.parse(JSON.stringify(turnState))).toEqual(turnStateCopy);
            expect(JSON.parse(JSON.stringify(playerCards))).toEqual(cardsCopy);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("USE_CARD with non-existent card returns INVALID_CARD with no input mutation", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          fc.uuid(),
          (actionsRemaining, randomCardId) => {
            const turnState = makeTurnState();
            const playerCards: ActionCardData[] = [
              { id: "real-card", type: "close-all-roads", consumed: false },
            ];
            const blockadeState: BlockadeState = { blockedTransports: new Set() };
            const playerPosition = "player-pos";
            const adjacentLocations = makeAdjacentLocations(["car"]);

            // Ensure randomCardId doesn't match the real card
            fc.pre(randomCardId !== "real-card");

            const turnStateCopy = JSON.parse(JSON.stringify(turnState));
            const cardsCopy = JSON.parse(JSON.stringify(playerCards));

            const action: ActionPayload = {
              actionType: "USE_CARD",
              cardId: randomCardId,
            };

            const result = validateAction(
              action,
              turnState,
              "player-1",
              playerPosition,
              adjacentLocations,
              playerCards,
              blockadeState,
              actionsRemaining
            );

            expect(result).not.toBeNull();
            expect(result!.success).toBe(false);
            expect(result!.code).toBe("INVALID_CARD");

            // Inputs remain unchanged
            expect(JSON.parse(JSON.stringify(turnState))).toEqual(turnStateCopy);
            expect(JSON.parse(JSON.stringify(playerCards))).toEqual(cardsCopy);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("dispatchCard rejections — handler never invoked on invalid dispatch", () => {
    it("UNKNOWN_CARD_TYPE for legacy/unknown types: no handler invocation, no tx writes", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...LEGACY_CARD_TYPES, "totally-fake", "xyz-card", ""),
          fc.uuid(), // playerId
          fc.uuid(), // roomId
          async (cardType, playerId, roomId) => {
            const tx = makeMockTx();

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              undefined,
              "loc-1",
              1,
              0,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("UNKNOWN_CARD_TYPE");
            }

            // No database operations should have been performed
            expect(tx.blockade.create).not.toHaveBeenCalled();
            expect(tx.playerPosition.update).not.toHaveBeenCalled();
            expect(tx.gameEvent.create).not.toHaveBeenCalled();
            expect(tx.pendingClue.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("INVALID_CARD_TARGET for player-targeted card with missing target: no handler invocation", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // playerId
          fc.uuid(), // roomId
          async (playerId, roomId) => {
            const tx = makeMockTx();

            // lose-an-action requires a target
            const result = await dispatchCard(
              "lose-an-action",
              playerId,
              roomId,
              undefined, // missing target
              "loc-1",
              1,
              0,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }

            // Handler was never invoked — no tx writes
            expect(tx.playerPosition.update).not.toHaveBeenCalled();
            expect(tx.gameEvent.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("INVALID_CARD_TARGET for player-targeted card with self-target: no handler invocation", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // playerId
          fc.uuid(), // roomId
          async (playerId, roomId) => {
            const tx = makeMockTx();

            const result = await dispatchCard(
              "lose-an-action",
              playerId,
              roomId,
              playerId, // self-target
              "loc-1",
              1,
              0,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }

            // No handler calls
            expect(tx.playerPosition.update).not.toHaveBeenCalled();
            expect(tx.gameEvent.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("INVALID_CARD_TARGET for non-targeted card with extraneous target: no handler invocation", async () => {
      const nonTargetedCards = [
        "close-all-roads",
        "close-all-airways",
        "close-all-sea-routes",
        "locate-the-mastermind",
        "bug-a-phone",
        "reveal-direction",
        "drop-ship",
        "extra-turn",
        "open-all-roads",
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...nonTargetedCards),
          fc.uuid(), // playerId
          fc.uuid(), // roomId
          fc.uuid(), // extraneous targetPlayerId
          async (cardType, playerId, roomId, targetPlayerId) => {
            // Ensure target differs from player so it's not caught by self-target check
            fc.pre(targetPlayerId !== playerId);

            const tx = makeMockTx();

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              targetPlayerId, // extraneous target for a "none" card
              "loc-1",
              1,
              0,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }

            // No handler side effects
            expect(tx.blockade.create).not.toHaveBeenCalled();
            expect(tx.playerPosition.update).not.toHaveBeenCalled();
            expect(tx.gameEvent.create).not.toHaveBeenCalled();
            expect(tx.pendingClue.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("INVALID_CARD_TARGET for non-member target: no handler invocation", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // playerId
          fc.uuid(), // roomId
          fc.uuid(), // targetPlayerId (not in room)
          async (playerId, roomId, targetPlayerId) => {
            fc.pre(targetPlayerId !== playerId);

            // tx.roomPlayer.findUnique returns null → target not a member
            const tx = makeMockTx();

            const result = await dispatchCard(
              "lose-an-action",
              playerId,
              roomId,
              targetPlayerId,
              "loc-1",
              1,
              0,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }

            // Membership check was called but handler was not invoked
            expect(tx.roomPlayer.findUnique).toHaveBeenCalled();
            expect(tx.playerPosition.update).not.toHaveBeenCalled();
            expect(tx.gameEvent.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
