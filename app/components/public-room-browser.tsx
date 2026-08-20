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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRooms = async () => {
    try {
      const res = await fetch("/api/rooms/public");
      const data = await res.json();
      setRooms(data.rooms || []);
      setError(null);
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

  if (isLoading) {
    return <p className="text-gray-400">Loading public rooms...</p>;
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No public rooms available</p>
        <p className="text-gray-600 text-sm mt-1">Create one or wait for others to make a room public</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rooms.map(room => (
        <div key={room.roomCode} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
          <div>
            <p className="font-medium">{room.hostName}&apos;s Room</p>
            <p className="text-sm text-gray-400">{room.playerCount}/4 players · {room.roomCode}</p>
          </div>
          <a
            href={`/lobby/${room.roomCode}`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
          >
            Join
          </a>
        </div>
      ))}
    </div>
  );
}
