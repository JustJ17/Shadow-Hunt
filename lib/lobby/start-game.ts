import { prisma } from "@/lib/prisma";
import { StartGameResult, LobbyError } from "@/lib/lobby/types";

/**
 * Fisher-Yates shuffle algorithm.
 * Returns a new shuffled copy of the array.
 */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function startGame(params: {
  playerId: string;
}): Promise<StartGameResult | LobbyError> {
  const { playerId } = params;

  // Find player's membership with room and all players in the room
  const membership = await prisma.roomPlayer.findUnique({
    where: { playerId },
    include: { room: { include: { players: true } } },
  });

  if (!membership) {
    return {
      success: false,
      error: "Not in a room",
      code: "NOT_IN_ROOM",
    };
  }

  // Check player is host
  if (!membership.isHost) {
    return {
      success: false,
      error: "Only the host can start the game",
      code: "NOT_HOST",
    };
  }

  // Check room status is "waiting"
  if (membership.room.status !== "waiting") {
    return {
      success: false,
      error: "Game has already started",
      code: "GAME_ALREADY_STARTED",
    };
  }

  const players = membership.room.players;

  // Check at least 2 players
  if (players.length < 2) {
    return {
      success: false,
      error: "At least 2 players are required to start",
      code: "INSUFFICIENT_PLAYERS",
    };
  }

  // Check all non-host players are ready
  const nonHostPlayers = players.filter((p: { isHost: boolean }) => !p.isHost);
  const allReady = nonHostPlayers.every((p: { readyState: string }) => p.readyState === "ready");
  if (!allReady) {
    return {
      success: false,
      error: "Not all players are ready",
      code: "PLAYERS_NOT_READY",
    };
  }

  // Generate random turn order: shuffle player indices, assign positions 1..N
  const shuffledPlayers = shuffle(players);
  const turnOrder = shuffledPlayers.map((p: { playerId: string }, index: number) => ({
    playerId: p.playerId,
    position: index + 1,
  }));

  // In a transaction: update room status and assign turn positions
  await prisma.$transaction(async (tx: typeof prisma) => {
    // Update room status to "in-progress"
    await tx.room.update({
      where: { id: membership.room.id },
      data: { status: "in-progress" },
    });

    // Assign turn positions to each player
    for (const assignment of turnOrder) {
      await tx.roomPlayer.update({
        where: {
          playerId_roomId: {
            playerId: assignment.playerId,
            roomId: membership.room.id,
          },
        },
        data: { turnPosition: assignment.position },
      });
    }
  });

  return {
    success: true,
    turnOrder,
  };
}
