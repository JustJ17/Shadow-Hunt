"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type {
  MapData,
  Region,
  TransportType,
} from "@/lib/map/types";

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface AdjacencyEdgeEntry {
  targetLocationId: string;
  isSameRegion: boolean;
  transport: TransportType;
}

export interface UseMapDataResult {
  data: MapData | null;
  error: string | null;
  isLoading: boolean;
  retry: () => void;
  idToName: (id: string) => string;
  idToCoordinates: (id: string) => Coordinates | null;
  idToRegion: (locationId: string) => Region | null;
  idToAdjacency: (locationId: string) => AdjacencyEdgeEntry[];
}

// Module-level cached data and promise singleton for request deduplication
let cachedPromise: Promise<MapData> | null = null;
let cachedData: MapData | null = null;

function fetchMapData(): Promise<MapData> {
  if (cachedData) return Promise.resolve(cachedData);
  if (cachedPromise) return cachedPromise;
  cachedPromise = fetch("/api/map")
    .then((res) => {
      if (!res.ok) throw new Error("Map fetch failed");
      return res.json();
    })
    .then((data: MapData) => {
      cachedData = data;
      return data;
    })
    .catch((err) => {
      cachedPromise = null;
      throw err;
    });
  return cachedPromise;
}

/**
 * Fetches and caches map data from GET /api/map.
 * Provides lookup functions for location names, coordinates, regions, and adjacency.
 * Deduplicates concurrent requests via a module-level promise singleton.
 */
export function useMapData(): UseMapDataResult {
  const [data, setData] = useState<MapData | null>(cachedData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedData);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchMapData()
      .then((mapData) => {
        setData(mapData);
        setError(null);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Map fetch failed";
        setError(message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cachedData) {
      load();
    }
  }, [load]);

  const retry = useCallback(() => {
    cachedPromise = null;
    cachedData = null;
    load();
  }, [load]);

  // Build lookup maps once data arrives
  const lookups = useMemo(() => {
    if (!data) {
      return {
        nameMap: new Map<string, string>(),
        coordMap: new Map<string, Coordinates>(),
        regionMap: new Map<string, Region>(),
        adjacencyMap: new Map<string, AdjacencyEdgeEntry[]>(),
      };
    }

    const nameMap = new Map<string, string>();
    const coordMap = new Map<string, Coordinates>();
    const regionMap = new Map<string, Region>();
    const adjacencyMap = new Map<string, AdjacencyEdgeEntry[]>();

    for (const region of data.regions) {
      for (const location of region.locations) {
        nameMap.set(location.id, location.name);
        coordMap.set(location.id, {
          latitude: location.latitude,
          longitude: location.longitude,
        });
        regionMap.set(location.id, {
          id: region.id,
          name: region.name,
          hubLocationId: region.hubLocationId,
        });
      }
    }

    for (const entry of data.adjacency) {
      adjacencyMap.set(entry.locationId, entry.edges);
    }

    return { nameMap, coordMap, regionMap, adjacencyMap };
  }, [data]);

  const idToName = useCallback(
    (id: string): string => {
      return lookups.nameMap.get(id) ?? "Unknown";
    },
    [lookups]
  );

  const idToCoordinates = useCallback(
    (id: string): Coordinates | null => {
      return lookups.coordMap.get(id) ?? null;
    },
    [lookups]
  );

  const idToRegion = useCallback(
    (id: string): Region | null => {
      return lookups.regionMap.get(id) ?? null;
    },
    [lookups]
  );

  const idToAdjacency = useCallback(
    (id: string): AdjacencyEdgeEntry[] => {
      return lookups.adjacencyMap.get(id) ?? [];
    },
    [lookups]
  );

  return {
    data,
    error,
    isLoading,
    retry,
    idToName,
    idToCoordinates,
    idToRegion,
    idToAdjacency,
  };
}
