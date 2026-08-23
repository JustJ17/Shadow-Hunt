import { prisma } from "@/lib/prisma";
import { PollStateResult, LobbyError, LobbyPlayer } from "@/lib/lobby/types";
import { processDisconnections } from "@/lib/lobby/disconnection";

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
    data: { lastActivityAt: new Date(), status: "connected", disconnectedAt: null },
  });

  // Detect and handle disconnected players in the room
  await processDisconnections(membership.room.id);

  // Re-fetch room state after disconnection processing for accurate response
  const updatedMembership = await prisma.roomPlayer.findUnique({
    where: { playerId },
    include: { room: { include: { players: true } } },
  });

  if (!updatedMembership) {
    return {
      success: false,
      error: "Player is not in any room",
      code: "NOT_IN_ROOM",
    };
  }

  const room = updatedMembership.room;

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
      roomId: room.id,
      status: room.status as "waiting" | "in-progress" | "abandoned",
      visibility: room.visibility as "public" | "private",
      players,
      hostId: host!.playerId,
    },
  };
}
