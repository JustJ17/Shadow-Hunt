import { TransactionClient } from "@/lib/turn-engine/types";

/**
 * Records a capture attempt flag on the current turn state.
 * The actual capture resolution happens during end-of-turn resolution (Step A).
 */
export async function executeCaptureAttempt(
  turnStateId: string,
  tx: TransactionClient
): Promise<void> {
  await tx.gameTurn.update({
    where: { id: turnStateId },
    data: { captureAttemptFlag: true },
  });
}
