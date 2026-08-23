"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GameEventData } from "@/lib/turn-engine/types";
import type { GameResultResponse } from "@/lib/turn-engine/game-result";

interface EndScreenProps {
  roomId: string;
  playerId: string;
  events: GameEventData[];
}

type OutcomeType = "win" | "draw" | "unknown";

interface DetectedOutcome {
  type: OutcomeType;
  winnerId?: string;
  locationId?: string;
  mastermindLocationId?: string;
  roundNumber?: number;
  reason?: string;
}

/**
 * End-screen component rendered when a game finishes (status = "finished").
 * Determines outcome from the Event Feed ("game-won" or "game-draw" event),
 * then fetches detailed result data from the Game Result API.
 *
 * Requirements: 3.1, 3.2, 3.3, 6.1-6.7, 7.1-7.4, 8.2, 8.3, 8.5
 */
export function EndScreen({ roomId, playerId, events }: EndScreenProps) {
  const [result, setResult] = useState<GameResultResponse | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Detect outcome from Event Feed
  const detectedOutcome = detectOutcome(events);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(`/api/game/${roomId}/result`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch result");
        return res.json();
      })
      .then((data: GameResultResponse) => {
        setResult(data);
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        setIsLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [roomId]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="text-lg text-gray-400">Loading results...</p>
      </div>
    );
  }

  // Fallback: no end event detected and API failed/timed out
  if (detectedOutcome.type === "unknown" && (fetchError || !result || result.outcome === "in-progress")) {
    return <FallbackView />;
  }

  // Determine which view to render based on API result or event detection
  if (result && result.outcome === "win") {
    return (
      <WinView
        result={result}
        playerId={playerId}
      />
    );
  }

  if (result && result.outcome === "draw") {
    return <DrawView result={result} />;
  }

  // If API didn't return a finished result but we have event data, use event-based rendering
  if (detectedOutcome.type === "win") {
    return (
      <WinViewFromEvent
        outcome={detectedOutcome}
        playerId={playerId}
        fetchError={fetchError}
      />
    );
  }

  if (detectedOutcome.type === "draw") {
    return (
      <DrawViewFromEvent
        outcome={detectedOutcome}
        fetchError={fetchError}
      />
    );
  }

  return <FallbackView />;
}

// --- Win View (API data available) ---

interface WinViewProps {
  result: { outcome: "win"; winnerId: string; winnerDisplayName: string; winLocationId: string; winLocationName: string; mastermindLocationId: string; mastermindLocationName: string; roundNumber: number };
  playerId: string;
}

function WinView({ result, playerId }: WinViewProps) {
  const isWinner = result.winnerId === playerId;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6" role="main" aria-label="Game results">
        {/* Trophy indicator for winner */}
        <div className="text-6xl" aria-hidden="true">
          {isWinner ? "🏆" : "🎯"}
        </div>

        {/* Viewer-specific heading */}
        <h1 className="text-3xl font-bold">
          {isWinner ? "You won!" : `${result.winnerDisplayName} found the target`}
        </h1>

        {/* Winner display name with visual indicator */}
        <div
          className="inline-block bg-yellow-600/20 border border-yellow-500 rounded-lg px-4 py-2"
          aria-label={`Winner: ${result.winnerDisplayName}`}
        >
          <span className="text-yellow-300 font-semibold text-lg">
            🏆 {result.winnerDisplayName}
          </span>
        </div>

        {/* Game details */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-3 text-left">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Game Details</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Capture Location</span>
              <span className="text-white font-medium">{result.winLocationName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Mastermind Location</span>
              <span className="text-white font-medium">{result.mastermindLocationName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Round</span>
              <span className="text-white font-medium">{result.roundNumber}</span>
            </div>
          </div>
        </div>

        <ReturnToLobbyLink />
      </div>
    </div>
  );
}

// --- Draw View (API data available) ---

interface DrawViewProps {
  result: { outcome: "draw"; roundNumber: number; reason: "max-rounds-exceeded"; mastermindLocationId: string; mastermindLocationName: string };
}

function DrawView({ result }: DrawViewProps) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6" role="main" aria-label="Game results">
        <div className="text-6xl" aria-hidden="true">
          ⏰
        </div>

        <h1 className="text-3xl font-bold">Game Ended in a Draw</h1>

        <p className="text-gray-400">
          Maximum rounds exceeded — no one found the target in {result.roundNumber} rounds.
        </p>

        {/* Game details */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-3 text-left">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Game Details</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Mastermind Location</span>
              <span className="text-white font-medium">{result.mastermindLocationName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Rounds Played</span>
              <span className="text-white font-medium">{result.roundNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Reason</span>
              <span className="text-white font-medium">Maximum rounds exceeded</span>
            </div>
          </div>
        </div>

        <ReturnToLobbyLink />
      </div>
    </div>
  );
}

// --- Win View (event-only fallback when API returned no data) ---

interface WinViewFromEventProps {
  outcome: DetectedOutcome;
  playerId: string;
  fetchError: boolean;
}

function WinViewFromEvent({ outcome, playerId, fetchError }: WinViewFromEventProps) {
  const isWinner = outcome.winnerId === playerId;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6" role="main" aria-label="Game results">
        <div className="text-6xl" aria-hidden="true">
          {isWinner ? "🏆" : "🎯"}
        </div>

        <h1 className="text-3xl font-bold">
          {isWinner ? "You won!" : "A player found the target"}
        </h1>

        {fetchError && (
          <p className="text-gray-400 text-sm">
            Result details unavailable. Please refresh.
          </p>
        )}

        <ReturnToLobbyLink />
      </div>
    </div>
  );
}

// --- Draw View (event-only fallback when API returned no data) ---

interface DrawViewFromEventProps {
  outcome: DetectedOutcome;
  fetchError: boolean;
}

function DrawViewFromEvent({ outcome, fetchError }: DrawViewFromEventProps) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6" role="main" aria-label="Game results">
        <div className="text-6xl" aria-hidden="true">
          ⏰
        </div>

        <h1 className="text-3xl font-bold">Game Ended in a Draw</h1>

        {outcome.roundNumber && (
          <p className="text-gray-400">
            Maximum rounds exceeded — the game ended after round {outcome.roundNumber}.
          </p>
        )}

        {fetchError && (
          <p className="text-gray-400 text-sm">
            Result details unavailable. Please refresh.
          </p>
        )}

        <ReturnToLobbyLink />
      </div>
    </div>
  );
}

// --- Fallback View ---

function FallbackView() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6" role="main" aria-label="Game results">
        <div className="text-6xl" aria-hidden="true">
          🎮
        </div>

        <h1 className="text-3xl font-bold">Game Ended</h1>

        <p className="text-gray-400">
          The game has concluded. Result details are unavailable.
        </p>

        <ReturnToLobbyLink />
      </div>
    </div>
  );
}

// --- Navigation Link ---

function ReturnToLobbyLink() {
  return (
    <Link
      href="/"
      className="inline-block mt-4 px-6 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 transition text-white"
      aria-label="Return to Lobby"
    >
      Return to Lobby
    </Link>
  );
}

// --- Utility: Detect outcome from Event Feed ---

function detectOutcome(events: GameEventData[]): DetectedOutcome {
  // Look for game-won event
  const wonEvent = events.find((e) => e.type === "game-won");
  if (wonEvent) {
    return {
      type: "win",
      winnerId: wonEvent.payload.winnerId as string | undefined,
      locationId: wonEvent.payload.locationId as string | undefined,
      mastermindLocationId: wonEvent.payload.mastermindLocationId as string | undefined,
      roundNumber: wonEvent.roundNumber,
    };
  }

  // Look for game-draw event
  const drawEvent = events.find((e) => e.type === "game-draw");
  if (drawEvent) {
    return {
      type: "draw",
      roundNumber: (drawEvent.payload.roundNumber as number | undefined) ?? drawEvent.roundNumber,
      mastermindLocationId: drawEvent.payload.mastermindLocationId as string | undefined,
      reason: drawEvent.payload.reason as string | undefined,
    };
  }

  return { type: "unknown" };
}
