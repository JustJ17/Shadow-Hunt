"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CreateRoomForm } from "./components/create-room-form";
import { JoinRoomForm } from "./components/join-room-form";
import { PublicRoomBrowser } from "./components/public-room-browser";

type Tab = "create" | "join" | "browse";

interface ExistingRoom {
  roomCode: string;
  roomId: string;
  status: string;
}

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("create");
  const [existingRoom, setExistingRoom] = useState<ExistingRoom | null>(null);
  const [checking, setChecking] = useState(true);
  const [leaving, setLeaving] = useState(false);

  const checkExistingRoom = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/rooms/poll");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.state) {
          setExistingRoom({
            roomCode: data.state.roomCode,
            roomId: data.state.roomId,
            status: data.state.status,
          });
        } else {
          setExistingRoom(null);
        }
      } else {
        setExistingRoom(null);
      }
    } catch {
      setExistingRoom(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkExistingRoom();
  }, [checkExistingRoom]);

  const handleLeaveRoom = async () => {
    setLeaving(true);
    try {
      const res = await fetch("/api/rooms/leave", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setExistingRoom(null);
      }
    } catch {
      // ignore
    } finally {
      setLeaving(false);
    }
  };

  const handleRejoin = () => {
    if (existingRoom) {
      if (existingRoom.status === "in-progress") {
        router.push(`/game/${existingRoom.roomId}`);
      } else {
        router.push(`/lobby/${existingRoom.roomCode}`);
      }
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <p className="text-gray-400">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8">Shadow Hunt</h1>

        {existingRoom && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-300 mb-3">
              You're already in a {existingRoom.status === "in-progress" ? "game" : "lobby"}{" "}
              <span className="font-mono font-bold text-white">{existingRoom.roomCode}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRejoin}
                className="flex-1 py-2 rounded-md text-sm font-semibold bg-blue-600 hover:bg-blue-700 transition"
              >
                {existingRoom.status === "in-progress" ? "Rejoin Game" : "Rejoin Lobby"}
              </button>
              {existingRoom.status !== "in-progress" && (
                <button
                  onClick={handleLeaveRoom}
                  disabled={leaving}
                  className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-700 hover:bg-gray-600 transition disabled:opacity-50"
                >
                  {leaving ? "Leaving..." : "Leave"}
                </button>
              )}
            </div>
          </div>
        )}

        {!existingRoom && (
          <>
            <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab("create")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === "create"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Create
              </button>
              <button
                onClick={() => setActiveTab("join")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === "join"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Join
              </button>
              <button
                onClick={() => setActiveTab("browse")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === "browse"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Browse
              </button>
            </div>

            <div className="rounded-lg p-6">
              {activeTab === "create" && <CreateRoomForm />}
              {activeTab === "join" && <JoinRoomForm />}
              {activeTab === "browse" && <PublicRoomBrowser />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
