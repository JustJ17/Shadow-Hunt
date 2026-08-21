import { getErrorMessage } from "@/lib/lobby/error-messages";
import { LobbyErrorCode } from "@/lib/lobby/types";

describe("getErrorMessage", () => {
  const allCodes: LobbyErrorCode[] = [
    "ROOM_NOT_FOUND",
    "ROOM_FULL",
    "GAME_ALREADY_STARTED",
    "ALREADY_IN_ROOM",
    "MUST_LEAVE_CURRENT_ROOM",
    "INSUFFICIENT_PLAYERS",
    "PLAYERS_NOT_READY",
    "NOT_HOST",
    "NOT_IN_ROOM",
    "CANNOT_LEAVE_ACTIVE_GAME",
    "INVALID_INPUT",
  ];

  it("returns a non-empty string for every LobbyErrorCode", () => {
    for (const code of allCodes) {
      const message = getErrorMessage(code);
      expect(message).toBeTruthy();
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("returns unique messages for each error code", () => {
    const messages = allCodes.map(code => getErrorMessage(code));
    const uniqueMessages = new Set(messages);
    expect(uniqueMessages.size).toBe(allCodes.length);
  });

  it("returns specific expected messages", () => {
    expect(getErrorMessage("ROOM_NOT_FOUND")).toBe("Room not found — check the code and try again");
    expect(getErrorMessage("ROOM_FULL")).toBe("This room is full (max 4 players)");
    expect(getErrorMessage("NOT_HOST")).toBe("Only the host can do that");
    expect(getErrorMessage("CANNOT_LEAVE_ACTIVE_GAME")).toBe("Can't leave while a game is in progress");
  });

  it("returns a fallback message for unknown codes", () => {
    const message = getErrorMessage("UNKNOWN_CODE" as LobbyErrorCode);
    expect(message).toBe("Something went wrong");
  });
});
