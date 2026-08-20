"use client";

import { useState } from "react";
import { CreateRoomForm } from "./components/create-room-form";
import { JoinRoomForm } from "./components/join-room-form";
import { PublicRoomBrowser } from "./components/public-room-browser";

type Tab = "create" | "join" | "browse";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("create");

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8">Shadow Hunt</h1>

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

        <div className="bg-gray-850 rounded-lg p-6">
          {activeTab === "create" && <CreateRoomForm />}
          {activeTab === "join" && <JoinRoomForm />}
          {activeTab === "browse" && <PublicRoomBrowser />}
        </div>
      </div>
    </div>
  );
}
