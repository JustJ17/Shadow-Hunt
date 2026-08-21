import { TransactionClient } from "@/lib/turn-engine/types";

/**
 * Executes a USE_CARD action:
 * 1. Marks the specified card as consumed
 * 2. Dispatches to a placeholder effect handler (actual effects defined in Action Cards spec)
 *
 * Assumes validation has already confirmed the card exists and is not consumed.
 */
export async function executeUseCard(
  playerId: string,
  roomId: string,
  cardId: string,
  tx: TransactionClient
): Promise<void> {
  // Mark the card as consumed
  await tx.actionCard.update({
    where: { id: cardId },
    data: { consumed: true },
  });

  // Placeholder: dispatch card effect based on type
  // Actual card effect implementations will be in the Action Cards spec
  const card = await tx.actionCard.findUnique({
    where: { id: cardId },
    select: { type: true },
  });

  if (card) {
    await dispatchCardEffect(card.type, playerId, roomId, tx);
  }
}

/**
 * Placeholder effect handler. Actual implementations will be provided
 * by the Action Cards spec.
 */
async function dispatchCardEffect(
  _cardType: string,
  _playerId: string,
  _roomId: string,
  _tx: TransactionClient
): Promise<void> {
  // No-op placeholder — card effects are implemented in the Action Cards spec
}
