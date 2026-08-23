"use client";

import { useState, useRef, useCallback } from "react";
import { errorMessageFor } from "@/lib/game-ui/error-messages";
import type { ActionPayload, TurnActionErrorCode } from "@/lib/turn-engine/types";

export interface UseSubmitActionResult {
  submit: (payload: ActionPayload) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Hook that manages action submission to the game action API.
 * Provides an in-flight guard to prevent duplicate concurrent requests,
 * maps error codes to human-readable messages, and triggers a refetch
 * on success or concurrency conflict.
 */
export function useSubmitAction(
  roomId: string,
  refetch: () => void
): UseSubmitActionResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const submit = useCallback(
    async (payload: ActionPayload): Promise<void> => {
      // In-flight guard: reject if a request is already in progress
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      setIsSubmitting(true);
      setError(null);

      try {
        const res = await fetch(`/api/game/${roomId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          refetch();
        } else {
          const data = await res.json().catch(() => ({}));
          const code: TurnActionErrorCode | "UNKNOWN" = data.code ?? "UNKNOWN";
          setError(errorMessageFor(code));

          if (code === "CONCURRENCY_CONFLICT") {
            refetch();
          }
        }
      } catch {
        setError(errorMessageFor("UNKNOWN"));
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [roomId, refetch]
  );

  return { submit, isSubmitting, error };
}
