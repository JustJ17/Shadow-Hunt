import { CardEffectContext } from "../types";
import { emitEvent } from "@/lib/turn-engine/event-feed";

export async function handleCloseAllRoads(ctx: CardEffectContext): Promise<void> {
  await createBlockade(ctx, "car");
}

export async function handleCloseAllAirways(ctx: CardEffectContext): Promise<void> {
  await createBlockade(ctx, "plane");
}

export async function handleCloseAllSeaRoutes(ctx: CardEffectContext): Promise<void> {
  await createBlockade(ctx, "boat");
}

async function createBlockade(
  ctx: CardEffectContext,
  transportType: "car" | "plane" | "boat"
): Promise<void> {
  await ctx.tx.blockade.create({
    data: {
      roomId: ctx.roomId,
      transportType,
      casterPlayerId: ctx.playerId,
      creationRound: ctx.currentRound,
      casterTurnPosition: ctx.casterTurnPosition,
      lifted: false,
    },
  });

  await emitEvent(
    ctx.roomId,
    "blockade-activated",
    {
      playerId: ctx.playerId,
      transportType,
      roundNumber: ctx.currentRound,
    },
    ctx.currentRound,
    ctx.tx
  );
}
