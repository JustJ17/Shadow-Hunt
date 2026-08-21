# Design Document — Adjacency Transport Type

## Overview

This feature adds a `transport` classification (`plane`, `car`, `boat`) to every adjacency edge in the map graph. The value is stored as a PostgreSQL native enum, backfilled in a single migration, included in the seed script, and exposed through all existing query functions and the map API endpoint.

The design is additive — existing interfaces gain a required `transport` field, existing query functions include it in results, and the API response shape is unchanged except for the new field in each edge entry.

## Architecture

### Data Layer

```
┌───────────────────────────────────┐
│  PostgreSQL                       │
│  ┌─────────────────────────────┐  │
│  │ CREATE TYPE "TransportType" │  │
│  │   AS ENUM('plane','car',    │  │
│  │           'boat')           │  │
│  └─────────────────────────────┘  │
│  ┌─────────────────────────────┐  │
│  │ adjacencies                 │  │
│  │  id          CUID PK       │  │
│  │  locationAId FK             │  │
│  │  locationBId FK             │  │
│  │  isSameRegion BOOLEAN       │  │
│  │  transport   TransportType  │  │
│  │              NOT NULL       │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

### Module Dependency Flow

```
prisma/schema.prisma  (enum + model field)
       │
       ▼
prisma/migrations/    (create enum, add column, backfill, set NOT NULL)
       │
       ▼
prisma/seed.ts        (transport in edge tuple definitions)
       │
       ▼
lib/map/types.ts      (AdjacencyEdge, AdjacencyListEntry)
       │
       ▼
lib/map/adjacency.ts  (getAllAdjacencyEdges, getAdjacentLocations)
lib/map/get-map-data.ts (getFullMapData)
       │
       ▼
app/api/map/route.ts  (unchanged — passes through getFullMapData result)
```

## Components

### 1. Prisma Schema Changes

Add the `TransportType` enum and the `transport` field to the `Adjacency` model:

```prisma
enum TransportType {
  plane
  car
  boat
}

model Adjacency {
  id           String        @id @default(cuid())
  locationAId  String
  locationBId  String
  isSameRegion Boolean
  transport    TransportType

  locationA Location @relation("AdjacencyLocationA", fields: [locationAId], references: [id], onDelete: Cascade)
  locationB Location @relation("AdjacencyLocationB", fields: [locationBId], references: [id], onDelete: Cascade)

  @@unique([locationAId, locationBId])
  @@index([locationAId])
  @@index([locationBId])
  @@map("adjacencies")
}
```

No `@default` annotation — every insert must provide an explicit transport value.

### 2. Migration Strategy

A single migration file performs four steps in order:

1. **Create enum type**: `CREATE TYPE "TransportType" AS ENUM ('plane', 'car', 'boat');`
2. **Add nullable column**: `ALTER TABLE "adjacencies" ADD COLUMN "transport" "TransportType";`
3. **Backfill all 72 rows**: UPDATE statements assigning the correct transport value to each edge based on the authoritative Transport_Mapping. Inter-region edges get `plane`. Intra-region edges get `car` or `boat` per the mapping.
4. **Set NOT NULL**: `ALTER TABLE "adjacencies" ALTER COLUMN "transport" SET NOT NULL;`

This sequence ensures no row violates the NOT NULL constraint because the backfill precedes the constraint application. The entire migration runs within a transaction — any failure rolls back all changes including the enum type.

### 3. Seed Script Updates

The `MAP_DATA` structure changes edge tuple format from `[string, string]` to `[string, string, TransportType]` for intra-region edges. Inter-region edges can remain as `[string, string]` since their transport is always `plane` (derived at upsert time).

```typescript
// Intra-region edges now include transport
intraRegionEdges: [
  // Europe (14)
  ["London", "Paris", "boat"],
  ["London", "Madrid", "boat"],
  ["London", "Berlin", "boat"],
  ["Paris", "Madrid", "car"],
  // ...
] as [string, string, "car" | "boat"][],

// Inter-region edges — transport is always "plane"
interRegionEdges: [
  ["London", "Tokyo"],
  // ...
] as [string, string][],
```

The upsert logic updates to write `transport` on both create and update paths:

```typescript
// Intra-region
await tx.adjacency.upsert({
  where: { locationAId_locationBId: { locationAId, locationBId } },
  update: { isSameRegion: true, transport: transportType },
  create: { locationAId, locationBId, isSameRegion: true, transport: transportType },
});

// Inter-region
await tx.adjacency.upsert({
  where: { locationAId_locationBId: { locationAId, locationBId } },
  update: { isSameRegion: false, transport: "plane" },
  create: { locationAId, locationBId, isSameRegion: false, transport: "plane" },
});
```

### 4. TypeScript Type Updates

```typescript
// lib/map/types.ts

export type TransportType = "plane" | "car" | "boat";

export interface AdjacencyEdge {
  id: string;
  locationAId: string;
  locationBId: string;
  isSameRegion: boolean;
  transport: TransportType;
}

export interface AdjacencyListEntry {
  locationId: string;
  adjacentLocationIds: string[];
  edges: {
    targetLocationId: string;
    isSameRegion: boolean;
    transport: TransportType;
  }[];
}
```

### 5. Query Module Updates

**`getAllAdjacencyEdges`** — add `transport` to the returned object:

```typescript
export async function getAllAdjacencyEdges(): Promise<AdjacencyEdge[]> {
  const edges = await prisma.adjacency.findMany();
  return edges.map((edge) => ({
    id: edge.id,
    locationAId: edge.locationAId,
    locationBId: edge.locationBId,
    isSameRegion: edge.isSameRegion,
    transport: edge.transport,
  }));
}
```

**`getAdjacentLocations`** — the current function returns `Location[]` which doesn't carry edge metadata. Two options:

- **Option A**: Change return type to include transport per neighbor (breaking change to callers).
- **Option B**: Add a separate function or extend the existing one with an option.

Given the requirement states transport must be included "for the edge connecting the queried location to each neighbor," and `getFullMapData` already provides edge-level data via `AdjacencyListEntry`, the simplest approach is to keep `getAdjacentLocations` returning `Location[]` for backward compatibility and ensure `getFullMapData` (the primary consumer of edge-level data) includes transport. However, the requirement explicitly calls out `getAdjacentLocations`. 

**Decision**: Update `getAdjacentLocations` to return a richer type that includes transport per neighbor edge. Since the only current consumer pattern is through `getFullMapData` and tests, this is safe to change.

```typescript
export interface AdjacentLocationWithTransport {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
  transport: TransportType;
  isSameRegion: boolean;
}

export async function getAdjacentLocations(
  locationId: string
): Promise<AdjacentLocationWithTransport[]> {
  const edges = await prisma.adjacency.findMany({
    where: {
      OR: [{ locationAId: locationId }, { locationBId: locationId }],
    },
    include: { locationA: true, locationB: true },
  });

  return edges.map((edge) => {
    const neighbor =
      edge.locationAId === locationId ? edge.locationB : edge.locationA;
    return {
      id: neighbor.id,
      name: neighbor.name,
      regionId: neighbor.regionId,
      isHub: neighbor.isHub,
      transport: edge.transport,
      isSameRegion: edge.isSameRegion,
    };
  });
}
```

**`getFullMapData`** — include `transport` in each edge entry:

```typescript
const edges = relevantEdges.map((edge) => {
  const targetLocationId =
    edge.locationAId === locationId ? edge.locationBId : edge.locationAId;
  return {
    targetLocationId,
    isSameRegion: edge.isSameRegion,
    transport: edge.transport,
  };
});
```

### 6. API Route

No changes to `app/api/map/route.ts`. The route calls `getFullMapData()` and serializes the result as JSON. Since `getFullMapData` now includes `transport` in edge entries, the API response automatically includes it.

## Data Models

### TransportType Enum

| Value   | Usage                        | Count |
|---------|------------------------------|-------|
| `plane` | All inter-region edges       | 17    |
| `car`   | Land-route intra-region edges| 34    |
| `boat`  | Water-crossing intra-region  | 21    |
| **Total** |                            | **72**|

### Transport Mapping (Authoritative)

**Europe (14 intra-region edges):**
| Edge | Transport |
|------|-----------|
| London–Paris | boat |
| London–Madrid | boat |
| London–Berlin | boat |
| Paris–Madrid | car |
| Paris–Berlin | car |
| Paris–Rome | car |
| Paris–Vienna | car |
| Berlin–Warsaw | car |
| Berlin–Vienna | car |
| Warsaw–Vienna | car |
| Vienna–Rome | car |
| Vienna–Athens | car |
| Rome–Athens | boat |
| Rome–Madrid | car |

**Asia (11 intra-region edges):**
| Edge | Transport |
|------|-----------|
| Tokyo–Seoul | boat |
| Tokyo–Beijing | boat |
| Tokyo–Manila | boat |
| Seoul–Beijing | boat |
| Beijing–Hanoi | car |
| Beijing–New Delhi | car |
| Hanoi–Bangkok | car |
| Hanoi–Manila | boat |
| Bangkok–New Delhi | car |
| Bangkok–Jakarta | boat |
| Jakarta–Manila | boat |

**Africa (11 intra-region edges):**
| Edge | Transport |
|------|-----------|
| Cairo–Addis Ababa | car |
| Cairo–Casablanca | car |
| Cairo–Nairobi | car |
| Casablanca–Accra | boat |
| Accra–Lagos | car |
| Lagos–Nairobi | car |
| Lagos–Cape Town | boat |
| Addis Ababa–Nairobi | car |
| Nairobi–Dar es Salaam | car |
| Dar es Salaam–Pretoria | car |
| Pretoria–Cape Town | car |

**North America (8 intra-region edges):**
| Edge | Transport |
|------|-----------|
| Washington D.C.–Toronto | car |
| Washington D.C.–Ottawa | car |
| Washington D.C.–Havana | boat |
| Washington D.C.–Mexico City | car |
| Ottawa–Toronto | car |
| Havana–Mexico City | boat |
| Havana–Panama City | boat |
| Mexico City–Panama City | car |

**South America (6 intra-region edges):**
| Edge | Transport |
|------|-----------|
| Brasília–Bogotá | boat |
| Brasília–Buenos Aires | car |
| Brasília–Lima | car |
| Bogotá–Lima | car |
| Lima–Santiago | car |
| Buenos Aires–Santiago | car |

**Oceania (5 intra-region edges):**
| Edge | Transport |
|------|-----------|
| Canberra–Auckland | boat |
| Canberra–Wellington | boat |
| Canberra–Suva | boat |
| Auckland–Wellington | car |
| Auckland–Suva | boat |

**Inter-region (17 edges):** All use `plane`.

## Interfaces

### Updated Exports from `lib/map/types.ts`

```typescript
export type TransportType = "plane" | "car" | "boat";

export interface AdjacencyEdge {
  id: string;
  locationAId: string;
  locationBId: string;
  isSameRegion: boolean;
  transport: TransportType;
}

export interface AdjacencyListEntry {
  locationId: string;
  adjacentLocationIds: string[];
  edges: {
    targetLocationId: string;
    isSameRegion: boolean;
    transport: TransportType;
  }[];
}
```

### Updated Export from `lib/map/adjacency.ts`

```typescript
export interface AdjacentLocationWithTransport {
  id: string;
  name: string;
  regionId: string;
  isHub: boolean;
  transport: TransportType;
  isSameRegion: boolean;
}

export async function getAdjacentLocations(
  locationId: string
): Promise<AdjacentLocationWithTransport[]>;

export async function getAllAdjacencyEdges(): Promise<AdjacencyEdge[]>;
```

## Error Handling

- **Migration failure**: The entire migration runs in a PostgreSQL transaction. If any step (enum creation, column add, backfill, NOT NULL constraint) fails, all changes roll back. No partial state is possible.
- **Seed insert without transport**: The NOT NULL constraint rejects the insert at the database level. Prisma surfaces this as a `PrismaClientKnownRequestError` with code `P2011` (null constraint violation).
- **Invalid transport value**: The PostgreSQL enum type rejects any value not in `{plane, car, boat}` at the database level. Prisma's generated types also enforce this at compile time.
- **Backward compatibility**: The API response shape only gains a new field per edge entry. Existing clients that don't read `transport` are unaffected. No fields are removed or renamed.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Inter-region edges use plane transport

*For any* adjacency edge where `isSameRegion` is `false`, the `transport` value SHALL be `"plane"`.

**Validates: Requirements 2.4, 3.2, 7.1, 8.2**

### Property 2: Intra-region edges use car or boat transport

*For any* adjacency edge where `isSameRegion` is `true`, the `transport` value SHALL be either `"car"` or `"boat"`, never `"plane"`.

**Validates: Requirements 2.5, 3.1, 7.2, 8.3**

### Property 3: Transport distribution invariant

*For all* adjacency edges in the database, the transport distribution SHALL be exactly 17 edges with `"plane"`, 34 edges with `"car"`, and 21 edges with `"boat"`, totaling 72 edges.

**Validates: Requirements 7.3, 8.4**

### Property 4: Query functions expose valid transport

*For any* location queried via `getAdjacentLocations`, `getAllAdjacencyEdges`, or `getFullMapData`, every returned edge entry SHALL include a `transport` field with a value in `{"plane", "car", "boat"}` (never null or undefined).

**Validates: Requirements 1.4, 5.1, 5.2, 5.3, 6.2, 7.4, 8.1, 8.5**

### Property 5: Transport mapping determinism

*For any* adjacency edge, the assigned `transport` value SHALL match the authoritative Transport_Mapping. Specifically, given the same pair of location names, the transport value is always identical across seed runs, migration backfills, and query results.

**Validates: Requirements 2.3, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.5**
