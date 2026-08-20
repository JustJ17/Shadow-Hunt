import { LobbyErrorCode } from "@/lib/lobby/types";

/**
 * Maps a LobbyErrorCode to a user-friendly error message.
 * Use this when only the error code is available (e.g. client-side error handling
 * where the API response message isn't accessible).
 */
export function getErrorMessage(code: LobbyErrorCode): string {
  const messages: Record<LobbyErrorCode, string> = {
    ROOM_NOT_FOUND: "Room not found — check the code and try again",
    ROOM_FULL: "This room is full (max 4 players)",
    GAME_ALREADY_STARTED: "The game has already started",
    ALREADY_IN_ROOM: "You're already in this room",
    MUST_LEAVE_CURRENT_ROOM: "Leave your current room first",
    INSUFFICIENT_PLAYERS: "Need at least 2 players to start",
    PLAYERS_NOT_READY: "Not all players are ready",
    NOT_HOST: "Only the host can do that",
    NOT_IN_ROOM: "You're not in a room",
    CANNOT_LEAVE_ACTIVE_GAME: "Can't leave while a game is in progress",
    INVALID_INPUT: "Invalid input — please check your entries",
  };
  return messages[code] || "Something went wrong";
}
