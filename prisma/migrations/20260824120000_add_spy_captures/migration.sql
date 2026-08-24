-- Multi-capture spy system migration
-- Removes captured/capturedByPlayerId from GameSpy
-- Adds SpyCapture join table so all 4 players can capture the same spy independently

-- Drop old columns from game_spies
ALTER TABLE "game_spies" DROP COLUMN IF EXISTS "captured";
ALTER TABLE "game_spies" DROP COLUMN IF EXISTS "capturedByPlayerId";

-- Create spy_captures table
CREATE TABLE "spy_captures" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "spyId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "captureOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spy_captures_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "spy_captures" ADD CONSTRAINT "spy_captures_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spy_captures" ADD CONSTRAINT "spy_captures_spyId_fkey" FOREIGN KEY ("spyId") REFERENCES "game_spies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add unique constraint: each player can capture each spy once
CREATE UNIQUE INDEX "spy_captures_spyId_playerId_key" ON "spy_captures"("spyId", "playerId");

-- Add index on roomId for fast lookups
CREATE INDEX "spy_captures_roomId_idx" ON "spy_captures"("roomId");
