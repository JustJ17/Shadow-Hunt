import { CARD_REGISTRY } from "./registry";
import { CardEffectContext, CardIdentifier } from "./types";
import { TransactionClient } from "@/lib/turn-engine/types";

// --- Dispatch Result Types ---

export interface DispatchResult {
  success: true;
}

export interface DispatchError {
  success: false;
  code: "UNKNOWN_CARD_TYPE" | "INVALID_CARD_TARGET";
  message: string;
}

/**
 * Validates the card target and dispatches to the appropriate effect handler.
 * Called AFTER card ownership and consumption validation in submitAction.
 * Card is marked consumed and actionsRemaining decremented by the caller.
 */
export async function dispatchCard(
  cardType: string,
  playerId: string,
  roomId: string,
  targetPlayerId: string | undefined,
  playerLocationId: string,
  currentRound: number,
  casterTurnPosition: number,
  tx: TransactionClient,
  rng: () => number = Math.random
): Promise<DispatchResult | DispatchError> {
  // Reject legacy or unknown card types
  const definition = CARD_REGISTRY.get(cardType as CardIdentifier);
  if (!definition) {
    return {
      success: false,
      code: "UNKNOWN_CARD_TYPE",
      message: `Unknown card type: ${cardType}`,
    };
  }

  // Target validation
  if (definition.targetRequirement === "player") {
    if (!targetPlayerId) {
      return {
        success: false,
        code: "INVALID_CARD_TARGET",
        message: "This card requires a target player",
      };
    }
    if (targetPlayerId === playerId) {
      return {
        success: false,
        code: "INVALID_CARD_TARGET",
        message: "Cannot target yourself",
      };
    }
    // Verify target is a room member
    const targetMembership = await tx.roomPlayer.findUnique({
      where: { playerId_roomId: { playerId: targetPlayerId, roomId } },
    });
    if (!targetMembership) {
      return {
        success: false,
        code: "INVALID_CARD_TARGET",
        message: "Target player is not in this room",
      };
    }
  } else {
    // Target_Requirement = "none" — reject if target supplied
    if (targetPlayerId) {
      return {
        success: false,
        code: "INVALID_CARD_TARGET",
        message: "This card does not accept a target player",
      };
    }
  }

  // Build context and invoke handler
  const ctx: CardEffectContext = {
    roomId,
    playerId,
    targetPlayerId,
    playerLocationId,
    currentRound,
    casterTurnPosition,
    tx,
    rng,
  };

  await definition.handler(ctx);
  return { success: true };
}
