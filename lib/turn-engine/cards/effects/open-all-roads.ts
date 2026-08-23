import { CardEffectContext } from "../types";
import { emitEvent } from "@/lib/turn-engine/event-feed";
import { getActiveBlockades } from "./blockade-utils";

export async function handleOpenAllRoads(ctx: CardEffectContext): Promise<void> {
  const activeBlockades = await getActiveBlockades(
    ctx.roomId,
    ctx.currentRound,
    ctx.casterTurnPosition,
    ctx.tx
  );

  const liftedCount = activeBlockades.length;

  if (liftedCount > 0) {
    await ctx.tx.blockade.updateMany({
      where: {
        id: { in: activeBlockades.map((b) => b.id) },
      },
      data: { lifted: true },
    });
  }

  await emitEvent(
    ctx.roomId,
    "blockade-lifted",
    {
      playerId: ctx.playerId,
      liftedCount,
    },
    ctx.currentRound,
    ctx.tx
  );
}
