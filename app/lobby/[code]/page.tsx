"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLobbyPoll } from "@/lib/hooks/use-lobby-poll";

export default function LobbyPage() {
  const router = useRouter();
  const { state, error, isLoading } = useLobbyPoll();
  const [isNavigating, setIsNavigating] = useState(false);
  const [isTogglingReady, setIsTogglingReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [optimisticReady, setOptimisticReady] = useState<"ready" | "not-ready" | null>(null);

  useEffect(() => {
    if (
      state?.status === "in-progress" &&
      state.roomId &&
      state.roomId.length > 0 &&
      !isNavigating
    ) {
      setIsNavigating(true);
      router.push(`/game/${state.roomId}`);
    }
  }, [state, router, isNavigating]);

  // Clear optimistic state when poll returns fresh data
  useEffect(() => {
    if (state && optimisticReady !== null) {
      setOptimisticReady(null);
    }
  }, [state]);

  const handleToggleReady = async () => {
    if (isTogglingReady) return;
    setIsTogglingReady(true);

    // Optimistic update: flip ready state immediately
    if (state) {
      const currentPlayer = state.players.find(p => !p.isHost);
      // We don't reliably know which player we are from state alone, so just toggle
      setOptimisticReady(prev => {
        if (prev === "ready") return "not-ready";
        if (prev === "not-ready") return "ready";
        // First toggle — figure out current from state by finding the viewer
        // Since we can't identify ourselves from state directly, we'll just let the server response handle it
        return null;
      });
    }

    try {
      await fetch("/api/rooms/ready", { method: "POST" });
    } catch {
      // revert optimistic on failure
      setOptimisticReady(null);
    } finally {
      setIsTogglingReady(false);
    }
  };

  const handleLeave = async () => {
    const res = await fetch("/api/rooms/leave", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      window.location.href = "/";
    }
  };

  const handleStartGame = async () => {
    if (isStarting) return;
    setIsStarting(true);
    setStartError(null);

    try {
      const res = await fetch("/api/rooms/start", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        setStartError(data.error || "Failed to start game");
      }
    } catch {
      setStartError("Network error — please try again");
    } finally {
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="text-lg text-gray-400">Loading lobby...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-red-400 text-lg">{error}</p>
          <a href="/" className="text-blue-400 underline mt-4 inline-block">Back to home</a>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const isHost = state.players.some(p => p.isHost);
  const allNonHostReady = state.players.filter(p => !p.isHost).every(p => p.readyState === "ready");
  const canStart = isHost && state.players.length >= 2 && allNonHostReady && state.status === "waiting";

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {isNavigating && (
        <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-400 border-t-white" />
            <p className="text-white text-lg">Entering game...</p>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Lobby</h1>
          <div className="bg-gray-800 px-4 py-2 rounded-lg">
            <span className="text-sm text-gray-400">Room Code:</span>
            <span className="ml-2 font-mono text-lg font-bold">{state.roomCode}</span>
          </div>
        </div>

        {state.status === "in-progress" && !isNavigating && (
          <div className="bg-green-900/50 border border-green-700 rounded-lg p-3 mb-4 text-center">
            <p className="text-green-300 font-semibold">Game in progress!</p>
          </div>
        )}

        <div className="space-y-3 mb-6">
          <h2 className="text-lg font-semibold text-gray-300">Players ({state.players.length}/4)</h2>
          {state.players.map(player => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                player.status === "disconnected" ? "bg-gray-800/50 opacity-60" : "bg-gray-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{player.displayName}</span>
                {player.isHost && (
                  <span className="text-xs bg-yellow-600 text-yellow-100 px-2 py-0.5 rounded-full">
                    Host
                  </span>
                )}
                {player.status === "disconnected" && (
                  <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">
                    Disconnected
                  </span>
                )}
              </div>
              <div>
                {state.status === "waiting" && (
                  <span className={`text-sm px-2 py-1 rounded ${
                    player.readyState === "ready"
                      ? "bg-green-900 text-green-300"
                      : "bg-gray-700 text-gray-400"
                  }`}>
                    {player.readyState === "ready" ? "Ready" : "Not Ready"}
                  </span>
                )}
                {state.status === "in-progress" && player.turnPosition && (
                  <span className="text-sm text-gray-400">Turn #{player.turnPosition}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {state.status === "waiting" && (
          <div className="flex gap-3">
            <button
              onClick={handleToggleReady}
              disabled={isNavigating || isTogglingReady}
              className="flex-1 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              {isTogglingReady ? "Updating..." : "Toggle Ready"}
            </button>
            <button
              onClick={handleLeave}
              disabled={isNavigating}
              className="px-4 py-3 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              Leave
            </button>
          </div>
        )}

        {canStart && (
          <button
            onClick={handleStartGame}
            disabled={isNavigating || isStarting}
            className="w-full mt-3 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {isStarting ? "Starting..." : "Start Game"}
          </button>
        )}

        {startError && (
          <p className="mt-2 text-sm text-red-400 text-center">{startError}</p>
        )}
      </div>
    </div>
  );
}
