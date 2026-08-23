import {
  TransactionClient,
  TurnState,
  DrawDetectionResult,
} from "@/lib/turn-engine/types";
import { emitEvent } from "@/lib/turn-engine/event-feed";
import { getPlayerPositionRecord } from "@/lib/turn-engine/player-positions";
import { resolveRoundEnd } from "@/lib/turn-engine/resolution/resolve-round-end";

/**
 * Default action budget when no penalty is active.
 */
const DEFAULT_ACTION_BUDGET = 2;

/**
 * Minimum action budget (penalty cannot reduce below this).
 */
const MINIMUM_ACTION_BUDGET = 1;

/**
 * Computes the action budget for a player, applying penalty if flagged.
 * If the penalty flag is set, clears it in the database and returns
 * DEFAULT_ACTION_BUDGET - 1 (bounded below by MINIMUM_ACTION_BUDGET).
 */
async function computeAndClearPenalty(
  roomId: string,
  playerId: string,
  tx: TransactionClient
): Promise<number> {
  const position = await getPlayerPositionRecord(roomId, playerId, tx);

  if (position.actionPenaltyFlag) {
    await tx.playerPosition.update({
      where: { roomId_playerId: { roomId, playerId } },
      data: { actionPenaltyFlag: false },
    });
    return Math.max(DEFAULT_ACTION_BUDGET - 1, MINIMUM_ACTION_BUDGET);
  }

  return DEFAULT_ACTION_BUDGET;
}

/**
 * Advances the turn to the next player in round-robin order.
 *
 * Handles:
 * - Extra turns: if the current player has pendingExtraTurns > 0, grants an extra turn
 *   to the same player (decrementing the counter) before advancing to the next player.
 * - Round-end resolution: calls resolveRoundEnd when crossing a round boundary
 *   (before incrementing the round number).
 * - Round-robin turn order based on turnPosition (ascending).
 * - Round number increment when wrapping from last player back to first.
 * - Skip flagged players: clears the flag, emits a "turn-skipped" event, advances past them.
 * - Skip consuming extra turns (Req 10.9): if next player has skip flag AND pendingExtraTurns > 0,
 *   the skip consumes one extra turn instead of skipping the normal turn.
 * - All-flagged edge case: clears all flags and advances the round until an unflagged player is found.
 * - Resets actionsRemaining to the computed actionBudget for the new turn.
 * - Clears captureAttemptFlag for the new turn.
 * - Draw detection: if the new round exceeds maxRoundLimit, ends the game as a draw.
 * - Action budget computation: applies penalty flag if set, clears it.
 */
export async function advanceTurn(
  roomId: string,
  turnState: TurnState,
  tx: TransactionClient
): Promise<DrawDetectionResult> {
  // Guard: if room is already finished (e.g., from a capture attempt), skip advancement
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
  if (room.status === "finished") {
    return { drawDetected: false };
  }

  // --- Extra Turn Check ---
  // Before advancing to the next player, check if the current player has pending extra turns.
  // This ensures last player's extra turns complete before the round increments (Req 10.10).
  const currentPlayerPos = await getPlayerPositionRecord(
    roomId,
    turnState.currentPlayerId,
    tx
  );

  if (currentPlayerPos.pendingExtraTurns > 0) {
    // Decrement pending extra turns
    await tx.playerPosition.update({
      where: {
        roomId_playerId: { roomId, playerId: turnState.currentPlayerId },
      },
      data: { pendingExtraTurns: { decrement: 1 } },
    });

    // Compute action budget for the extra turn (penalty may apply — Req 8.9)
    const actionBudget = await computeAndClearPenalty(
      roomId,
      turnState.currentPlayerId,
      tx
    );

    // Grant extra turn to same player (same round, fresh actions)
    await tx.gameTurn.update({
      where: { id: turnState.id },
      data: {
        actionsRemaining: actionBudget,
        actionBudget,
        captureAttemptFlag: false,
        isExtraTurn: true,
      },
    });

    // Emit extra-turn-started event (Req 10.8)
    await emitEvent(
      roomId,
      "extra-turn-started",
      {
        playerId: turnState.currentPlayerId,
        roundNumber: turnState.currentRound,
      },
      turnState.currentRound,
      tx
    );

    return { drawDetected: false };
  }

  // --- Normal Turn Advancement ---
  const players = await tx.roomPlayer.findMany({
    where: { roomId },
    orderBy: { turnPosition: "asc" },
  });

  const currentIdx = players.findIndex(
    (p) => p.playerId === turnState.currentPlayerId
  );
  let nextIdx = (currentIdx + 1) % players.length;
  let newRound = turnState.currentRound;

  // If we wrapped around to the beginning, we've crossed a round boundary
  if (nextIdx === 0) {
    // Call Round End Resolution BEFORE incrementing round number (Req 14.1)
    await resolveRoundEnd(roomId, turnState.currentRound, tx);
    newRound += 1;
  }

  // --- Skip Flag Handling ---
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
      // Req 10.9: Skip consuming extra turns — if the next player has skip flag
      // AND pendingExtraTurns > 0, the skip consumes one extra turn.
      if (position.pendingExtraTurns > 0) {
        await tx.playerPosition.update({
          where: {
            roomId_playerId: { roomId, playerId: nextPlayer.playerId },
          },
          data: {
            skipNextTurn: false,
            pendingExtraTurns: { decrement: 1 },
          },
        });
      } else {
        // Normal skip: clear the skip flag
        await tx.playerPosition.update({
          where: {
            roomId_playerId: { roomId, playerId: nextPlayer.playerId },
          },
          data: { skipNextTurn: false },
        });
      }

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
        // Another round boundary crossed during skip traversal
        await resolveRoundEnd(roomId, newRound, tx);
        newRound += 1;
      }
      skippedCount++;
    } else {
      break;
    }
  }

  // --- Draw Detection ---
  // Check if the new round exceeds the configured maxRoundLimit
  if (newRound > room.maxRoundLimit) {
    // Fetch the mastermind's location from GameThreat
    const gameThreat = await tx.gameThreat.findUniqueOrThrow({
      where: { roomId },
    });

    // Transition room status to "finished"
    await tx.room.update({
      where: { id: roomId },
      data: { status: "finished" },
    });

    // Create GameResult record with outcome "draw"
    await tx.gameResult.create({
      data: {
        roomId,
        outcome: "draw",
        mastermindLocationId: gameThreat.locationId,
        roundNumber: newRound,
        reason: "max-rounds-exceeded",
      },
    });

    // Emit "game-draw" event to the Event Feed
    await emitEvent(
      roomId,
      "game-draw",
      {
        roundNumber: newRound,
        mastermindLocationId: gameThreat.locationId,
        reason: "max-rounds-exceeded",
      },
      newRound,
      tx
    );

    return {
      drawDetected: true,
      drawEvent: {
        roundNumber: newRound,
        mastermindLocationId: gameThreat.locationId,
      },
    };
  }

  // --- Compute Action Budget for New Player ---
  const nextPlayer = players[nextIdx];
  const actionBudget = await computeAndClearPenalty(
    roomId,
    nextPlayer.playerId,
    tx
  );

  // Normal turn advancement — update the turn state for the new player's turn
  await tx.gameTurn.update({
    where: { id: turnState.id },
    data: {
      currentPlayerId: nextPlayer.playerId,
      currentRound: newRound,
      actionsRemaining: actionBudget,
      actionBudget,
      captureAttemptFlag: false,
      isExtraTurn: false,
    },
  });

  return { drawDetected: false };
}
