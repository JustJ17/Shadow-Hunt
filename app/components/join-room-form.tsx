"use client";

import { useState } from "react";

export function JoinRoomForm() {
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, roomCode: roomCode.toUpperCase() }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.href = `/lobby/${data.state.roomCode}`;
      } else {
        setError(data.error || "Failed to join room");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="joinDisplayName" className="block text-sm font-medium text-gray-300 mb-1">
          Display Name
        </label>
        <input
          id="joinDisplayName"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Enter your name"
          maxLength={30}
          required
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label htmlFor="roomCode" className="block text-sm font-medium text-gray-300 mb-1">
          Room Code
        </label>
        <input
          id="roomCode"
          type="text"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          placeholder="e.g. ABC123"
          maxLength={6}
          required
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 uppercase font-mono tracking-wider"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isLoading ? "Joining..." : "Join Room"}
      </button>
    </form>
  );
}
