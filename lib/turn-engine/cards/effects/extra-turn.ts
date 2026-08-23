import { CardEffectContext } from "../types";

export async function handleExtraTurn(ctx: CardEffectContext): Promise<void> {
  await ctx.tx.playerPosition.update({
    where: { roomId_playerId: { roomId: ctx.roomId, playerId: ctx.playerId } },
    data: { pendingExtraTurns: { increment: 1 } },
  });
}
