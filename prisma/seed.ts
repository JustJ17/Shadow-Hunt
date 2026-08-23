import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const MAP_DATA = {
  regions: [
    {
      name: "Europe",
      hub: "London",
      locations: [
        { name: "London", latitude: 51.5074, longitude: -0.1278 },
        { name: "Paris", latitude: 48.8566, longitude: 2.3522 },
        { name: "Berlin", latitude: 52.5200, longitude: 13.4050 },
        { name: "Rome", latitude: 41.9028, longitude: 12.4964 },
        { name: "Madrid", latitude: 40.4168, longitude: -3.7038 },
        { name: "Vienna", latitude: 48.2082, longitude: 16.3738 },
        { name: "Warsaw", latitude: 52.2297, longitude: 21.0122 },
        { name: "Athens", latitude: 37.9838, longitude: 23.7275 },
      ],
    },
    {
      name: "Asia",
      hub: "Tokyo",
      locations: [
        { name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
        { name: "Beijing", latitude: 39.9042, longitude: 116.4074 },
        { name: "Seoul", latitude: 37.5665, longitude: 126.9780 },
        { name: "Bangkok", latitude: 13.7563, longitude: 100.5018 },
        { name: "New Delhi", latitude: 28.6139, longitude: 77.2090 },
        { name: "Jakarta", latitude: -6.2088, longitude: 106.8456 },
        { name: "Manila", latitude: 14.5995, longitude: 120.9842 },
        { name: "Hanoi", latitude: 21.0285, longitude: 105.8542 },
      ],
    },
    {
      name: "Africa",
      hub: "Cairo",
      locations: [
        { name: "Cairo", latitude: 30.0444, longitude: 31.2357 },
        { name: "Nairobi", latitude: -1.2921, longitude: 36.8219 },
        { name: "Lagos", latitude: 6.5244, longitude: 3.3792 },
        { name: "Pretoria", latitude: -25.7479, longitude: 28.2293 },
        { name: "Accra", latitude: 5.6037, longitude: -0.1870 },
        { name: "Addis Ababa", latitude: 9.0320, longitude: 38.7469 },
        { name: "Casablanca", latitude: 33.5731, longitude: -7.5898 },
        { name: "Dar es Salaam", latitude: -6.7924, longitude: 39.2083 },
        { name: "Cape Town", latitude: -33.9249, longitude: 18.4241 },
      ],
    },
    {
      name: "North America",
      hub: "Washington D.C.",
      locations: [
        { name: "Washington D.C.", latitude: 38.9072, longitude: -77.0369 },
        { name: "Ottawa", latitude: 45.4215, longitude: -75.6972 },
        { name: "Mexico City", latitude: 19.4326, longitude: -99.1332 },
        { name: "Havana", latitude: 23.1136, longitude: -82.3666 },
        { name: "Panama City", latitude: 8.9824, longitude: -79.5199 },
        { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
      ],
    },
    {
      name: "South America",
      hub: "Brasília",
      locations: [
        { name: "Brasília", latitude: -15.8267, longitude: -47.9218 },
        { name: "Buenos Aires", latitude: -34.6037, longitude: -58.3816 },
        { name: "Lima", latitude: -12.0464, longitude: -77.0428 },
        { name: "Bogotá", latitude: 4.7110, longitude: -74.0721 },
        { name: "Santiago", latitude: -33.4489, longitude: -70.6693 },
      ],
    },
    {
      name: "Oceania",
      hub: "Canberra",
      locations: [
        { name: "Canberra", latitude: -35.2809, longitude: 149.1300 },
        { name: "Wellington", latitude: -41.2865, longitude: 174.7762 },
        { name: "Suva", latitude: -18.1248, longitude: 178.4501 },
        { name: "Auckland", latitude: -36.8485, longitude: 174.7633 },
      ],
    },
  ],
  intraRegionEdges: [
    // Europe (14)
    ["London", "Paris", "boat"], ["London", "Madrid", "boat"], ["London", "Berlin", "boat"], ["Paris", "Madrid", "car"],
    ["Paris", "Berlin", "car"], ["Paris", "Rome", "car"], ["Paris", "Vienna", "car"], ["Berlin", "Warsaw", "car"],
    ["Berlin", "Vienna", "car"], ["Warsaw", "Vienna", "car"], ["Vienna", "Rome", "car"], ["Vienna", "Athens", "car"],
    ["Rome", "Athens", "boat"], ["Rome", "Madrid", "car"],
    // Asia (11)
    ["Tokyo", "Seoul", "boat"], ["Tokyo", "Beijing", "boat"], ["Tokyo", "Manila", "boat"], ["Seoul", "Beijing", "boat"],
    ["Beijing", "Hanoi", "car"], ["Beijing", "New Delhi", "car"], ["Hanoi", "Bangkok", "car"], ["Hanoi", "Manila", "boat"],
    ["Bangkok", "New Delhi", "car"], ["Bangkok", "Jakarta", "boat"], ["Jakarta", "Manila", "boat"],
    // Africa (11)
    ["Cairo", "Addis Ababa", "car"], ["Cairo", "Casablanca", "car"], ["Cairo", "Nairobi", "car"],
    ["Casablanca", "Accra", "boat"], ["Accra", "Lagos", "car"], ["Lagos", "Nairobi", "car"],
    ["Lagos", "Cape Town", "boat"], ["Addis Ababa", "Nairobi", "car"], ["Nairobi", "Dar es Salaam", "car"],
    ["Dar es Salaam", "Pretoria", "car"], ["Pretoria", "Cape Town", "car"],
    // North America (8)
    ["Washington D.C.", "Toronto", "car"], ["Washington D.C.", "Ottawa", "car"], ["Washington D.C.", "Havana", "boat"],
    ["Washington D.C.", "Mexico City", "car"], ["Ottawa", "Toronto", "car"], ["Havana", "Mexico City", "boat"],
    ["Havana", "Panama City", "boat"], ["Mexico City", "Panama City", "car"],
    // South America (6)
    ["Brasília", "Bogotá", "boat"], ["Brasília", "Buenos Aires", "car"], ["Brasília", "Lima", "car"],
    ["Bogotá", "Lima", "car"], ["Lima", "Santiago", "car"], ["Buenos Aires", "Santiago", "car"],
    // Oceania (5)
    ["Canberra", "Auckland", "boat"], ["Canberra", "Wellington", "boat"], ["Canberra", "Suva", "boat"],
    ["Auckland", "Wellington", "car"], ["Auckland", "Suva", "boat"],
  ] as [string, string, "car" | "boat"][],
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
        for (const location of region.locations) {
          const isHub = location.name === region.hub;
          const record = await tx.location.upsert({
            where: { name: location.name },
            update: {
              isHub,
              regionId: regionRecords[region.name],
              latitude: location.latitude,
              longitude: location.longitude,
            },
            create: {
              name: location.name,
              regionId: regionRecords[region.name],
              isHub,
              latitude: location.latitude,
              longitude: location.longitude,
            },
          });
          locationRecords[location.name] = record.id;
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
      for (const [nameA, nameB, transportType] of MAP_DATA.intraRegionEdges) {
        const idA = locationRecords[nameA];
        const idB = locationRecords[nameB];

        // Enforce canonical ordering: locationAId < locationBId lexicographically
        const [locationAId, locationBId] = idA < idB ? [idA, idB] : [idB, idA];

        await tx.adjacency.upsert({
          where: {
            locationAId_locationBId: { locationAId, locationBId },
          },
          update: { isSameRegion: true, transport: transportType },
          create: {
            locationAId,
            locationBId,
            isSameRegion: true,
            transport: transportType,
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
          update: { isSameRegion: false, transport: "plane" },
          create: {
            locationAId,
            locationBId,
            isSameRegion: false,
            transport: "plane",
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
