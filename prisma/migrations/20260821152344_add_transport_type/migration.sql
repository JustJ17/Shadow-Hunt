-- Step 1: Create the TransportType enum
CREATE TYPE "TransportType" AS ENUM ('plane', 'car', 'boat');

-- Step 2: Add nullable transport column
ALTER TABLE "adjacencies" ADD COLUMN "transport" "TransportType";

-- Step 3: Backfill all 72 rows with correct transport values

-- 3a: Set all inter-region edges (isSameRegion = false) to 'plane' (17 edges)
UPDATE "adjacencies" SET "transport" = 'plane' WHERE "isSameRegion" = false;

-- 3b: Backfill intra-region boat edges using location name pairs
-- Since edges use canonical ordering (locationAId < locationBId by CUID),
-- we check BOTH orderings in the WHERE clause.

-- Europe boat edges (4): London-Paris, London-Madrid, London-Berlin, Rome-Athens
UPDATE "adjacencies" a SET "transport" = 'boat'
FROM "locations" la, "locations" lb
WHERE a."locationAId" = la."id" AND a."locationBId" = lb."id"
AND a."isSameRegion" = true
AND (
  (la."name" = 'London' AND lb."name" = 'Paris') OR (la."name" = 'Paris' AND lb."name" = 'London') OR
  (la."name" = 'London' AND lb."name" = 'Madrid') OR (la."name" = 'Madrid' AND lb."name" = 'London') OR
  (la."name" = 'London' AND lb."name" = 'Berlin') OR (la."name" = 'Berlin' AND lb."name" = 'London') OR
  (la."name" = 'Rome' AND lb."name" = 'Athens') OR (la."name" = 'Athens' AND lb."name" = 'Rome')
);

-- Asia boat edges (7): Tokyo-Seoul, Tokyo-Beijing, Tokyo-Manila, Seoul-Beijing, Hanoi-Manila, Bangkok-Jakarta, Jakarta-Manila
UPDATE "adjacencies" a SET "transport" = 'boat'
FROM "locations" la, "locations" lb
WHERE a."locationAId" = la."id" AND a."locationBId" = lb."id"
AND a."isSameRegion" = true
AND (
  (la."name" = 'Tokyo' AND lb."name" = 'Seoul') OR (la."name" = 'Seoul' AND lb."name" = 'Tokyo') OR
  (la."name" = 'Tokyo' AND lb."name" = 'Beijing') OR (la."name" = 'Beijing' AND lb."name" = 'Tokyo') OR
  (la."name" = 'Tokyo' AND lb."name" = 'Manila') OR (la."name" = 'Manila' AND lb."name" = 'Tokyo') OR
  (la."name" = 'Seoul' AND lb."name" = 'Beijing') OR (la."name" = 'Beijing' AND lb."name" = 'Seoul') OR
  (la."name" = 'Hanoi' AND lb."name" = 'Manila') OR (la."name" = 'Manila' AND lb."name" = 'Hanoi') OR
  (la."name" = 'Bangkok' AND lb."name" = 'Jakarta') OR (la."name" = 'Jakarta' AND lb."name" = 'Bangkok') OR
  (la."name" = 'Jakarta' AND lb."name" = 'Manila') OR (la."name" = 'Manila' AND lb."name" = 'Jakarta')
);

-- Africa boat edges (2): Casablanca-Accra, Lagos-Cape Town
UPDATE "adjacencies" a SET "transport" = 'boat'
FROM "locations" la, "locations" lb
WHERE a."locationAId" = la."id" AND a."locationBId" = lb."id"
AND a."isSameRegion" = true
AND (
  (la."name" = 'Casablanca' AND lb."name" = 'Accra') OR (la."name" = 'Accra' AND lb."name" = 'Casablanca') OR
  (la."name" = 'Lagos' AND lb."name" = 'Cape Town') OR (la."name" = 'Cape Town' AND lb."name" = 'Lagos')
);

-- North America boat edges (3): Washington D.C.-Havana, Havana-Mexico City, Havana-Panama City
UPDATE "adjacencies" a SET "transport" = 'boat'
FROM "locations" la, "locations" lb
WHERE a."locationAId" = la."id" AND a."locationBId" = lb."id"
AND a."isSameRegion" = true
AND (
  (la."name" = 'Washington D.C.' AND lb."name" = 'Havana') OR (la."name" = 'Havana' AND lb."name" = 'Washington D.C.') OR
  (la."name" = 'Havana' AND lb."name" = 'Mexico City') OR (la."name" = 'Mexico City' AND lb."name" = 'Havana') OR
  (la."name" = 'Havana' AND lb."name" = 'Panama City') OR (la."name" = 'Panama City' AND lb."name" = 'Havana')
);

-- South America boat edges (1): Brasília-Bogotá
UPDATE "adjacencies" a SET "transport" = 'boat'
FROM "locations" la, "locations" lb
WHERE a."locationAId" = la."id" AND a."locationBId" = lb."id"
AND a."isSameRegion" = true
AND (
  (la."name" = 'Brasília' AND lb."name" = 'Bogotá') OR (la."name" = 'Bogotá' AND lb."name" = 'Brasília')
);

-- Oceania boat edges (4): Canberra-Auckland, Canberra-Wellington, Canberra-Suva, Auckland-Suva
UPDATE "adjacencies" a SET "transport" = 'boat'
FROM "locations" la, "locations" lb
WHERE a."locationAId" = la."id" AND a."locationBId" = lb."id"
AND a."isSameRegion" = true
AND (
  (la."name" = 'Canberra' AND lb."name" = 'Auckland') OR (la."name" = 'Auckland' AND lb."name" = 'Canberra') OR
  (la."name" = 'Canberra' AND lb."name" = 'Wellington') OR (la."name" = 'Wellington' AND lb."name" = 'Canberra') OR
  (la."name" = 'Canberra' AND lb."name" = 'Suva') OR (la."name" = 'Suva' AND lb."name" = 'Canberra') OR
  (la."name" = 'Auckland' AND lb."name" = 'Suva') OR (la."name" = 'Suva' AND lb."name" = 'Auckland')
);

-- 3c: All remaining intra-region edges (not yet set) get 'car' (34 edges)
UPDATE "adjacencies" SET "transport" = 'car' WHERE "isSameRegion" = true AND "transport" IS NULL;

-- Step 4: Apply NOT NULL constraint
ALTER TABLE "adjacencies" ALTER COLUMN "transport" SET NOT NULL;
