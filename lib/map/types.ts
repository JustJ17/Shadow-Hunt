export interface Region {
  id: string;
  name: string;
  hubLocationId: string;
}

export interface Location {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
}

export interface AdjacencyEdge {
  id: string;
  locationAId: string;
  locationBId: string;
  isSameRegion: boolean;
}

export interface RegionWithLocations extends Region {
  locations: Location[];
}

export interface MapData {
  regions: RegionWithLocations[];
  adjacency: AdjacencyListEntry[];
}

export interface AdjacencyListEntry {
  locationId: string;
  adjacentLocationIds: string[];
  edges: { targetLocationId: string; isSameRegion: boolean }[];
}
