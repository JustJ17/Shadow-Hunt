/*
  Warnings:

  - You are about to drop the column `currentSlot` on the `game_turns` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "game_turns" DROP COLUMN "currentSlot",
ADD COLUMN     "actionBudget" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "actionsRemaining" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "isExtraTurn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "player_positions" ADD COLUMN     "actionPenaltyFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendingExtraTurns" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "blockades" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "transportType" TEXT NOT NULL,
    "casterPlayerId" TEXT NOT NULL,
    "creationRound" INTEGER NOT NULL,
    "casterTurnPosition" INTEGER NOT NULL,
    "lifted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "blockades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_clues" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cardIdentifier" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "originLocationId" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_clues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blockades_roomId_lifted_idx" ON "blockades"("roomId", "lifted");

-- CreateIndex
CREATE INDEX "pending_clues_roomId_roundNumber_resolved_idx" ON "pending_clues"("roomId", "roundNumber", "resolved");

-- AddForeignKey
ALTER TABLE "blockades" ADD CONSTRAINT "blockades_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_clues" ADD CONSTRAINT "pending_clues_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
