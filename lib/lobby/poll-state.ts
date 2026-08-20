import { prisma } from "@/lib/prisma";
import { PollStateResult, LobbyError, LobbyPlayer } from "@/lib/lobby/types";

export async function pollState(params: {
  playerId: string;
}): Promise<PollStateResult | LobbyError> {
  const { playerId } = params;

  // Find the player's membership with room and all players
  const membership = await prisma.roomPlayer.findUnique({
    where: { playerId },
    include: { room: { include: { players: true } } },
  });

  if (!membership) {
    return {
      success: false,
      error: "Player is not in any room",
      code: "NOT_IN_ROOM",
    };
  }

  // Update lastActivityAt and set status to "connected" (handles reconnection)
  await prisma.roomPlayer.update({
    where: { playerId },
    data: { lastActivityAt: new Date(), status: "connected" },
  });

  const room = membership.room;

  // Find host
  const host = room.players.find((p) => p.isHost);

  const players: LobbyPlayer[] = room.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    isHost: p.isHost,
    readyState: p.readyState as "ready" | "not-ready",
    status: p.status as "connected" | "disconnected",
    turnPosition: p.turnPosition,
  }));

  return {
    success: true,
    state: {
      roomCode: room.code,
      status: room.status as "waiting" | "in-progress" | "abandoned",
      visibility: room.visibility as "public" | "private",
      players,
      hostId: host!.playerId,
    },
  };
}
