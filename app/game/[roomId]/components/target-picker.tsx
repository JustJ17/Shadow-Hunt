"use client";

import React, { useEffect, useRef, useCallback } from "react";
import type { PlayerPollData } from "@/lib/turn-engine/types";

interface TargetPickerProps {
  players: PlayerPollData[];
  viewerPlayerId: string;
  onSelect: (targetPlayerId: string) => void;
  onCancel: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}

export function TargetPicker({
  players,
  viewerPlayerId,
  onSelect,
  onCancel,
  returnFocusRef,
}: TargetPickerProps) {
  const listboxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const eligiblePlayers = players.filter(
    (p) => p.playerId !== viewerPlayerId
  );

  // Focus first option on mount
  useEffect(() => {
    const firstOption = listboxRef.current?.querySelector<HTMLElement>(
      '[role="option"]'
    );
    firstOption?.focus();
  }, []);

  const handleCancel = useCallback(() => {
    onCancel();
    returnFocusRef.current?.focus();
  }, [onCancel, returnFocusRef]);

  const getOptionElements = useCallback((): HTMLElement[] => {
    if (!listboxRef.current) return [];
    return Array.from(
      listboxRef.current.querySelectorAll<HTMLElement>('[role="option"]')
    );
  }, []);

  const getAllFocusable = useCallback((): HTMLElement[] => {
    const options = getOptionElements();
    if (cancelRef.current) {
      return [...options, cancelRef.current];
    }
    return options;
  }, [getOptionElements]);

  const handleOptionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const options = getOptionElements();
      const currentIndex = options.indexOf(e.currentTarget);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % options.length;
          options[nextIndex]?.focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIndex =
            (currentIndex - 1 + options.length) % options.length;
          options[prevIndex]?.focus();
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          const playerId = e.currentTarget.dataset.playerId;
          if (playerId) {
            onSelect(playerId);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          handleCancel();
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Tab: wrap to cancel button (last focusable)
            cancelRef.current?.focus();
          } else {
            // Tab: move to next option or cancel button
            const allFocusable = getAllFocusable();
            const allIndex = allFocusable.indexOf(e.currentTarget);
            const nextIndex = (allIndex + 1) % allFocusable.length;
            allFocusable[nextIndex]?.focus();
          }
          break;
        }
      }
    },
    [getOptionElements, getAllFocusable, onSelect, handleCancel]
  );

  const handleCancelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      switch (e.key) {
        case "Escape": {
          e.preventDefault();
          handleCancel();
          break;
        }
        case "Tab": {
          e.preventDefault();
          const allFocusable = getAllFocusable();
          if (e.shiftKey) {
            // Shift+Tab: wrap to last option
            const prevIndex = allFocusable.length - 2;
            allFocusable[prevIndex >= 0 ? prevIndex : 0]?.focus();
          } else {
            // Tab: wrap to first option
            allFocusable[0]?.focus();
          }
          break;
        }
      }
    },
    [handleCancel, getAllFocusable]
  );

  return (
    <div
      className="bg-gray-700 rounded-lg p-3 border border-gray-600"
      role="presentation"
    >
      <p className="text-sm text-gray-300 mb-2">Select a target player:</p>
      <div
        role="listbox"
        aria-label="Target player"
        tabIndex={-1}
        ref={listboxRef}
      >
        {eligiblePlayers.map((player) => (
          <div
            key={player.playerId}
            role="option"
            tabIndex={0}
            aria-selected={false}
            data-player-id={player.playerId}
            onClick={() => onSelect(player.playerId)}
            onKeyDown={handleOptionKeyDown}
            className="px-3 py-2 rounded cursor-pointer text-white hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          >
            {player.displayName}
          </div>
        ))}
      </div>
      <button
        ref={cancelRef}
        type="button"
        onClick={handleCancel}
        onKeyDown={handleCancelKeyDown}
        className="mt-2 w-full px-3 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
      >
        Cancel
      </button>
    </div>
  );
}
