import { prisma } from "@/lib/prisma";
import { ToggleReadyResult, LobbyError, ReadyState } from "@/lib/lobby/types";

export async function toggleReady(params: {
  playerId: string;
}): Promise<ToggleReadyResult | LobbyError> {
  const { playerId } = params;

  // Find player's current membership with room
  const membership = await prisma.roomPlayer.findUnique({
    where: { playerId },
    include: { room: true },
  });

  if (!membership) {
    return {
      success: false,
      error: "Not in a room",
      code: "NOT_IN_ROOM",
    };
  }

  // Check room status: must be "waiting"
  if (membership.room.status !== "waiting") {
    return {
      success: false,
      error: "Game has already started",
      code: "GAME_ALREADY_STARTED",
    };
  }

  // Toggle ready state
  const newState: ReadyState =
    membership.readyState === "ready" ? "not-ready" : "ready";

  // Update the player's readyState
  await prisma.roomPlayer.update({
    where: { playerId },
    data: { readyState: newState },
  });

  return {
    success: true,
    newReadyState: newState,
  };
}
