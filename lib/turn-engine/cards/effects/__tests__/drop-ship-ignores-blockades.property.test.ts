// Feature: action-cards
// Property 10: Drop Ship Ignores Blockades
// **Validates: Requirements 6.8**

import fc from "fast-check";
import { validateAction } from "@/lib/turn-engine/validate-action";
import type {
  TurnState,
  BlockadeState,
  ActionCardData,
  UseCardPayload,
  MoveActionPayload,
} from "@/lib/turn-engine/types";
import type { TransportType } from "@/lib/map/types";
import type { AdjacentLocationWithTransport } from "@/lib/map/adjacency";

const TRANSPORT_TYPES: TransportType[] = ["car", "plane", "boat"];

/**
 * Generates all possible combinations of blocked transport types,
 * including the empty set (no blockades) and the full set (all three blocked).
 */
const arbBlockadeState: fc.Arbitrary<BlockadeState> = fc
  .subarray(TRANSPORT_TYPES, { minLength: 0, maxLength: 3 })
  .map((transports) => ({
    blockedTransports: new Set(transports),
  }));

/**
 * Generates a valid TurnState where it's the specified player's turn.
 */
function arbTurnState(playerId: string): fc.Arbitrary<TurnState> {
  return fc.record({
    id: fc.uuid(),
    roomId: fc.uuid(),
    currentPlayerId: fc.constant(playerId),
    currentRound: fc.integer({ min: 1, max: 50 }),
    actionsRemaining: fc.integer({ min: 1, max: 2 }),
    actionBudget: fc.integer({ min: 1, max: 2 }),
    captureAttemptFlag: fc.boolean(),
    isExtraTurn: fc.boolean(),
    version: fc.integer({ min: 1, max: 100 }),
  });
}

describe("Drop Ship Ignores Blockades — Property 10", () => {
  /**
   * **Validates: Requirements 6.8**
   *
   * For any Active_Blockade state (including all three transport types blocked),
   * playing `drop-ship` via USE_CARD action is successfully validated.
   * Blockade evaluation applies only to MOVE actions, not to USE_CARD actions.
   *
   * This verifies that the Move_Validator's blockade check does NOT affect
   * the USE_CARD validation path. The validateAction function for USE_CARD
   * only checks card ownership — blockadeState is irrelevant.
   */
  it("USE_CARD validation passes regardless of blockade state", () => {
    fc.assert(
      fc.property(
        fc.uuid(), // playerId
        fc.uuid(), // cardId
        arbBlockadeState,
        (playerId, cardId, blockadeState) => {
          const turnState: TurnState = {
            id: "turn-1",
            roomId: "room-1",
            currentPlayerId: playerId,
            currentRound: 1,
            actionsRemaining: 2,
            actionBudget: 2,
            captureAttemptFlag: false,
            isExtraTurn: false,
            version: 1,
          };

          const playerCards: ActionCardData[] = [
            { id: cardId, type: "drop-ship", consumed: false },
          ];

          const action: UseCardPayload = {
            actionType: "USE_CARD",
            cardId,
          };

          // validateAction should return null (valid) for USE_CARD with a valid card,
          // regardless of what transports are blocked
          const result = validateAction(
            action,
            turnState,
            playerId,
            "some-location", // playerPosition — irrelevant for USE_CARD
            [], // adjacentLocations — irrelevant for USE_CARD
            playerCards,
            blockadeState,
            2 // actionsRemaining
          );

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Strengthened variant: even when ALL three transport types are blocked,
   * USE_CARD for drop-ship passes validation.
   */
  it("USE_CARD validation passes even when all transports are blocked", () => {
    fc.assert(
      fc.property(
        fc.uuid(), // playerId
        fc.uuid(), // cardId
        fc.integer({ min: 1, max: 50 }), // round
        fc.integer({ min: 1, max: 2 }), // actionsRemaining
        (playerId, cardId, round, actionsRemaining) => {
          const allBlockedState: BlockadeState = {
            blockedTransports: new Set<TransportType>(["car", "plane", "boat"]),
          };

          const turnState: TurnState = {
            id: "turn-1",
            roomId: "room-1",
            currentPlayerId: playerId,
            currentRound: round,
            actionsRemaining,
            actionBudget: 2,
            captureAttemptFlag: false,
            isExtraTurn: false,
            version: 1,
          };

          const playerCards: ActionCardData[] = [
            { id: cardId, type: "drop-ship", consumed: false },
          ];

          const action: UseCardPayload = {
            actionType: "USE_CARD",
            cardId,
          };

          const result = validateAction(
            action,
            turnState,
            playerId,
            "any-location",
            [],
            playerCards,
            allBlockedState,
            actionsRemaining
          );

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Contrast test: MOVE actions ARE blocked by the same blockade states.
   * This proves that blockade enforcement is specific to MOVE, not a universal bypass.
   */
  it("MOVE actions are blocked by active blockades (contrast)", () => {
    fc.assert(
      fc.property(
        fc.uuid(), // playerId
        fc.uuid(), // targetLocationId
        fc.constantFrom(...TRANSPORT_TYPES), // transport type of the edge
        (playerId, targetLocationId, transport) => {
          const blockadeState: BlockadeState = {
            blockedTransports: new Set<TransportType>([transport]),
          };

          const turnState: TurnState = {
            id: "turn-1",
            roomId: "room-1",
            currentPlayerId: playerId,
            currentRound: 1,
            actionsRemaining: 2,
            actionBudget: 2,
            captureAttemptFlag: false,
            isExtraTurn: false,
            version: 1,
          };

          // Create an adjacent location with the blocked transport type
          const adjacentLocations: AdjacentLocationWithTransport[] = [
            {
              id: targetLocationId,
              name: "Test Location",
              regionId: "region-1",
              isHub: true,
              transport,
              isSameRegion: false,
            },
          ];

          // Ensure we're not moving to the same location
          fc.pre(targetLocationId !== "current-location");

          const action: MoveActionPayload = {
            actionType: "MOVE",
            targetLocationId,
          };

          const result = validateAction(
            action,
            turnState,
            playerId,
            "current-location",
            adjacentLocations,
            [],
            blockadeState,
            2
          );

          // MOVE should be REJECTED due to blockade
          expect(result).not.toBeNull();
          expect(result!.success).toBe(false);

          const expectedCodes: Record<TransportType, string> = {
            car: "ROADS_BLOCKED",
            plane: "AIRWAYS_BLOCKED",
            boat: "SEA_ROUTES_BLOCKED",
          };
          expect(result!.code).toBe(expectedCodes[transport]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
