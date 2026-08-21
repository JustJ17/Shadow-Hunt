# Implementation Plan: Adjacency Transport Type

## Overview

Add a `transport` classification (`plane`, `car`, `boat`) to every adjacency edge in the map graph. The implementation proceeds from schema → migration → seed → types → query functions → tests, ensuring each step builds on the previous.

## Tasks

- [x] 1. Schema and migration
  - [x] 1.1 Add TransportType enum and transport field to Prisma schema
    - Add `TransportType` enum with values `plane`, `car`, `boat` to `prisma/schema.prisma`
    - Add `transport TransportType` field to the `Adjacency` model (no `@default`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Generate and edit migration with backfill SQL
    - Run `npx prisma migrate dev --create-only` to generate the migration skeleton
    - Edit the generated SQL to follow the 4-step sequence: CREATE TYPE, ADD COLUMN (nullable), UPDATE all 72 rows with correct transport values per the authoritative Transport_Mapping, ALTER COLUMN SET NOT NULL
    - Verify all 17 inter-region edges get `plane`, 34 intra-region edges get `car`, 21 get `boat`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.3 Run migration and regenerate Prisma client
    - Apply the migration with `npx prisma migrate dev`
    - Confirm the Prisma client types now include `TransportType` and the `transport` field on `Adjacency`
    - _Requirements: 1.3, 1.4, 2.1_

- [x] 2. Seed script and application types
  - [x] 2.1 Update seed script with transport values in edge tuples
    - Change intra-region edge tuples from `[string, string]` to `[string, string, "car" | "boat"]` with values from the Transport_Mapping
    - Keep inter-region edges as `[string, string]` and derive `plane` at upsert time
    - Update upsert logic to write `transport` on both `create` and `update` paths
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 2.2 Update lib/map/types.ts with transport field
    - Export `TransportType` as `"plane" | "car" | "boat"`
    - Add required `transport: TransportType` field to `AdjacencyEdge` interface
    - Add required `transport: TransportType` field to each entry in the `edges` array of `AdjacencyListEntry`
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 3. Query module updates
  - [x] 3.1 Update getAllAdjacencyEdges in lib/map/adjacency.ts
    - Include `transport: edge.transport` in the returned object mapping
    - _Requirements: 5.1_

  - [x] 3.2 Update getAdjacentLocations in lib/map/adjacency.ts
    - Change return type to include `transport` and `isSameRegion` per neighbor
    - Define `AdjacentLocationWithTransport` interface with `id`, `name`, `regionId`, `isHub`, `transport`, `isSameRegion`
    - Map edges to include transport from the edge record
    - _Requirements: 5.2_

  - [x] 3.3 Update getFullMapData in lib/map/get-map-data.ts
    - Include `transport: edge.transport` in each edge entry within `AdjacencyListEntry`
    - _Requirements: 5.3, 6.1, 6.2, 6.3_

- [x] 4. Checkpoint - Verify build and seed
  - Ensure TypeScript compiles without errors, run `npx prisma db seed` to confirm seed works, ask the user if questions arise.

- [x] 5. Test updates
  - [x] 5.1 Update existing property tests to load transport field
    - Ensure test helpers and assertions that load adjacency edges now include `transport` in the loaded records
    - Confirm existing property tests (bidirectionality, query correctness, region subgraph connectivity, isSameRegion flag correctness) still pass
    - _Requirements: 8.1, 8.6_

  - [x] 5.2 Write property test: inter-region edges use plane transport
    - **Property 1: Inter-region edges use plane transport**
    - Verify every edge with `isSameRegion === false` has `transport === "plane"`
    - **Validates: Requirements 2.4, 3.2, 7.1, 8.2**

  - [x] 5.3 Write property test: intra-region edges use car or boat
    - **Property 2: Intra-region edges use car or boat transport**
    - Verify every edge with `isSameRegion === true` has `transport` in `["car", "boat"]`, never `"plane"`
    - **Validates: Requirements 2.5, 3.1, 7.2, 8.3**

  - [x] 5.4 Write property test: transport distribution invariant
    - **Property 3: Transport distribution invariant**
    - Verify exactly 17 edges have `plane`, 34 have `car`, 21 have `boat`, totaling 72
    - **Validates: Requirements 7.3, 8.4**

  - [x] 5.5 Write property test: no null/undefined transport values
    - **Property 4: Query functions expose valid transport**
    - Verify every edge returned by query functions includes a non-null `transport` field with value in `{"plane", "car", "boat"}`
    - **Validates: Requirements 1.4, 5.1, 5.2, 5.3, 6.2, 7.4, 8.1, 8.5**

  - [x] 5.6 Write property test: transport mapping determinism
    - **Property 5: Transport mapping determinism**
    - Verify each edge's transport value matches the authoritative Transport_Mapping across seed/query results
    - **Validates: Requirements 2.3, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.5**

- [x] 6. Integration test
  - [x] 6.1 Update map API integration test to verify transport in response
    - Verify the map API response includes `transport` in each edge entry
    - Verify transport values are valid strings from `{"plane", "car", "boat"}`
    - Verify response structure is unchanged except for the added `transport` field
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Run full test suite, ensure no regressions, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The migration must be manually edited after generation — Prisma cannot auto-generate backfill UPDATE statements
- The API route (`app/api/map/route.ts`) requires no changes since it passes through `getFullMapData` results

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.2"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 4, "tasks": ["5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6"] }
  ]
}
```
