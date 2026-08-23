"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { GamePollState } from "@/lib/turn-engine";

interface UseGamePollResult {
  state: GamePollState | null;
  error: string | null;
  isLoading: boolean;
  refetch: () => void;
}

const POLL_INTERVAL_MS = 3000; // 3 seconds

/**
 * Polls the game state endpoint for the given room.
 * Returns the current game state including status, events, and player data.
 * Stops polling once the game reaches "finished" status.
 * Exposes a `refetch()` method that triggers an immediate poll and resets the interval.
 */
export function useGamePoll(roomId: string): UseGamePollResult {
  const [state, setState] = useState<GamePollState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<GamePollState | null>(null);
  const isPollingRef = useRef(false);

  const poll = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const afterSequence =
        stateRef.current && stateRef.current.events.length > 0
          ? Math.max(...stateRef.current.events.map((e) => e.sequenceNumber))
          : undefined;

      const url = afterSequence !== undefined
        ? `/api/game/${roomId}/state?afterSequence=${afterSequence}`
        : `/api/game/${roomId}/state`;

      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Request failed (${res.status})`);
        return;
      }

      const data: GamePollState = await res.json();
      // Merge new events with existing events when using afterSequence
      if (afterSequence !== undefined && stateRef.current) {
        const existingEvents = stateRef.current.events;
        const newEvents = data.events.filter(
          (e) => !existingEvents.some((ex) => ex.id === e.id)
        );
        data.events = [...existingEvents, ...newEvents];
      }

      setState(data);
      stateRef.current = data;
      setError(null);

      // Stop polling once game is finished
      if (data.status === "finished" && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch {
      setError("Network error — retrying...");
    } finally {
      isPollingRef.current = false;
      setIsLoading(false);
    }
  }, [roomId]);

  const refetch = useCallback(() => {
    // Clear the current interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // If a poll is already in-flight, skip the immediate fetch
    // but still restart the timer
    if (!isPollingRef.current) {
      poll();
    }

    // Restart the interval from zero
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [poll]);

  useEffect(() => {
    poll(); // Initial poll
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [poll]);

  return { state, error, isLoading, refetch };
}
