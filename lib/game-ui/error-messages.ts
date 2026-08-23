import type { TurnActionErrorCode } from "@/lib/turn-engine/types";

const ERROR_MESSAGES: Record<TurnActionErrorCode | "UNKNOWN", string> = {
  NOT_IN_ROOM: "You are not a participant in this game.",
  GAME_NOT_ACTIVE: "This game is no longer active.",
  NOT_YOUR_TURN: "It is not your turn yet.",
  NO_ACTIONS_REMAINING: "You have no actions remaining this turn.",
  INVALID_MOVE: "That is not a valid move destination.",
  INVALID_TRANSPORT: "No transport route connects you to that location.",
  SAME_LOCATION_MOVE: "You are already at that location.",
  ROADS_BLOCKED: "All road routes are currently blocked by a blockade.",
  AIRWAYS_BLOCKED: "All air routes are currently blocked by a blockade.",
  SEA_ROUTES_BLOCKED: "All sea routes are currently blocked by a blockade.",
  DUPLICATE_CAPTURE_ATTEMPT: "You have already made a capture attempt this turn.",
  INVALID_CARD: "That card is not available in your hand.",
  UNKNOWN_CARD_TYPE: "Card type not recognized.",
  INVALID_CARD_TARGET: "Invalid target player for that card.",
  CONCURRENCY_CONFLICT:
    "Another action was processed simultaneously. The board has been refreshed.",
  UNKNOWN_ACTION_TYPE: "Unrecognized action type.",
  UNKNOWN: "Something went wrong. Please check your connection and try again.",
};

export function errorMessageFor(
  code: TurnActionErrorCode | "UNKNOWN"
): string {
  return ERROR_MESSAGES[code];
}
