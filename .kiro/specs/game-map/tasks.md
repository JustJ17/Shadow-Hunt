# Implementation Plan: Game Map

## Overview

Implement the interactive SVG world map for Shadow Hunt's in-game screen. This covers schema changes for coordinates, projection logic, a client-side map data hook, the SVG map component with continent paths and region tinting, route rendering per transport type, city markers, animated player tokens, and zoom/pan controls. Zero new dependencies — inline SVG + Tailwind + CSS transitions only.

## Tasks

- [x] 1. Schema + Seed: Add coordinates to Location model
  - [x] 1.1 Add `latitude Float` and `longitude Float` fields to the `Location` model in `prisma/schema.prisma`
    - Add both fields as non-nullable Float columns
    - Keep all existing fields and relations unchanged
    - _Requirements: 1.1_

  - [x] 1.2 Generate Prisma migration
    - Run `npx prisma migrate dev --name add-location-coordinates`
    - Verify generated SQL adds two non-nullable float columns to `locations` table
    - _Requirements: 1.4_

  - [x] 1.3 Update seed script with coordinates for all 40 cities
    - Extend `MAP_DATA.regions[].locations` from string arrays to `{ name, latitude, longitude }` objects
    - Add real-world coordinates: Europe (London 51.5074/-0.1278, Paris 48.8566/2.3522, Berlin 52.5200/13.4050, Rome 41.9028/12.4964, Madrid 40.4168/-3.7038, Vienna 48.2082/16.3738, Warsaw 52.2297/21.0122, Athens 37.9838/23.7275), Asia (Tokyo 35.6762/139.6503, Beijing 39.9042/116.4074, Seoul 37.5665/126.9780, Bangkok 13.7563/100.5018, New Delhi 28.6139/77.2090, Jakarta -6.2088/106.8456, Manila 14.5995/120.9842, Hanoi 21.0285/105.8542), Africa (Cairo 30.0444/31.2357, Nairobi -1.2921/36.8219, Lagos 6.5244/3.3792, Pretoria -25.7479/28.2293, Accra 5.6037/-0.1870, Addis Ababa 9.0320/38.7469, Casablanca 33.5731/-7.5898, Dar es Salaam -6.7924/39.2083, Cape Town -33.9249/18.4241), North America (Washington D.C. 38.9072/-77.0369, Ottawa 45.4215/-75.6972, Mexico City 19.4326/-99.1332, Havana 23.1136/-82.3666, Panama City 8.9824/-79.5199, Toronto 43.6532/-79.3832), South America (Brasília -15.8267/-47.9218, Buenos Aires -34.6037/-58.3816, Lima -12.0464/-77.0428, Bogotá 4.7110/-74.0721, Santiago -33.4489/-70.6693), Oceania (Canberra -35.2809/149.1300, Wellington -41.2865/174.7762, Suva -18.1248/178.4501, Auckland -36.8485/174.7633)
    - Update the upsert `update` clause to set `latitude` and `longitude` on existing rows
    - _Requirements: 1.2, 1.3, 1.7_

  - [x] 1.4 Update `MapData` type and `getFullMapData` to include coordinates
    - Add `latitude: number` and `longitude: number` to the `Location` interface in `lib/map/types.ts`
    - Update the `locations` mapping in `getFullMapData()` to include `latitude: loc.latitude, longitude: loc.longitude`
    - _Requirements: 1.5, 1.6_

- [x] 2. Map Projection
  - [x] 2.1 Implement projection function at `lib/map/projection.ts`
    - Export `MapPoint` interface: `{ x: number; y: number }`
    - Export `projectToMap(latitude: number, longitude: number): MapPoint`
    - Formula: `x = (longitude + 180) / 360 * 1000`, `y = (90 - latitude) / 180 * 500`
    - Pure function, no module-level mutable state
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Write unit tests at `lib/map/__tests__/projection.test.ts`
    - Test origin (0, 0) → (500, 250)
    - Test corners: (-90, -180) → (0, 500), (90, 180) → (1000, 0)
    - Test monotonicity: increasing longitude → increasing x; increasing latitude → decreasing y
    - Test bounds: output always in [0, 1000] × [0, 500] for valid inputs
    - Test determinism: same input always returns same output
    - Test with actual city coordinates (London, Tokyo, etc.)
    - _Requirements: 2.1–2.7_

- [x] 3. Map Data Hook
  - [x] 3.1 Implement `lib/hooks/use-map-data.ts`
    - Module-level promise singleton for request deduplication
    - Module-level cached data variable
    - `useMapData()` hook returning `{ data, error, isLoading, retry }`
    - Build lookup Maps on data arrival: `idToName`, `idToCoordinates`, `idToRegion`, `idToAdjacency`
    - `idToName(id)` returns name or "Unknown"
    - `idToCoordinates(id)` returns `{ latitude, longitude }` or null
    - `idToRegion(locationId)` returns region object or null
    - `idToAdjacency(locationId)` returns edges array or empty array
    - `retry()` clears cached promise and re-fetches
    - _Requirements: 3.1–3.6_

  - [x] 3.2 Write unit tests at `lib/hooks/__tests__/use-map-data.test.ts`
    - Mock `fetch` to return sample MapData
    - Test: single fetch on mount, cached on subsequent calls
    - Test: deduplication (multiple simultaneous calls → one request)
    - Test: lookup functions return correct values
    - Test: lookup with unknown id returns fallback
    - Test: error state on fetch failure, retry clears cache
    - _Requirements: 3.1–3.6_

- [x] 4. SVG World Map Component
  - [x] 4.1 Create `app/game/[roomId]/components/world-map.tsx`
    - `"use client"` component accepting `mapData`, `players`, `viewerPlayerId`, `activeBlockades` props
    - Render `<svg viewBox="0 0 1000 500" role="img" aria-label="World map">`
    - Include hand-authored stylized continent `<path>` elements (decorative, `aria-hidden="true"`)
    - Apply dark theme background via wrapper div with `bg-gray-900`
    - Define `REGION_COLORS` constant map (6 regions → 6 distinct fill classes)
    - Compose: MapViewport > continent paths > RouteLayer > CityMarkers > PlayerTokens (in document order)
    - _Requirements: 4.1–4.6_

- [x] 5. Route Rendering
  - [x] 5.1 Create `app/game/[roomId]/components/route-layer.tsx`
    - Accept `adjacency`, `locations`, `blockedTransports` props
    - Deduplicate edges using a `Set<string>` keyed by sorted location id pair
    - `car`: `<line>` with solid stroke, muted gray colour
    - `boat`: `<line>` with `strokeDasharray="6 4"`, blue tone
    - `plane`: `<path>` with quadratic bezier (`Q` command), control point offset perpendicular by ~20 units, amber/gold tone
    - Blocked transports: `opacity-30` class + `<title>blocked</title>` for accessibility
    - All paths `aria-hidden="true"`
    - _Requirements: 5.1–5.7_

- [x] 6. City Markers
  - [x] 6.1 Create `app/game/[roomId]/components/city-markers.tsx`
    - Accept `locations`, `regionColors`, `zoom` props
    - Hub locations: `<circle r={8/zoom}>` with thick stroke ring
    - Non-hub locations: `<circle r={4/zoom}>` with thin stroke
    - Apply region fill colour per location's regionId
    - Set `cursor-pointer`, `role="button"`, `aria-label={cityName}` on each marker
    - Scale radii and stroke widths by `1/zoom` for constant visual size
    - Render after route layer in parent composition
    - _Requirements: 6.1–6.6_

- [x] 7. Player Tokens
  - [x] 7.1 Create `app/game/[roomId]/components/player-tokens.tsx`
    - Accept `players`, `viewerPlayerId`, `idToCoordinates`, `zoom` props
    - Render one `<g>` per player with `style={{ transform, transition }}`
    - Position using `projectToMap(coordinates.latitude, coordinates.longitude)` + Token_Offset
    - Viewer's token: additional outer ring (`stroke-width="3" stroke="white"`)
    - Cluster offset: deterministic based on `turnPosition` using predefined offset array
    - When cluster size is 1, offset is (0, 0)
    - Offsets ensure at least 6 user units separation between co-located tokens
    - CSS transition: `transform 600ms ease-out` (var `--token-move-duration`)
    - `@media (prefers-reduced-motion: reduce)` → `--token-move-duration: 0ms`
    - `aria-label` with display name + "(you)" for viewer
    - Render after marker layer in parent composition
    - _Requirements: 7.1–7.9_

- [x] 8. Zoom/Pan (MapViewport)
  - [x] 8.1 Create `app/game/[roomId]/components/map-viewport.tsx`
    - State: `{ zoom: 1, panX: 0, panY: 0 }`
    - Apply as `<g transform={\`scale(${zoom}) translate(${panX}, ${panY})\`}>`
    - Wheel handler: multiply/divide zoom by 1.5, clamp [1, 4]
    - Pointer drag: track delta on pointerdown/move/up, divide by zoom, add to pan (only when zoom > 1)
    - Keyboard: `+`/`-` for zoom, arrows for pan (50/zoom units per key)
    - Pan clamping: keep visible area within viewBox bounds
    - When zoom === 1, force pan to (0, 0) and disable drag
    - _Requirements: 8.1–8.8_

  - [x] 8.2 Create on-screen zoom control buttons
    - Render zoom-in, zoom-out, reset buttons as `<button>` overlay in bottom-right corner
    - Each button: focusable, `aria-label` ("Zoom in", "Zoom out", "Reset view")
    - Styled with Tailwind (semi-transparent dark bg, rounded, hover states)
    - _Requirements: 8.6_

- [x] 9. Documentation
  - [x] 9.1 Update ARCHITECTURE.md
    - Add `lib/map/projection.ts` to Key Modules: "Owns equirectangular projection from lat/lng to SVG viewBox coordinates. Doesn't own rendering."
    - Add `lib/hooks/use-map-data.ts` to Key Modules: "Owns client-side map data fetching, caching, and id→name/coordinate/region/adjacency lookups. Doesn't own server-side data access."
    - Add `app/game/[roomId]/components/world-map.tsx` to Key Modules: "Owns SVG map rendering, continent paths, region tinting, and composition of route/marker/token layers. Doesn't own game logic or action submission."
    - Update Last updated line
    - _Requirements: documentation steering_
