import { prisma } from "@/lib/prisma";
import { generateRoomCode } from "@/lib/lobby/room-code";
import { CreateRoomResult, LobbyError } from "@/lib/lobby/types";

export async function createRoom(params: {
  playerId: string;
  displayName: string;
  visibility: "public" | "private";
}): Promise<CreateRoomResult | LobbyError> {
  const { playerId, displayName, visibility } = params;

  // Validate display name: trim and check length
  const trimmedName = displayName.trim();
  if (trimmedName.length === 0 || trimmedName.length > 30) {
    return {
      success: false,
      error: "Display name must be 1-30 characters",
      code: "INVALID_INPUT",
    };
  }

  // Check single-room constraint: player must not already be in a room
  const existingMembership = await prisma.roomPlayer.findUnique({
    where: { playerId },
  });
  if (existingMembership) {
    return {
      success: false,
      error: "Must leave current room first",
      code: "MUST_LEAVE_CURRENT_ROOM",
    };
  }

  // Generate a unique room code
  const code = await generateRoomCode();

  // Create room and player in a transaction
  const { room, player } = await prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: {
        code,
        status: "waiting",
        visibility,
        playerCount: 1,
      },
    });

    const player = await tx.roomPlayer.create({
      data: {
        playerId,
        displayName: trimmedName,
        roomId: room.id,
        isHost: true,
        readyState: "not-ready",
        status: "connected",
      },
    });

    return { room, player };
  });

  return {
    success: true,
    roomCode: code,
    state: {
      roomCode: code,
      roomId: room.id,
      status: "waiting",
      visibility,
      hostId: playerId,
      players: [
        {
          id: player.id,
          displayName: trimmedName,
          isHost: true,
          readyState: "not-ready",
          status: "connected",
          turnPosition: null,
        },
      ],
    },
  };
}
