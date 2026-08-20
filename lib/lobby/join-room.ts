import { prisma } from "@/lib/prisma";
import { JoinRoomResult, LobbyError, LobbyPlayer } from "@/lib/lobby/types";

export async function joinRoom(params: {
  playerId: string;
  displayName: string;
  roomCode: string;
}): Promise<JoinRoomResult | LobbyError> {
  const { playerId, displayName, roomCode } = params;

  // Validate display name: trim and check length
  const trimmedName = displayName.trim();
  if (trimmedName.length === 0 || trimmedName.length > 30) {
    return {
      success: false,
      error: "Display name must be 1-30 characters",
      code: "INVALID_INPUT",
    };
  }

  // Normalize room code to uppercase
  const normalizedCode = roomCode.toUpperCase();

  // Find room by code, include players
  const room = await prisma.room.findUnique({
    where: { code: normalizedCode },
    include: { players: true },
  });

  if (!room) {
    return {
      success: false,
      error: "Room not found",
      code: "ROOM_NOT_FOUND",
    };
  }

  if (room.status !== "waiting") {
    return {
      success: false,
      error: "Game has already started",
      code: "GAME_ALREADY_STARTED",
    };
  }

  if (room.playerCount >= 4) {
    return {
      success: false,
      error: "Room is full",
      code: "ROOM_FULL",
    };
  }

  // Check if player is already in any room
  const existingMembership = await prisma.roomPlayer.findUnique({
    where: { playerId },
  });

  if (existingMembership) {
    if (existingMembership.roomId === room.id) {
      return {
        success: false,
        error: "Already in this room",
        code: "ALREADY_IN_ROOM",
      };
    }
    return {
      success: false,
      error: "Must leave current room first",
      code: "MUST_LEAVE_CURRENT_ROOM",
    };
  }

  // In a transaction: add player, increment playerCount, reset existing players' readiness
  const updatedRoom = await prisma.$transaction(async (tx: typeof prisma) => {
    // Create new player
    await tx.roomPlayer.create({
      data: {
        playerId,
        displayName: trimmedName,
        roomId: room.id,
        isHost: false,
        readyState: "not-ready",
        status: "connected",
      },
    });

    // Increment player count
    await tx.room.update({
      where: { id: room.id },
      data: { playerCount: { increment: 1 } },
    });

    // Reset all existing players' readiness to "not-ready"
    await tx.roomPlayer.updateMany({
      where: {
        roomId: room.id,
        playerId: { not: playerId },
      },
      data: { readyState: "not-ready" },
    });

    // Fetch updated room state
    return tx.room.findUnique({
      where: { id: room.id },
      include: { players: true },
    });
  });

  if (!updatedRoom) {
    return {
      success: false,
      error: "Room not found",
      code: "ROOM_NOT_FOUND",
    };
  }

  // Find host
  const host = updatedRoom.players.find((p: { isHost: boolean }) => p.isHost);

  const players: LobbyPlayer[] = updatedRoom.players.map((p: { id: string; displayName: string; isHost: boolean; readyState: string; status: string; turnPosition: number | null; playerId: string }) => ({
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
      roomCode: updatedRoom.code,
      status: updatedRoom.status as "waiting" | "in-progress" | "abandoned",
      visibility: updatedRoom.visibility as "public" | "private",
      players,
      hostId: host!.playerId,
    },
  };
}
