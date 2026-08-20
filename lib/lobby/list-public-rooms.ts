import { prisma } from "@/lib/prisma";
import { PublicRoomListResult } from "@/lib/lobby/types";

export async function listPublicRooms(): Promise<PublicRoomListResult> {
  const rooms = await prisma.room.findMany({
    where: {
      visibility: "public",
      status: "waiting",
      playerCount: { lt: 4 },
    },
    include: {
      players: {
        where: { isHost: true },
        select: { displayName: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    rooms: rooms.map((room: { code: string; playerCount: number; players: { displayName: string }[] }) => ({
      roomCode: room.code,
      hostName: room.players[0]?.displayName ?? "Unknown",
      playerCount: room.playerCount,
    })),
  };
}
