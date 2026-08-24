import type {
  ActionPayload,
  TurnState,
  TurnActionError,
  TurnActionErrorCode,
  BlockadeState,
  ActionCardData,
} from "@/lib/turn-engine/types";
import type { TransportType } from "@/lib/map/types";
import type { AdjacentLocationWithTransport } from "@/lib/map/adjacency";

/**
 * Validates a player action against the current turn state and game rules.
 * Pure synchronous function — no database calls.
 *
 * @returns null if the action is valid, or a TurnActionError with the appropriate code.
 */
export function validateAction(
  action: ActionPayload,
  turnState: TurnState,
  playerId: string,
  playerPosition: string,
  adjacentLocations: AdjacentLocationWithTransport[],
  playerCards: ActionCardData[],
  blockadeState: BlockadeState,
  actionsRemaining: number
): TurnActionError | null {
  // Check it's the player's turn
  if (turnState.currentPlayerId !== playerId) {
    return {
      success: false,
      error: "It is not your turn",
      code: "NOT_YOUR_TURN",
    };
  }

  // Check actions remaining
  if (actionsRemaining <= 0) {
    return {
      success: false,
      error: "No actions remaining",
      code: "NO_ACTIONS_REMAINING",
    };
  }

  switch (action.actionType) {
    case "MOVE":
      return validateMove(action.targetLocationId, playerPosition, adjacentLocations, blockadeState);

    case "SKIP":
      return null;

    case "CAPTURE_ATTEMPT":
      return validateCaptureAttempt(turnState);

    case "USE_CARD":
      return validateUseCard(action.cardId, playerCards);

    default:
      return {
        success: false,
        error: "Unknown action type",
        code: "UNKNOWN_ACTION_TYPE",
      };
  }
}

function validateMove(
  targetLocationId: string,
  playerPosition: string,
  adjacentLocations: AdjacentLocationWithTransport[],
  blockadeState: BlockadeState
): TurnActionError | null {
  // 1. Adjacency check
  const edge = adjacentLocations.find((loc) => loc.id === targetLocationId);

  if (!edge) {
    return {
      success: false,
      error: "Target location is not adjacent to your current location",
      code: "INVALID_MOVE",
    };
  }

  // 2. Blockade check — AFTER adjacency, BEFORE same-location/hub rules
  if (blockadeState.blockedTransports.has(edge.transport)) {
    const errorMap: Record<TransportType, { code: TurnActionErrorCode; msg: string }> = {
      car: { code: "ROADS_BLOCKED", msg: "Roads are currently blocked" },
      plane: { code: "AIRWAYS_BLOCKED", msg: "Airways are currently blocked" },
      boat: { code: "SEA_ROUTES_BLOCKED", msg: "Sea routes are currently blocked" },
    };
    const err = errorMap[edge.transport];
    return { success: false, error: err.msg, code: err.code };
  }

  // 3. Same-location rejection
  if (targetLocationId === playerPosition) {
    return {
      success: false,
      error: "Cannot move to the same location you are already at",
      code: "SAME_LOCATION_MOVE",
    };
  }

  // 4. Plane hub rule — REMOVED: any plane edge in adjacency is valid

  return null;
}

function validateCaptureAttempt(turnState: TurnState): TurnActionError | null {
  if (turnState.captureAttemptFlag) {
    return {
      success: false,
      error: "Only one capture attempt is allowed per turn",
      code: "DUPLICATE_CAPTURE_ATTEMPT",
    };
  }

  return null;
}

function validateUseCard(
  cardId: string,
  playerCards: ActionCardData[]
): TurnActionError | null {
  const card = playerCards.find((c) => c.id === cardId);

  if (!card || card.consumed) {
    return {
      success: false,
      error: "You do not hold this card or it has already been consumed",
      code: "INVALID_CARD",
    };
  }

  return null;
}
