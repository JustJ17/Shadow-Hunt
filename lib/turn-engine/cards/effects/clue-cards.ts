import { CardEffectContext } from "../types";

/**
 * All three clue cards (locate-the-mastermind, bug-a-phone, reveal-direction)
 * create a PendingClue record at play time. Resolution happens at Round End.
 */
export async function handleLocateTheMastermind(ctx: CardEffectContext): Promise<void> {
  await createPendingClue(ctx, "locate-the-mastermind");
}

export async function handleBugAPhone(ctx: CardEffectContext): Promise<void> {
  await createPendingClue(ctx, "bug-a-phone");
}

export async function handleRevealDirection(ctx: CardEffectContext): Promise<void> {
  await createPendingClue(ctx, "reveal-direction");
}

async function createPendingClue(
  ctx: CardEffectContext,
  cardIdentifier: string
): Promise<void> {
  await ctx.tx.pendingClue.create({
    data: {
      roomId: ctx.roomId,
      playerId: ctx.playerId,
      cardIdentifier,
      roundNumber: ctx.currentRound,
      originLocationId: ctx.playerLocationId,
      resolved: false,
    },
  });
}
