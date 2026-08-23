import { CardEffectContext } from "../types";
import { emitEvent } from "@/lib/turn-engine/event-feed";

export async function handleLoseAnAction(ctx: CardEffectContext): Promise<void> {
  const targetPlayerId = ctx.targetPlayerId!;

  // Set action penalty flag on target player's position.
  // Non-stacking: if already true, the update is idempotent — card is still consumed.
  await ctx.tx.playerPosition.update({
    where: {
      roomId_playerId: { roomId: ctx.roomId, playerId: targetPlayerId },
    },
    data: { actionPenaltyFlag: true },
  });

  await emitEvent(
    ctx.roomId,
    "action-penalty-applied",
    {
      playerId: ctx.playerId,
      targetPlayerId,
    },
    ctx.currentRound,
    ctx.tx
  );
}
