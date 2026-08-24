"use client";

import Link from "next/link";
import { RulesContent } from "@/app/components/rules-content";

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Game Rules</h1>
          <Link
            href="/"
            className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-700 hover:bg-gray-600 transition"
          >
            &larr; Back to Menu
          </Link>
        </div>
        <RulesContent />
      </div>
    </div>
  );
}