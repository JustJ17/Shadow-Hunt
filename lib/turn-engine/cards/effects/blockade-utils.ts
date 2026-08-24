import { TransactionClient } from "@/lib/turn-engine/types";
import type { TransportType } from "@/lib/map/types";

/**
 * Compares two Turn_Ordinals lexicographically on (round, turnPosition).
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareTurnOrdinal(a: number[], b: number[]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

/**
 * Determines if a turn (currentRound, currentTurnPosition) falls within
 * a Blockade's window.
 *
 * Blockade_Window: Turn_Ordinal strictly greater than (creationRound, casterTurnPos)
 * AND strictly less than (creationRound + 1, casterTurnPos).
 *
 * This means every player between the caster (exclusive) and the caster's
 * next appearance (exclusive) is affected — exactly one turn per other player.
 */
export function isWithinBlockadeWindow(
  creationRound: number,
  casterTurnPosition: number,
  currentRound: number,
  currentTurnPosition: number
): boolean {
  const creationOrdinal = [creationRound, casterTurnPosition];
  const expiryOrdinal = [creationRound + 1, casterTurnPosition];
  const currentOrdinal = [currentRound, currentTurnPosition];

  // current > creation AND current < expiry
  const afterCreation = compareTurnOrdinal(currentOrdinal, creationOrdinal) > 0;
  const beforeExpiry = compareTurnOrdinal(currentOrdinal, expiryOrdinal) < 0;

  return afterCreation && beforeExpiry;
}

/**
 * Returns all Active_Blockades for a room at the given turn ordinal.
 * A blockade is active if:
 * - It is not lifted
 * - The current Turn_Ordinal is inside the Blockade_Window
 */
export async function getActiveBlockades(
  roomId: string,
  currentRound: number,
  currentTurnPosition: number,
  tx: TransactionClient
): Promise<Array<{ id: string; transportType: string; casterPlayerId: string }>> {
  const blockades = await tx.blockade.findMany({
    where: { roomId, lifted: false },
  });

  const active: Array<{ id: string; transportType: string; casterPlayerId: string }> = [];
  const expiredIds: string[] = [];

  for (const b of blockades) {
    if (isWithinBlockadeWindow(b.creationRound, b.casterTurnPosition, currentRound, currentTurnPosition)) {
      active.push(b);
    } else if (currentRound > b.creationRound + 1 ||
      (currentRound === b.creationRound + 1 && currentTurnPosition >= b.casterTurnPosition)) {
      // Blockade is past its expiry window — mark as lifted for cleanup
      expiredIds.push(b.id);
    }
  }

  // Clean up expired blockades (fire-and-forget within transaction)
  if (expiredIds.length > 0) {
    await tx.blockade.updateMany({
      where: { id: { in: expiredIds } },
      data: { lifted: true },
    });
  }

  return active;
}

/**
 * Returns the set of transport types that are blocked for a specific player.
 * A player is NOT blocked by blockades they cast themselves.
 */
export function computeBlockedTransports(
  activeBlockades: Array<{ transportType: string; casterPlayerId: string }>,
  playerId: string
): Set<TransportType> {
  const blocked = new Set<TransportType>();
  for (const b of activeBlockades) {
    if (b.casterPlayerId !== playerId) {
      blocked.add(b.transportType as TransportType);
    }
  }
  return blocked;
}
