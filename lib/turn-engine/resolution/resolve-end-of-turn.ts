import {
  TransactionClient,
  TurnState,
  EndOfTurnResolution,
} from "@/lib/turn-engine/types";
import { resolveCaptureAttempt } from "@/lib/turn-engine/resolution/resolve-capture";
import { resolveSpyAndReward } from "@/lib/turn-engine/resolution/resolve-spy-reward";
import { getPlayerPosition } from "@/lib/turn-engine/player-positions";

/**
 * Orchestrates end-of-turn resolution:
 * Step A: Capture Attempt resolution (if capture flag set)
 * Step B: Spy/reward resolution (skipped if capture succeeded)
 */
export async function resolveEndOfTurn(
  roomId: string,
  playerId: string,
  turnState: TurnState,
  tx: TransactionClient
): Promise<EndOfTurnResolution> {
  const resolution: EndOfTurnResolution = {};

  // Get player's final position (after all actions)
  const finalLocationId = await getPlayerPosition(roomId, playerId, tx);

  // Step A: Capture Attempt (if flag set)
  if (turnState.captureAttemptFlag) {
    const captureOutcome = await resolveCaptureAttempt(
      roomId,
      playerId,
      finalLocationId,
      tx
    );
    resolution.captureAttempt = captureOutcome;

    // If capture succeeded, skip Step B (game over)
    if (captureOutcome.result === "success") {
      return resolution;
    }
  }

  // Step B: Spy/reward resolution
  const spyResult = await resolveSpyAndReward(
    roomId,
    playerId,
    finalLocationId,
    turnState.currentRound,
    tx
  );
  resolution.spyResult = spyResult;

  return resolution;
}
