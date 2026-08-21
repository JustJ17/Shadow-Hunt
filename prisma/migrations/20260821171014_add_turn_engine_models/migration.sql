-- CreateTable
CREATE TABLE "game_turns" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "currentPlayerId" TEXT NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "currentSlot" INTEGER NOT NULL DEFAULT 1,
    "captureAttemptFlag" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_positions" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "skipNextTurn" BOOLEAN NOT NULL DEFAULT false,
    "pendingRewardRegionId" TEXT,
    "pendingRewardCaptureOrder" INTEGER,

    CONSTRAINT "player_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_entries" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "regionId" TEXT,
    "roundNumber" INTEGER NOT NULL,
    "stepsAway" INTEGER,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_events" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_cards" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_turns_roomId_key" ON "game_turns"("roomId");

-- CreateIndex
CREATE INDEX "player_positions_roomId_idx" ON "player_positions"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "player_positions_roomId_playerId_key" ON "player_positions"("roomId", "playerId");

-- CreateIndex
CREATE INDEX "notebook_entries_roomId_playerId_idx" ON "notebook_entries"("roomId", "playerId");

-- CreateIndex
CREATE INDEX "game_events_roomId_sequenceNumber_idx" ON "game_events"("roomId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "game_events_roomId_sequenceNumber_key" ON "game_events"("roomId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "action_cards_roomId_playerId_idx" ON "action_cards"("roomId", "playerId");

-- AddForeignKey
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_positions" ADD CONSTRAINT "player_positions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_positions" ADD CONSTRAINT "player_positions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_entries" ADD CONSTRAINT "notebook_entries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_cards" ADD CONSTRAINT "action_cards_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
