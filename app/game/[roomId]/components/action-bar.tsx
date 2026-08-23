"use client";

import { useState, useRef, useCallback } from "react";

export interface ActionBarProps {
  isViewerTurn: boolean;
  isSubmitting: boolean;
  actionsRemaining: number;
  captureAttemptFlag: boolean;
  error: string | null;
  onSkip: () => void;
  onCaptureAttempt: () => void;
}

/**
 * ActionBar provides Skip Turn and Capture Attempt buttons plus error display.
 * Uses aria-disabled (not HTML disabled) to keep buttons in tab order.
 * Includes an inline confirmation prompt before capture submission.
 *
 * Requirements: 4.1–4.10
 */
export function ActionBar({
  isViewerTurn,
  isSubmitting,
  actionsRemaining,
  captureAttemptFlag,
  error,
  onSkip,
  onCaptureAttempt,
}: ActionBarProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const captureButtonRef = useRef<HTMLButtonElement>(null);

  const isDisabled = !isViewerTurn || isSubmitting || actionsRemaining === 0;
  const isCaptureDisabled = isDisabled || captureAttemptFlag;

  const handleSkip = useCallback(() => {
    if (isDisabled) return;
    onSkip();
  }, [isDisabled, onSkip]);

  const handleCaptureClick = useCallback(() => {
    if (isCaptureDisabled) return;
    setShowConfirm(true);
  }, [isCaptureDisabled]);

  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    onCaptureAttempt();
  }, [onCaptureAttempt]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
    captureButtonRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-gray-800 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-disabled={isDisabled}
          className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
            isDisabled
              ? "cursor-not-allowed bg-gray-600 text-gray-400"
              : "bg-blue-600 text-white hover:bg-blue-500"
          }`}
          onClick={handleSkip}
        >
          Skip Turn
        </button>

        <button
          ref={captureButtonRef}
          type="button"
          aria-disabled={isCaptureDisabled}
          className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
            isCaptureDisabled
              ? "cursor-not-allowed bg-gray-600 text-gray-400"
              : "bg-red-600 text-white hover:bg-red-500"
          }`}
          onClick={handleCaptureClick}
        >
          Capture Attempt
        </button>
      </div>

      {showConfirm && (
        <div className="flex items-center gap-3 rounded bg-gray-700 px-3 py-2 text-sm text-gray-200">
          <span>Are you sure? This ends your turn if wrong.</span>
          <button
            type="button"
            className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-500"
            onClick={handleConfirm}
            autoFocus
          >
            Confirm
          </button>
          <button
            type="button"
            className="rounded bg-gray-500 px-3 py-1 text-white hover:bg-gray-400"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="text-sm text-red-400"
        >
          {error}
        </div>
      )}
    </div>
  );
}
