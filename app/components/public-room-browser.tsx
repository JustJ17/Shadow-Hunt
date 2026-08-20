"use client";

import { useState, useEffect, useRef } from "react";

interface PublicRoom {
  roomCode: string;
  hostName: string;
  playerCount: number;
}

export function PublicRoomBrowser() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [joiningCode, setJoiningCode] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRooms = async () => {
    try {
      const res = await fetch("/api/rooms/public");
      const data = await res.json();
      setRooms(data.rooms || []);
      if (!error || error === "Failed to load rooms") setError(null);
    } catch {
      setError("Failed to load rooms");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    intervalRef.current = setInterval(fetchRooms, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleJoin = async (roomCode: string) => {
    if (!displayName.trim()) {
      setError("Please enter a display name first");
      return;
    }

    setError(null);
    setJoiningCode(roomCode);

    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), roomCode }),
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
      setJoiningCode(null);
    }
  };

  if (isLoading) {
    return <p className="text-gray-400">Loading public rooms...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="browseDisplayName" className="block text-sm font-medium text-gray-300 mb-1">
          Your Display Name
        </label>
        <input
          id="browseDisplayName"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Enter your name to join"
          maxLength={30}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {rooms.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No public rooms available</p>
          <p className="text-gray-600 text-sm mt-1">Create one or wait for others to make a room public</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <div key={room.roomCode} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
              <div>
                <p className="font-medium">{room.hostName}&apos;s Room</p>
                <p className="text-sm text-gray-400">{room.playerCount}/4 players · {room.roomCode}</p>
              </div>
              <button
                onClick={() => handleJoin(room.roomCode)}
                disabled={joiningCode === room.roomCode}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
              >
                {joiningCode === room.roomCode ? "Joining..." : "Join"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
