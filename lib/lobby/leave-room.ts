import { prisma } from "@/lib/prisma";
import { LeaveRoomResult, LobbyError } from "@/lib/lobby/types";

export async function leaveRoom(params: {
  playerId: string;
}): Promise<LeaveRoomResult | LobbyError> {
  const { playerId } = params;

  // Find the player's current room membership
  const membership = await prisma.roomPlayer.findUnique({
    where: { playerId },
    include: {
      room: {
        include: { players: true },
      },
    },
  });

  if (!membership) {
    return {
      success: false,
      error: "Not in a room",
      code: "NOT_IN_ROOM",
    };
  }

  const { room } = membership;

  // Cannot leave a room that is in-progress
  if (room.status === "in-progress") {
    return {
      success: false,
      error: "Cannot leave during an active game",
      code: "CANNOT_LEAVE_ACTIVE_GAME",
    };
  }

  const otherPlayers = room.players.filter((p: { playerId: string }) => p.playerId !== playerId);

  // Case: Host leaving
  if (membership.isHost) {
    // No other players remain — delete the room
    if (otherPlayers.length === 0) {
      await prisma.room.delete({
        where: { id: room.id },
      });

      return {
        success: true,
        roomDeleted: true,
      };
    }

    // Other players remain — transfer host to the earliest joiner
    const earliestJoiner = otherPlayers.reduce((earliest: { joinedAt: Date; id: string }, player: { joinedAt: Date; id: string }) =>
      player.joinedAt < earliest.joinedAt ? player : earliest
    );

    await prisma.$transaction(async (tx: typeof prisma) => {
      // Remove the leaving host
      await tx.roomPlayer.delete({
        where: { id: membership.id },
      });

      // Set new host and reset their readyState
      await tx.roomPlayer.update({
        where: { id: earliestJoiner.id },
        data: {
          isHost: true,
          readyState: "not-ready",
        },
      });

      // Decrement player count
      await tx.room.update({
        where: { id: room.id },
        data: { playerCount: { decrement: 1 } },
      });

      // Reset all remaining players' readiness to "not-ready"
      await tx.roomPlayer.updateMany({
        where: {
          roomId: room.id,
          playerId: { not: playerId },
        },
        data: { readyState: "not-ready" },
      });
    });

    return {
      success: true,
      roomDeleted: false,
    };
  }

  // Case: Non-host leaving
  await prisma.$transaction(async (tx: typeof prisma) => {
    // Remove the player
    await tx.roomPlayer.delete({
      where: { id: membership.id },
    });

    // Decrement player count
    await tx.room.update({
      where: { id: room.id },
      data: { playerCount: { decrement: 1 } },
    });

    // Reset all remaining players' readiness to "not-ready"
    await tx.roomPlayer.updateMany({
      where: {
        roomId: room.id,
        playerId: { not: playerId },
      },
      data: { readyState: "not-ready" },
    });
  });

  return {
    success: true,
    roomDeleted: false,
  };
}
