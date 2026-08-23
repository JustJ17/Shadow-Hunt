# Design: Game Map

## Overview

The Game Map feature adds the interactive SVG world map to Shadow Hunt's in-game screen. It covers the full rendering pipeline from database coordinates through projection to SVG output with animated player tokens and zoom/pan interaction.

Key design decisions:
- **Equirectangular projection** — simplest correct projection for a fixed viewBox, no dependencies needed.
- **Single-fetch cache pattern** — map data is static for the lifetime of a game; fetch once, cache in a module-level promise.
- **SVG transform for zoom/pan** — a single `<g>` wrapper with `transform` avoids re-rendering the entire map tree.
- **CSS transitions for token animation** — no JS animation loop, leverages browser-native GPU compositing.
- **Zero dependencies** — all rendering is inline SVG + Tailwind + CSS. No mapping libraries, no icon fonts.

## Architecture

```
prisma/schema.prisma          → Location gains latitude/longitude
prisma/seed.ts                → Seeds 40 coordinates
lib/map/types.ts              → Location type gains lat/lng
lib/map/get-map-data.ts       → Includes lat/lng in query

lib/map/projection.ts         → Pure: (lat, lng) → (x, y)
lib/hooks/use-map-data.ts     → Client hook: fetch + cache + lookups

app/game/[roomId]/components/
├── world-map.tsx             → SVG root + continent paths + region tint
├── route-layer.tsx           → Edge rendering (car/boat/plane styles)
├── city-markers.tsx          → Hub vs non-hub markers
├── player-tokens.tsx         → Animated tokens with cluster offset
└── map-viewport.tsx          → Zoom/pan state + controls
```

## Data Flow

```
GET /api/map → MapData { regions[].locations[].{lat,lng}, adjacency[] }
                ↓
       useMapData() hook — caches, exposes lookups
                ↓
       WorldMap component
         ├─ projection(lat, lng) → (x, y) for each city
         ├─ RouteLayer: renders edges using projected endpoints
         ├─ CityMarkers: positioned markers per projected point
         └─ PlayerTokens: uses GamePollState.players[].locationId
                          → lookups coordinate → projected point
                          → CSS transition on position change
```

## Detailed Design

### 1. Schema + Seed Changes

**`prisma/schema.prisma`** — add to Location model:
```prisma
model Location {
  id        String  @id @default(cuid())
  name      String  @unique
  regionId  String
  isHub     Boolean @default(false)
  latitude  Float
  longitude Float
  // ... existing relations unchanged
}
```

**`prisma/seed.ts`** — extend `MAP_DATA.regions[].locations` from string arrays to `{ name, lat, lng }` objects. The upsert `update` clause sets `latitude` and `longitude` on existing rows.

**`lib/map/types.ts`** — extend `Location` interface:
```typescript
export interface Location {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
  latitude: number;
  longitude: number;
}
```

**`lib/map/get-map-data.ts`** — add `latitude` and `longitude` to the Location select in the Prisma query.

### 2. Projection Function

**File:** `lib/map/projection.ts`

```typescript
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
```

Pure, stateless, deterministic. Tested with known values (e.g. 0,0 → 500,250; -90,-180 → 0,500).

### 3. Map Data Hook

**File:** `lib/hooks/use-map-data.ts`

Pattern: module-level promise singleton for deduplication + SWR-like cache.

```typescript
"use client";

let cachedPromise: Promise<MapData> | null = null;
let cachedData: MapData | null = null;

function fetchMapData(): Promise<MapData> {
  if (cachedData) return Promise.resolve(cachedData);
  if (cachedPromise) return cachedPromise;
  cachedPromise = fetch("/api/map")
    .then(res => { if (!res.ok) throw new Error("Map fetch failed"); return res.json(); })
    .then(data => { cachedData = data; return data; })
    .catch(err => { cachedPromise = null; throw err; });
  return cachedPromise;
}
```

The hook wraps this in `useState` + `useEffect`, returning `{ data, error, isLoading, retry }` plus four lookup functions derived from `data`.

Lookups built as `Map<string, T>` constructed once on data arrival:
- `idToName(id)` → location or region name, "Unknown" fallback
- `idToCoordinates(id)` → `{ latitude, longitude } | null`
- `idToRegion(locationId)` → region object or null
- `idToAdjacency(locationId)` → edges array or empty array

### 4. SVG World Map Component

**File:** `app/game/[roomId]/components/world-map.tsx`

Structure:
```tsx
<svg viewBox="0 0 1000 500" role="img" aria-label="World map">
  <MapViewport zoom={zoom} panX={panX} panY={panY}>
    <g className="continent-paths"> {/* decorative landmasses */} </g>
    <RouteLayer adjacency={adjacency} project={projectToMap} blockedTransports={viewerBlockedTransports} />
    <CityMarkers locations={locations} project={projectToMap} regionColors={REGION_COLORS} />
    <PlayerTokens players={players} viewerPlayerId={viewerPlayerId} project={projectToMap} lookupCoords={idToCoordinates} />
  </MapViewport>
</svg>
```

Continent paths are hand-authored simplified SVG paths stored as constants in the component file. They are decorative (`aria-hidden="true"`) and intentionally stylized (not geographically precise).

Region tinting: a constant map of region name → Tailwind fill class (e.g. Europe → `fill-blue-800/30`, Asia → `fill-amber-800/30`).

### 5. Route Layer

**File:** `app/game/[roomId]/components/route-layer.tsx`

Deduplication: adjacency data is per-location with edges. To render each edge once, iterate all edges and track rendered pairs via a `Set<string>` keyed by sorted `locationAId-locationBId`.

Visual per transport type:
- `car`: `<line>` with `strokeDasharray="none"` (solid), `stroke="currentColor"` in a muted color.
- `boat`: `<line>` with `strokeDasharray="6 4"` (dashed), `stroke` in a blue tone.
- `plane`: `<path d="M x1 y1 Q cx cy x2 y2">` with control point offset perpendicular by ~20 units, `stroke` in a distinct amber/gold tone.

Blocked transports get `opacity-30` class and a `<title>` element reading "blocked".

### 6. City Markers

**File:** `app/game/[roomId]/components/city-markers.tsx`

- Hub: `<circle r="8">` with a distinct border ring (e.g. `stroke-width="2"`)
- Non-hub: `<circle r="4">` with thinner stroke

Both use `cursor-pointer` class (click wiring deferred to game-wiring spec). `role="button"` and `aria-label={cityName}` for accessibility readiness.

Marker radii scale by `1/zoom` so visual size stays constant in CSS pixels regardless of zoom level.

### 7. Player Tokens

**File:** `app/game/[roomId]/components/player-tokens.tsx`

Each token is a `<g>` with `style={{ transform: \`translate(${x}px, ${y}px)\`, transition: 'transform 600ms ease-out' }}`.

Viewer's token gets an additional outer ring (`stroke-width="3" stroke="white"`).

**Cluster offset** (deterministic by `turnPosition`):
```typescript
const OFFSETS = [
  { dx: 0, dy: -8 },
  { dx: 7, dy: 4 },
  { dx: -7, dy: 4 },
  { dx: 0, dy: 8 },
];
// For a cluster of size N at a location, player with turnPosition T gets OFFSETS[T-1]
// When only 1 player at location, offset is (0, 0)
```

**Reduced motion**: wraps transition duration in a CSS custom property set via `@media (prefers-reduced-motion: reduce) { --token-move-duration: 0ms; }`.

### 8. Zoom/Pan (MapViewport)

**File:** `app/game/[roomId]/components/map-viewport.tsx`

State: `{ zoom: number, panX: number, panY: number }`

Applied as: `<g transform={\`scale(${zoom}) translate(${panX} ${panY})\`}>...</g>`

Interactions:
- **Wheel**: `onWheel` → multiply/divide zoom by 1.5, clamp [1, 4]
- **Drag**: `onPointerDown/Move/Up` → track delta, divide by zoom, add to pan
- **Keyboard**: `+`/`-` for zoom, arrows for pan (50/zoom units per press)
- **Buttons**: zoom-in, zoom-out, reset — positioned as an overlay in the bottom-right corner

Pan clamping: ensure visible area (1000/zoom × 500/zoom) shifted by pan stays within [0, 1000] × [0, 500].

When zoom === 1, pan is forced to (0, 0) and drag is disabled.

## Correctness Properties

1. **Projection determinism**: For any valid (lat, lng), `projectToMap(lat, lng)` always returns the same (x, y).
2. **Projection bounds**: Output x is in [0, 1000] and y in [0, 500] for all inputs in [-90,90] × [-180,180].
3. **Projection monotonicity**: Increasing longitude → increasing x; increasing latitude → decreasing y.
4. **Edge deduplication**: Route layer renders exactly one path per adjacency pair regardless of traversal direction.
5. **Token cluster separation**: Co-located tokens are separated by at least 6 user units.
6. **Zoom clamp**: Zoom_Level never goes below 1 or above 4 regardless of input sequence.
7. **Pan lock at zoom 1**: When zoom === 1, pan is always (0, 0).

## File Inventory

| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | Add latitude/longitude to Location |
| `prisma/seed.ts` | Seed 40 city coordinates |
| `lib/map/types.ts` | Extend Location type |
| `lib/map/get-map-data.ts` | Include coords in query |
| `lib/map/projection.ts` | Pure projection function |
| `lib/map/__tests__/projection.test.ts` | Projection unit tests |
| `lib/hooks/use-map-data.ts` | Client hook with caching |
| `lib/hooks/__tests__/use-map-data.test.ts` | Hook unit tests |
| `app/game/[roomId]/components/world-map.tsx` | SVG root + continent shapes |
| `app/game/[roomId]/components/route-layer.tsx` | Edge rendering |
| `app/game/[roomId]/components/city-markers.tsx` | Hub/non-hub markers |
| `app/game/[roomId]/components/player-tokens.tsx` | Animated tokens |
| `app/game/[roomId]/components/map-viewport.tsx` | Zoom/pan controller + buttons |
