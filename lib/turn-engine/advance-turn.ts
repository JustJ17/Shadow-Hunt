import { TransactionClient, TurnState } from "@/lib/turn-engine/types";
import { emitEvent } from "@/lib/turn-engine/event-feed";
import { getPlayerPositionRecord } from "@/lib/turn-engine/player-positions";

/**
 * Advances the turn to the next player in round-robin order.
 *
 * Handles:
 * - Round-robin turn order based on turnPosition (ascending)
 * - Round number increment when wrapping from last player back to first
 * - Skip flagged players: clears the flag, emits a "turn-skipped" event, advances past them
 * - All-flagged edge case: clears all flags and advances the round until an unflagged player is found
 * - Resets slot to 1 and captureAttemptFlag to false for the new turn
 */
export async function advanceTurn(
  roomId: string,
  turnState: TurnState,
  tx: TransactionClient
): Promise<void> {
  const players = await tx.roomPlayer.findMany({
    where: { roomId },
    orderBy: { turnPosition: "asc" },
  });

  const currentIdx = players.findIndex(
    (p) => p.playerId === turnState.currentPlayerId
  );
  let nextIdx = (currentIdx + 1) % players.length;
  let newRound = turnState.currentRound;

  // If we wrapped around to the beginning, increment the round
  if (nextIdx === 0) {
    newRound += 1;
  }

  // Check for skip flags — skip players until we find one without the flag.
  // Safety: if ALL remaining players have skip flags, clear all and advance
  // (the while loop is bounded by players.length to prevent infinite loops).
  let skippedCount = 0;
  while (skippedCount < players.length) {
    const nextPlayer = players[nextIdx];
    const position = await getPlayerPositionRecord(
      roomId,
      nextPlayer.playerId,
      tx
    );

    if (position.skipNextTurn) {
      // Clear the skip flag
      await tx.playerPosition.update({
        where: { roomId_playerId: { roomId, playerId: nextPlayer.playerId } },
        data: { skipNextTurn: false },
      });

      // Emit "turn-skipped" event to the public Event Feed
      await emitEvent(
        roomId,
        "turn-skipped",
        { playerId: nextPlayer.playerId },
        newRound,
        tx
      );

      // Advance to next player
      nextIdx = (nextIdx + 1) % players.length;
      if (nextIdx === 0) {
        newRound += 1;
      }
      skippedCount++;
    } else {
      break;
    }
  }

  // Update the turn state for the new player's turn
  await tx.gameTurn.update({
    where: { id: turnState.id },
    data: {
      currentPlayerId: players[nextIdx].playerId,
      currentRound: newRound,
      currentSlot: 1,
      captureAttemptFlag: false,
    },
  });
}
