import { TransactionClient, NotebookEntryData } from "@/lib/turn-engine/types";
import { prisma } from "@/lib/prisma";

/**
 * Appends a spy-proximity notebook entry for a player.
 * Called during end-of-turn resolution (Case 5 of Step B).
 */
export async function appendNotebookEntry(
  roomId: string,
  playerId: string,
  entry: NotebookEntryData,
  tx: TransactionClient
): Promise<void> {
  await tx.notebookEntry.create({
    data: {
      roomId,
      playerId,
      entryType: "spy-proximity",
      regionId: entry.regionId,
      roundNumber: entry.roundNumber,
      stepsAway: entry.stepsAway,
    },
  });
}

/**
 * Returns a player's notebook entries, ordered by creation time ascending.
 * Max 200 entries per response.
 *
 * Rejects cross-player access: requestingPlayerId must match playerId.
 *
 * @param roomId - The game session room ID
 * @param playerId - The player whose notebook is being queried
 * @param requestingPlayerId - The player making the request (must match playerId)
 * @param limit - Max entries to return (capped at 200)
 */
export async function getPlayerNotebook(
  roomId: string,
  playerId: string,
  requestingPlayerId: string,
  limit: number = 200
): Promise<NotebookEntryData[]> {
  // Reject cross-player access (Requirements 11.5, 11.6)
  if (playerId !== requestingPlayerId) {
    throw new Error("Access denied: cannot view another player's notebook");
  }

  const entries = await prisma.notebookEntry.findMany({
    where: { roomId, playerId },
    orderBy: { createdAt: "asc" },
    take: Math.min(limit, 200),
    select: {
      regionId: true,
      roundNumber: true,
      stepsAway: true,
      entryType: true,
    },
  });

  // Filter to spy-proximity entries and map to NotebookEntryData
  return entries
    .filter(
      (e) =>
        e.entryType === "spy-proximity" &&
        e.regionId !== null &&
        e.stepsAway !== null
    )
    .map((e) => ({
      regionId: e.regionId!,
      roundNumber: e.roundNumber,
      stepsAway: e.stepsAway!,
    }));
}
