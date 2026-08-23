import {
  TransactionClient,
  NotebookEntryData,
  DiscriminatedNotebookEntry,
} from "@/lib/turn-engine/types";
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
 * Returns a player's notebook entries of all four types, ordered by creation
 * time ascending. Max 200 entries per response.
 *
 * Entry types:
 * - spy-proximity: uses regionId and stepsAway columns directly
 * - mastermind_distance: parsed from payload JSON (locationId, stepsAway)
 * - mastermind_direction: parsed from payload JSON (locationId)
 * - phone_bug: parsed from payload JSON (targetPlayerId, targetLocationId, etc.)
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
): Promise<DiscriminatedNotebookEntry[]> {
  // Reject cross-player access (Requirements 15.9)
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
      payload: true,
    },
  });

  // Map each entry to its discriminated type based on entryType
  return entries
    .map((e): DiscriminatedNotebookEntry | null => {
      if (
        e.entryType === "spy-proximity" &&
        e.regionId !== null &&
        e.stepsAway !== null
      ) {
        return {
          entryType: "spy-proximity",
          regionId: e.regionId,
          roundNumber: e.roundNumber,
          stepsAway: e.stepsAway,
        };
      }

      if (e.entryType === "mastermind_distance" && e.payload) {
        const p = e.payload as Record<string, unknown>;
        return {
          entryType: "mastermind_distance",
          locationId: p.locationId as string,
          roundNumber: e.roundNumber,
          stepsAway: p.stepsAway as number,
        };
      }

      if (e.entryType === "mastermind_direction" && e.payload) {
        const p = e.payload as Record<string, unknown>;
        return {
          entryType: "mastermind_direction",
          locationId: p.locationId as string,
          roundNumber: e.roundNumber,
        };
      }

      if (e.entryType === "phone_bug" && e.payload) {
        const p = e.payload as Record<string, unknown>;
        return {
          entryType: "phone_bug",
          roundNumber: e.roundNumber,
          targetPlayerId: p.targetPlayerId as string,
          targetLocationId: p.targetLocationId as string,
          mastermindStepsAway: p.mastermindStepsAway as number,
          spyRegionId: (p.spyRegionId as string) || null,
          spyCaptured: p.spyCaptured as boolean,
        };
      }

      return null;
    })
    .filter((e): e is DiscriminatedNotebookEntry => e !== null);
}
