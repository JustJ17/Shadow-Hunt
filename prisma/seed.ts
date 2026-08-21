import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const MAP_DATA = {
  regions: [
    { name: "Europe", hub: "London", locations: ["London", "Paris", "Berlin", "Rome", "Madrid", "Vienna", "Warsaw", "Athens"] },
    { name: "Asia", hub: "Tokyo", locations: ["Tokyo", "Beijing", "Seoul", "Bangkok", "New Delhi", "Jakarta", "Manila", "Hanoi"] },
    { name: "Africa", hub: "Cairo", locations: ["Cairo", "Nairobi", "Lagos", "Pretoria", "Accra", "Addis Ababa", "Casablanca", "Dar es Salaam", "Cape Town"] },
    { name: "North America", hub: "Washington D.C.", locations: ["Washington D.C.", "Ottawa", "Mexico City", "Havana", "Panama City", "Toronto"] },
    { name: "South America", hub: "Brasília", locations: ["Brasília", "Buenos Aires", "Lima", "Bogotá", "Santiago"] },
    { name: "Oceania", hub: "Canberra", locations: ["Canberra", "Wellington", "Suva", "Auckland"] },
  ],
  intraRegionEdges: [
    // Europe (14)
    ["London", "Paris"], ["London", "Madrid"], ["London", "Berlin"], ["Paris", "Madrid"],
    ["Paris", "Berlin"], ["Paris", "Rome"], ["Paris", "Vienna"], ["Berlin", "Warsaw"],
    ["Berlin", "Vienna"], ["Warsaw", "Vienna"], ["Vienna", "Rome"], ["Vienna", "Athens"],
    ["Rome", "Athens"], ["Rome", "Madrid"],
    // Asia (11)
    ["Tokyo", "Seoul"], ["Tokyo", "Beijing"], ["Tokyo", "Manila"], ["Seoul", "Beijing"],
    ["Beijing", "Hanoi"], ["Beijing", "New Delhi"], ["Hanoi", "Bangkok"], ["Hanoi", "Manila"],
    ["Bangkok", "New Delhi"], ["Bangkok", "Jakarta"], ["Jakarta", "Manila"],
    // Africa (11)
    ["Cairo", "Addis Ababa"], ["Cairo", "Casablanca"], ["Cairo", "Nairobi"],
    ["Casablanca", "Accra"], ["Accra", "Lagos"], ["Lagos", "Nairobi"],
    ["Lagos", "Cape Town"], ["Addis Ababa", "Nairobi"], ["Nairobi", "Dar es Salaam"],
    ["Dar es Salaam", "Pretoria"], ["Pretoria", "Cape Town"],
    // North America (8)
    ["Washington D.C.", "Toronto"], ["Washington D.C.", "Ottawa"], ["Washington D.C.", "Havana"],
    ["Washington D.C.", "Mexico City"], ["Ottawa", "Toronto"], ["Havana", "Mexico City"],
    ["Havana", "Panama City"], ["Mexico City", "Panama City"],
    // South America (6)
    ["Brasília", "Bogotá"], ["Brasília", "Buenos Aires"], ["Brasília", "Lima"],
    ["Bogotá", "Lima"], ["Lima", "Santiago"], ["Buenos Aires", "Santiago"],
    // Oceania (5)
    ["Canberra", "Auckland"], ["Canberra", "Wellington"], ["Canberra", "Suva"],
    ["Auckland", "Wellington"], ["Auckland", "Suva"],
  ] as [string, string][],
  interRegionEdges: [
    // Hub-to-Hub (7)
    ["London", "Tokyo"], ["London", "Cairo"], ["London", "Washington D.C."],
    ["Tokyo", "Cairo"], ["Tokyo", "Canberra"], ["Cairo", "Brasília"],
    ["Washington D.C.", "Brasília"],
    // Non-Hub (10)
    ["Madrid", "Casablanca"], ["Athens", "Cairo"], ["New Delhi", "Cairo"],
    ["Panama City", "Bogotá"], ["Jakarta", "Canberra"], ["Cape Town", "Brasília"],
    ["Auckland", "Santiago"], ["Tokyo", "Mexico City"], ["Beijing", "Toronto"],
    ["Suva", "Manila"],
  ] as [string, string][],
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$transaction(async (tx) => {
      // Step 1: Upsert all regions (without hubLocationId initially)

      const regionRecords: Record<string, string> = {};
      for (const region of MAP_DATA.regions) {
        const record = await tx.region.upsert({
          where: { name: region.name },
          update: {},
          create: { name: region.name },
        });
        regionRecords[region.name] = record.id;
      }

      // Step 2: Upsert all locations
      const locationRecords: Record<string, string> = {};
      for (const region of MAP_DATA.regions) {
        for (const locationName of region.locations) {
          const isHub = locationName === region.hub;
          const record = await tx.location.upsert({
            where: { name: locationName },
            update: { isHub, regionId: regionRecords[region.name] },
            create: {
              name: locationName,
              regionId: regionRecords[region.name],
              isHub,
            },
          });
          locationRecords[locationName] = record.id;
        }
      }

      // Step 3: Update each region's hubLocationId to point to its hub location
      for (const region of MAP_DATA.regions) {
        const hubLocationId = locationRecords[region.hub];
        await tx.region.update({
          where: { id: regionRecords[region.name] },
          data: { hubLocationId },
        });
      }

      // Step 4: Upsert intra-region adjacency edges (isSameRegion = true)
      for (const [nameA, nameB] of MAP_DATA.intraRegionEdges) {
        const idA = locationRecords[nameA];
        const idB = locationRecords[nameB];

        // Enforce canonical ordering: locationAId < locationBId lexicographically
        const [locationAId, locationBId] = idA < idB ? [idA, idB] : [idB, idA];

        await tx.adjacency.upsert({
          where: {
            locationAId_locationBId: { locationAId, locationBId },
          },
          update: { isSameRegion: true },
          create: {
            locationAId,
            locationBId,
            isSameRegion: true,
          },
        });
      }

      // Step 5: Upsert inter-region adjacency edges (isSameRegion = false)
      for (const [nameA, nameB] of MAP_DATA.interRegionEdges) {
        const idA = locationRecords[nameA];
        const idB = locationRecords[nameB];

        // Enforce canonical ordering: locationAId < locationBId lexicographically
        const [locationAId, locationBId] = idA < idB ? [idA, idB] : [idB, idA];

        await tx.adjacency.upsert({
          where: {
            locationAId_locationBId: { locationAId, locationBId },
          },
          update: { isSameRegion: false },
          create: {
            locationAId,
            locationBId,
            isSameRegion: false,
          },
        });
      }

      console.log("Seed completed successfully:");
      console.log(`  Regions: ${Object.keys(regionRecords).length}`);
      console.log(`  Locations: ${Object.keys(locationRecords).length}`);
      console.log(`  Intra-region edges: ${MAP_DATA.intraRegionEdges.length}`);
      console.log(`  Inter-region edges: ${MAP_DATA.interRegionEdges.length}`);
      console.log(`  Total edges: ${MAP_DATA.intraRegionEdges.length + MAP_DATA.interRegionEdges.length}`);
    }, { maxWait: 30000, timeout: 60000 });
  } catch (error) {
    console.error("Seed failed, all changes rolled back:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
