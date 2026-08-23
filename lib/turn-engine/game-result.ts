import { prisma } from "@/lib/prisma";

// --- Response Interfaces ---

export interface GameResultWin {
  outcome: "win";
  winnerId: string;
  winnerDisplayName: string;
  winLocationId: string;
  winLocationName: string;
  mastermindLocationId: string;
  mastermindLocationName: string;
  roundNumber: number;
}

export interface GameResultDraw {
  outcome: "draw";
  roundNumber: number;
  reason: "max-rounds-exceeded";
  mastermindLocationId: string;
  mastermindLocationName: string;
}

export interface GameResultInProgress {
  outcome: "in-progress";
}

export type GameResultResponse =
  | GameResultWin
  | GameResultDraw
  | GameResultInProgress;

/**
 * Queries the game result for a room.
 *
 * Verifies:
 * 1. Room exists (throws "Room not found" if not)
 * 2. Player is a member of the room (throws "Access denied" if not)
 * 3. Room status — returns in-progress if game hasn't ended
 * 4. For finished games, returns the full result with resolved names
 *
 * Requirements: 2.5, 2.6, 2.7, 2.8, 9.1, 9.2, 9.3, 9.6
 */
export async function getGameResult(
  roomId: string,
  playerId: string
): Promise<GameResultResponse> {
  // 1. Verify room exists
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, status: true },
  });
  if (!room) {
    throw new Error("Room not found");
  }

  // 2. Verify player membership
  const membership = await prisma.roomPlayer.findUnique({
    where: { playerId_roomId: { playerId, roomId } },
  });
  if (!membership) {
    throw new Error("Access denied");
  }

  // 3. If game is not finished, return in-progress
  if (room.status !== "finished") {
    return { outcome: "in-progress" };
  }

  // 4. Query GameResult with Location joins for names
  const gameResult = await prisma.gameResult.findUnique({
    where: { roomId },
  });

  if (!gameResult) {
    // Edge case: room is finished but no GameResult record exists yet
    return { outcome: "in-progress" };
  }

  // Resolve mastermind location name (always present)
  const mastermindLocation = await prisma.location.findUnique({
    where: { id: gameResult.mastermindLocationId },
    select: { name: true },
  });

  if (gameResult.outcome === "win") {
    // Resolve winner display name
    const winnerPlayer = await prisma.roomPlayer.findFirst({
      where: { roomId, playerId: gameResult.winnerId! },
      select: { displayName: true },
    });

    // Resolve win location name
    const winLocation = await prisma.location.findUnique({
      where: { id: gameResult.winLocationId! },
      select: { name: true },
    });

    return {
      outcome: "win",
      winnerId: gameResult.winnerId!,
      winnerDisplayName: winnerPlayer?.displayName ?? "Unknown",
      winLocationId: gameResult.winLocationId!,
      winLocationName: winLocation?.name ?? gameResult.winLocationId!,
      mastermindLocationId: gameResult.mastermindLocationId,
      mastermindLocationName:
        mastermindLocation?.name ?? gameResult.mastermindLocationId,
      roundNumber: gameResult.roundNumber,
    };
  }

  // Draw outcome
  return {
    outcome: "draw",
    roundNumber: gameResult.roundNumber,
    reason: (gameResult.reason as "max-rounds-exceeded") ?? "max-rounds-exceeded",
    mastermindLocationId: gameResult.mastermindLocationId,
    mastermindLocationName:
      mastermindLocation?.name ?? gameResult.mastermindLocationId,
  };
}
