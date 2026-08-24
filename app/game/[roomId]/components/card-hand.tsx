"use client";

import React, { useState, useRef, useCallback } from "react";

import type { ActionCardPollData, PlayerPollData, PendingRewardData } from "@/lib/turn-engine/types";
import type { NameLookupFn } from "@/lib/game-ui/event-messages";
import { CardTile } from "./card-tile";
import { TargetPicker } from "./target-picker";

// --- Types ---

export interface CardSelection {
  cardId: string;
  cardIdentifier: string;
  targetRequirement: "none" | "player";
  targetPlayerId?: string;
}

interface CardHandProps {
  actionCards: ActionCardPollData[] | undefined;
  isViewerTurn: boolean;
  actionsRemaining: number;
  isSubmitting: boolean;
  onCardSelect: (selection: CardSelection) => void;
  players: PlayerPollData[];
  viewerPlayerId: string;
  pendingReward: PendingRewardData | null;
  nameLookup: NameLookupFn;
}

// --- Component ---

function CardHandInner({
  actionCards,
  isViewerTurn,
  actionsRemaining,
  isSubmitting,
  onCardSelect,
  players,
  viewerPlayerId,
  pendingReward,
  nameLookup,
}: CardHandProps) {
  const [activePickerCardId, setActivePickerCardId] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  const disabled = !isViewerTurn || actionsRemaining === 0 || isSubmitting;

  const handleActivate = useCallback(
    (card: ActionCardPollData) => {
      if (card.targetRequirement === "none") {
        onCardSelect({
          cardId: card.id,
          cardIdentifier: card.cardIdentifier,
          targetRequirement: "none",
        });
      } else {
        // Store the button that triggered the picker for return focus
        const activeElement = document.activeElement as HTMLButtonElement | null;
        if (activeElement) {
          returnFocusRef.current = activeElement;
        }
        setActivePickerCardId(card.id);
      }
    },
    [onCardSelect]
  );

  const handleTargetSelect = useCallback(
    (targetPlayerId: string) => {
      const card = actionCards?.find((c) => c.id === activePickerCardId);
      if (card) {
        onCardSelect({
          cardId: card.id,
          cardIdentifier: card.cardIdentifier,
          targetRequirement: "player",
          targetPlayerId,
        });
      }
      setActivePickerCardId(null);
    },
    [actionCards, activePickerCardId, onCardSelect]
  );

  const handlePickerCancel = useCallback(() => {
    setActivePickerCardId(null);
  }, []);

  // Determine disabled reason for screen readers
  const disabledReason = !isViewerTurn
    ? "Cards disabled: it is not your turn"
    : actionsRemaining === 0
      ? "Cards disabled: no actions remaining"
      : isSubmitting
        ? "Cards disabled: action submission in progress"
        : null;

  return (
    <section aria-label="Card hand" className="bg-gray-800 rounded-lg p-4">
      {/* Visually hidden disabled reason for screen readers */}
      {disabled && disabledReason && (
        <p className="sr-only">{disabledReason}</p>
      )}

      {/* Pending reward notice */}
      {pendingReward && (
        <p className="text-sm text-yellow-400 mb-2">
          {pendingReward.rewardTier} card(s) incoming from{" "}
          {nameLookup(pendingReward.regionId, "region")}
        </p>
      )}

      {/* Card tiles or empty state */}
      {!actionCards || actionCards.length === 0 ? (
        <p className="text-gray-400 text-sm text-center">No cards in hand</p>
      ) : (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
          {actionCards.map((card) => (
            <div key={card.id} className="relative">
              <CardTile
                card={card}
                disabled={disabled}
                onActivate={handleActivate}
              />
              {activePickerCardId === card.id && (
                <TargetPicker
                  players={players}
                  viewerPlayerId={viewerPlayerId}
                  onSelect={handleTargetSelect}
                  onCancel={handlePickerCancel}
                  returnFocusRef={returnFocusRef}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * CardHand — renders the viewer's held action cards with interaction logic.
 *
 * Manages enabled/disabled state based on turn ownership, actions remaining,
 * and submission state. Handles card activation (immediate for no-target cards,
 * via TargetPicker for player-targeted cards).
 *
 * Requirements: 10.1, 10.6, 10.7, 11.1-11.7, 15.7
 */
export const CardHand = React.memo(CardHandInner);
