import { prisma } from "@/lib/prisma";
import type { Location, RegionWithLocations } from "@/lib/map/types";

/**
 * Returns all locations belonging to a given region.
 */
export async function getLocationsByRegion(
  regionId: string
): Promise<Location[]> {
  const locations = await prisma.location.findMany({
    where: { regionId },
  });

  return locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    regionId: loc.regionId,
    isHub: loc.isHub,
    latitude: loc.latitude,
    longitude: loc.longitude,
  }));
}

/**
 * Returns all regions with their locations included.
 */
export async function getAllRegions(): Promise<RegionWithLocations[]> {
  const regions = await prisma.region.findMany({
    include: { locations: true },
  });

  return regions.map((region) => ({
    id: region.id,
    name: region.name,
    hubLocationId: region.hubLocationId!,
    locations: region.locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      regionId: loc.regionId,
      isHub: loc.isHub,
      latitude: loc.latitude,
      longitude: loc.longitude,
    })),
  }));
}
