"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLobbyPoll } from "@/lib/hooks/use-lobby-poll";

export default function LobbyPage() {
  const router = useRouter();
  const { state, error, isLoading } = useLobbyPoll();
  const [isNavigating, setIsNavigating] = useState(false);

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

  const handleToggleReady = async () => {
    await fetch("/api/rooms/ready", { method: "POST" });
  };

  const handleLeave = async () => {
    const res = await fetch("/api/rooms/leave", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      window.location.href = "/";
    }
  };

  const handleStartGame = async () => {
    await fetch("/api/rooms/start", { method: "POST" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-400">Loading lobby...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-400 text-lg">{error}</p>
          <a href="/" className="text-blue-400 underline mt-4 inline-block">Back to home</a>
        </div>
      </div>
    );
  }

  if (!state) return null;

  // Determine if current user is host (we know the current player because they have the cookie)
  // For simplicity, we check the hostId against the players list
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
              disabled={isNavigating}
              className="flex-1 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              Toggle Ready
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
            disabled={isNavigating}
            className="w-full mt-3 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 transition disabled:opacity-50 disabled:pointer-events-none"
          >
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}
