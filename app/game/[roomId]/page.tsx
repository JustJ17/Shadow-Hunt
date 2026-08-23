"use client";

import { useParams } from "next/navigation";
import { useGamePoll } from "@/lib/hooks/use-game-poll";
import { EndScreen } from "./components/EndScreen";

/**
 * Main game page. Polls /api/game/[roomId]/state for current game state.
 * When status === "finished", renders EndScreen instead of active game view.
 * On direct navigation to a finished game, renders EndScreen on initial load
 * (no flash of active game view).
 *
 * Requirements: 8.1, 8.4, 8.6
 */
export default function GamePage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const { state, error, isLoading } = useGamePoll(roomId);

  // Loading state — neutral screen that works for both active and finished games
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="text-lg text-gray-400">Loading game...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-red-400 text-lg">{error}</p>
          <a href="/" className="text-blue-400 underline mt-4 inline-block">
            Back to home
          </a>
        </div>
      </div>
    );
  }

  if (!state) return null;

  // Game is finished — render EndScreen immediately (handles both polling
  // transition and direct navigation to a finished game URL)
  if (state.status === "finished") {
    return (
      <EndScreen
        roomId={roomId}
        playerId={state.viewerPlayerId}
        events={state.events}
      />
    );
  }

  // Active game view (placeholder — will be implemented in future tasks)
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Shadow Hunt</h1>
          <div className="bg-gray-800 px-3 py-1 rounded text-sm text-gray-400">
            Round {state.currentRound}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">
            Game in progress — active game view coming soon.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Current turn: {state.players.find(p => p.playerId === state.currentPlayerId)?.displayName ?? "Unknown"}
          </p>
        </div>
      </div>
    </div>
  );
}
