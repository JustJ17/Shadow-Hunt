-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomPlayer" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" VARCHAR(30) NOT NULL,
    "roomId" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "readyState" TEXT NOT NULL DEFAULT 'not-ready',
    "status" TEXT NOT NULL DEFAULT 'connected',
    "turnPosition" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),

    CONSTRAINT "RoomPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_status_visibility_playerCount_idx" ON "Room"("status", "visibility", "playerCount");

-- CreateIndex
CREATE INDEX "Room_code_idx" ON "Room"("code");

-- CreateIndex
CREATE INDEX "RoomPlayer_roomId_status_idx" ON "RoomPlayer"("roomId", "status");

-- CreateIndex
CREATE INDEX "RoomPlayer_lastActivityAt_idx" ON "RoomPlayer"("lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPlayer_playerId_roomId_key" ON "RoomPlayer"("playerId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPlayer_playerId_key" ON "RoomPlayer"("playerId");

-- AddForeignKey
ALTER TABLE "RoomPlayer" ADD CONSTRAINT "RoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
