import { prisma } from "@/lib/prisma";
import { generateRoomCode } from "@/lib/lobby/room-code";
import type {
  CreateRoomResult,
  LobbyError,
  RoomVisibility,
} from "@/lib/lobby/types";

export async function createRoom(params: {
  playerId: string;
  displayName: string;
  visibility: RoomVisibility;
}): Promise<CreateRoomResult | LobbyError> {
  const { playerId, visibility } = params;
  const displayName = params.displayName.trim();

  // Validate display name: 1-30 chars, not whitespace-only
  if (displayName.length === 0 || displayName.length > 30) {
    return {
      success: false,
      error: "Display name must be between 1 and 30 characters.",
      code: "INVALID_INPUT",
    };
  }

  // Check single-room constraint
  const existingMembership = await prisma.roomPlayer.findUnique({
    where: { playerId },
  });

  if (existingMembership) {
    return {
      success: false,
      error: "You must leave your current room before creating a new one.",
      code: "MUST_LEAVE_CURRENT_ROOM",
    };
  }

  // Generate a unique room code
  const code = await generateRoomCode();

  // Create room and player in a transaction
  const room = await prisma.$transaction(async (tx) => {
    const newRoom = await tx.room.create({
      data: {
        code,
        status: "waiting",
        visibility,
        playerCount: 1,
      },
    });

    await tx.roomPlayer.create({
      data: {
        playerId,
        displayName,
        roomId: newRoom.id,
        isHost: true,
        readyState: "not-ready",
        status: "connected",
      },
    });

    return newRoom;
  });

  return {
    success: true,
    roomCode: room.code,
    state: {
      roomCode: room.code,
      status: "waiting",
      visibility,
      players: [
        {
          id: playerId,
          displayName,
          isHost: true,
          readyState: "not-ready",
          status: "connected",
          turnPosition: null,
        },
      ],
      hostId: playerId,
    },
  };
}
