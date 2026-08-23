export interface MapPoint {
  x: number;
  y: number;
}

/**
 * Equirectangular projection: maps (latitude, longitude) to SVG viewBox coordinates.
 * ViewBox: 0 0 1000 500
 */
export function projectToMap(latitude: number, longitude: number): MapPoint {
  return {
    x: ((longitude + 180) / 360) * 1000,
    y: ((90 - latitude) / 180) * 500,
  };
}
