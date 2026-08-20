"use client";

import { useState } from "react";

export function CreateRoomForm() {
  const [displayName, setDisplayName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, visibility }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.href = `/lobby/${data.roomCode}`;
      } else {
        setError(data.error || "Failed to create room");
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
        <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-1">
          Display Name
        </label>
        <input
          id="displayName"
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
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Visibility
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setVisibility("private")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              visibility === "private"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Private
          </button>
          <button
            type="button"
            onClick={() => setVisibility("public")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              visibility === "public"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Public
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isLoading ? "Creating..." : "Create Room"}
      </button>
    </form>
  );
}
