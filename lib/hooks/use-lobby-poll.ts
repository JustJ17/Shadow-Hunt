"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { LobbyState } from "@/lib/lobby/types";

interface UseLobbyPollResult {
  state: LobbyState | null;
  error: string | null;
  isLoading: boolean;
}

const POLL_INTERVAL_MS = 3000; // 3 seconds

export function useLobbyPoll(): UseLobbyPollResult {
  const [state, setState] = useState<LobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms/poll");
      const data = await res.json();

      if (data.success) {
        setState(data.state);
        setError(null);
      } else {
        setError(data.error || "Failed to poll lobby state");
      }
    } catch (err) {
      setError("Network error — retrying...");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    poll(); // Initial poll
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [poll]);

  return { state, error, isLoading };
}
