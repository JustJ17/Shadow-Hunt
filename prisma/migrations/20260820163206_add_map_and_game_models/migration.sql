-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hubLocationId" TEXT,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "isHub" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjacencies" (
    "id" TEXT NOT NULL,
    "locationAId" TEXT NOT NULL,
    "locationBId" TEXT NOT NULL,
    "isSameRegion" BOOLEAN NOT NULL,

    CONSTRAINT "adjacencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_threats" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_threats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_spies" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "captured" BOOLEAN NOT NULL DEFAULT false,
    "capturedByPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_spies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "regions_hubLocationId_key" ON "regions"("hubLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE INDEX "locations_regionId_idx" ON "locations"("regionId");

-- CreateIndex
CREATE INDEX "adjacencies_locationAId_idx" ON "adjacencies"("locationAId");

-- CreateIndex
CREATE INDEX "adjacencies_locationBId_idx" ON "adjacencies"("locationBId");

-- CreateIndex
CREATE UNIQUE INDEX "adjacencies_locationAId_locationBId_key" ON "adjacencies"("locationAId", "locationBId");

-- CreateIndex
CREATE UNIQUE INDEX "game_threats_roomId_key" ON "game_threats"("roomId");

-- CreateIndex
CREATE INDEX "game_spies_roomId_idx" ON "game_spies"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "game_spies_roomId_regionId_key" ON "game_spies"("roomId", "regionId");

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_hubLocationId_fkey" FOREIGN KEY ("hubLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjacencies" ADD CONSTRAINT "adjacencies_locationAId_fkey" FOREIGN KEY ("locationAId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjacencies" ADD CONSTRAINT "adjacencies_locationBId_fkey" FOREIGN KEY ("locationBId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_threats" ADD CONSTRAINT "game_threats_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_threats" ADD CONSTRAINT "game_threats_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_spies" ADD CONSTRAINT "game_spies_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_spies" ADD CONSTRAINT "game_spies_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
