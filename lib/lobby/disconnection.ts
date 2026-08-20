import { prisma } from "@/lib/prisma";

const DISCONNECT_THRESHOLD_MS = 10_000; // 10 seconds
const FORFEIT_THRESHOLD_MS = 5 * 60_000; // 5 minutes

/**
 * Detects and marks disconnected players in a room.
 * Called during poll to handle disconnection detection piggybacked on polling.
 *
 * - Marks players as "disconnected" if their lastActivityAt is older than 10s
 * - For "waiting" rooms: triggers host transfer if host disconnected
 * - For "in-progress" rooms: forfeits players disconnected > 5 minutes
 */
export async function processDisconnections(roomId: string): Promise<void> {
  const now = new Date();
  const disconnectThreshold = new Date(now.getTime() - DISCONNECT_THRESHOLD_MS);

  // Find players who haven't polled recently and are still marked as connected
  const stalePlayers = await prisma.roomPlayer.findMany({
    where: {
      roomId,
      status: "connected",
      lastActivityAt: { lt: disconnectThreshold },
    },
  });

  if (stalePlayers.length === 0) return;

  // Mark stale players as disconnected
  await prisma.roomPlayer.updateMany({
    where: {
      id: { in: stalePlayers.map((p) => p.id) },
    },
    data: {
      status: "disconnected",
      disconnectedAt: now,
    },
  });

  // Re-fetch room state after marking disconnections
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true },
  });

  if (!room) return;

  // For rooms in "waiting" status: transfer host if host was disconnected
  if (room.status === "waiting") {
    const host = room.players.find((p) => p.isHost);
    if (host && host.status === "disconnected") {
      // Find the earliest-joined connected player to become the new host
      const connectedPlayers = room.players
        .filter((p) => p.status === "connected" && !p.isHost)
        .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

      if (connectedPlayers.length > 0) {
        const newHost = connectedPlayers[0];
        await prisma.$transaction([
          prisma.roomPlayer.update({
            where: { id: host.id },
            data: { isHost: false },
          }),
          prisma.roomPlayer.update({
            where: { id: newHost.id },
            data: { isHost: true, readyState: "not-ready" },
          }),
        ]);
      } else {
        // No connected players remain in waiting room - delete the room
        await prisma.room.delete({ where: { id: roomId } });
      }
    }
  }

  // Forfeit logic: remove players disconnected > 5 minutes in active games
  if (room.status === "in-progress") {
    const forfeitThreshold = new Date(now.getTime() - FORFEIT_THRESHOLD_MS);

    const forfeitPlayers = room.players.filter(
      (p) =>
        p.status === "disconnected" &&
        p.disconnectedAt &&
        p.disconnectedAt <= forfeitThreshold
    );

    for (const player of forfeitPlayers) {
      await prisma.$transaction([
        prisma.roomPlayer.delete({ where: { id: player.id } }),
        prisma.room.update({
          where: { id: roomId },
          data: { playerCount: { decrement: 1 } },
        }),
      ]);
    }
  }
}

const ABANDON_THRESHOLD_MS = 60_000; // 60 seconds

/**
 * Checks for rooms in "in-progress" where ALL players are disconnected
 * and the earliest disconnectedAt is older than 60s. Sets room status to "abandoned".
 */
export async function checkAbandonedRooms(): Promise<void> {
  const now = new Date();
  const abandonThreshold = new Date(now.getTime() - ABANDON_THRESHOLD_MS);

  // Find rooms in "in-progress" where ALL players are disconnected
  const inProgressRooms = await prisma.room.findMany({
    where: { status: "in-progress" },
    include: { players: true },
  });

  for (const room of inProgressRooms) {
    // Check if ALL players are disconnected
    const allDisconnected = room.players.every(
      (p) => p.status === "disconnected"
    );
    if (!allDisconnected) continue;

    // Check if the earliest disconnectedAt is older than the threshold
    const disconnectedAts = room.players
      .map((p) => p.disconnectedAt)
      .filter((d): d is Date => d !== null);

    if (disconnectedAts.length === 0) continue;

    const earliestDisconnect = new Date(
      Math.min(...disconnectedAts.map((d) => d.getTime()))
    );
    if (earliestDisconnect <= abandonThreshold) {
      await prisma.room.update({
        where: { id: room.id },
        data: { status: "abandoned" },
      });
    }
  }
}
