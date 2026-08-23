-- AlterTable
ALTER TABLE "Room" ADD COLUMN "maxRoundLimit" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "game_results" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "winnerId" TEXT,
    "winLocationId" TEXT,
    "mastermindLocationId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_results_roomId_key" ON "game_results"("roomId");

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
