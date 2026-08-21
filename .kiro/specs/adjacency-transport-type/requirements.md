# Requirements Document

## Introduction

The Adjacency Transport Type feature adds a `transport` classification to every adjacency edge in the map graph. Each edge is assigned one of three transport modes — plane, car, or boat — based on deterministic rules tied to geography. Inter-region edges always use plane. Intra-region edges use car or boat based on the hand-authored mapping derived from real-world geography (water crossings vs. land routes).

This data is stored as a PostgreSQL native enum via a Prisma enum type, exposed through the existing map API, and enforced as NOT NULL with no default (all existing rows backfilled in the same migration). The transport field enables frontend rendering of distinct travel visuals and future gameplay mechanics tied to movement mode.

## Glossary

- **Map_Service**: The server-side module responsible for seeding, storing, and querying map data (regions, locations, adjacency).
- **TransportType**: A PostgreSQL native enum with exactly three values: `plane`, `car`, `boat`. Represents the mode of transport for an adjacency edge.
- **Adjacency**: A bidirectional connection between two Locations stored in the `adjacencies` table, now including a transport classification.
- **Adjacency_Edge**: The application-layer representation of a stored adjacency row, returned by query functions.
- **AdjacencyListEntry**: The per-location adjacency structure returned in the map API response, containing an `edges` array with target location, region-membership flag, and transport type.
- **Inter-Region_Adjacency**: An adjacency edge between two Locations that belong to different Regions. All inter-region edges use plane transport.
- **Intra-Region_Adjacency**: An adjacency edge between two Locations that belong to the same Region. Intra-region edges use either car or boat transport, never plane.
- **Transport_Mapping**: The authoritative, hand-authored assignment of transport type to each of the 72 adjacency edges.
- **Seed_Script**: The idempotent Prisma seed operation that populates all map data including transport assignments.

## Requirements

### Requirement 1: Schema — TransportType Enum and Column

**User Story:** As a developer, I want a transport type field on every adjacency edge stored as a native PostgreSQL enum, so that transport mode is type-safe and queryable at the database level.

#### Acceptance Criteria

1. THE Map_Service SHALL define a Prisma enum named `TransportType` with exactly three values: `plane`, `car`, `boat`.
2. THE Map_Service SHALL add a `transport` field of type `TransportType` to the Adjacency model.
3. THE Map_Service SHALL store the `transport` column as a PostgreSQL native enum type, not a string.
4. THE Map_Service SHALL enforce the `transport` column as NOT NULL, so that no adjacency edge exists without a transport assignment.
5. THE Map_Service SHALL NOT define a default value for the `transport` column, so that every edge must be explicitly assigned.

### Requirement 2: Migration — Column Addition and Backfill

**User Story:** As a developer, I want a single migration that adds the transport column and backfills all 72 existing edges, so that the schema change and data population are atomic and no row is left without a value.

#### Acceptance Criteria

1. WHEN the migration executes, THE Map_Service SHALL create the `TransportType` PostgreSQL enum type with values `plane`, `car`, `boat`.
2. WHEN the migration executes, THE Map_Service SHALL add the `transport` column to the `adjacencies` table.
3. WHEN the migration executes, THE Map_Service SHALL backfill all 72 existing adjacency rows with the correct transport value from the Transport_Mapping before applying the NOT NULL constraint.
4. WHEN the migration executes, THE Map_Service SHALL assign `plane` to each of the 17 Inter-Region_Adjacency edges.
5. WHEN the migration executes, THE Map_Service SHALL assign `car` or `boat` to each of the 55 Intra-Region_Adjacency edges according to the Transport_Mapping.
6. IF the migration encounters an error at any step, THEN THE Map_Service SHALL roll back all changes including the enum type creation.

### Requirement 3: Seed Script — Transport Type in Edge Definitions

**User Story:** As a developer, I want the seed script to include transport type for every edge definition, so that fresh database setups produce edges with correct transport assignments without relying on a separate backfill step.

#### Acceptance Criteria

1. THE Seed_Script SHALL include a transport value for every intra-region edge definition, assigning each edge exactly one of `car` or `boat` from the Transport_Mapping.
2. THE Seed_Script SHALL assign `plane` as the transport value for every inter-region edge definition.
3. WHEN the Seed_Script upserts an adjacency edge, THE Seed_Script SHALL write the transport value to the `transport` column.
4. WHEN the Seed_Script is executed against a database that already contains adjacency edges with transport values, THE Seed_Script SHALL preserve or update to the correct transport value without creating duplicate records.
5. THE Seed_Script SHALL define exactly the following transport assignments for Europe intra-region edges: London–Paris (boat), London–Madrid (boat), London–Berlin (boat), Paris–Madrid (car), Paris–Berlin (car), Paris–Rome (car), Paris–Vienna (car), Berlin–Warsaw (car), Berlin–Vienna (car), Warsaw–Vienna (car), Vienna–Rome (car), Vienna–Athens (car), Rome–Athens (boat), Rome–Madrid (car).
6. THE Seed_Script SHALL define exactly the following transport assignments for Asia intra-region edges: Tokyo–Seoul (boat), Tokyo–Beijing (boat), Tokyo–Manila (boat), Seoul–Beijing (boat), Beijing–Hanoi (car), Beijing–New Delhi (car), Hanoi–Bangkok (car), Hanoi–Manila (boat), Bangkok–New Delhi (car), Bangkok–Jakarta (boat), Jakarta–Manila (boat).
7. THE Seed_Script SHALL define exactly the following transport assignments for Africa intra-region edges: Cairo–Addis Ababa (car), Cairo–Casablanca (car), Cairo–Nairobi (car), Casablanca–Accra (boat), Accra–Lagos (car), Lagos–Nairobi (car), Lagos–Cape Town (boat), Addis Ababa–Nairobi (car), Nairobi–Dar es Salaam (car), Dar es Salaam–Pretoria (car), Pretoria–Cape Town (car).
8. THE Seed_Script SHALL define exactly the following transport assignments for North America intra-region edges: Washington D.C.–Toronto (car), Washington D.C.–Ottawa (car), Washington D.C.–Havana (boat), Washington D.C.–Mexico City (car), Ottawa–Toronto (car), Havana–Mexico City (boat), Havana–Panama City (boat), Mexico City–Panama City (car).
9. THE Seed_Script SHALL define exactly the following transport assignments for South America intra-region edges: Brasília–Bogotá (boat), Brasília–Buenos Aires (car), Brasília–Lima (car), Bogotá–Lima (car), Lima–Santiago (car), Buenos Aires–Santiago (car).
10. THE Seed_Script SHALL define exactly the following transport assignments for Oceania intra-region edges: Canberra–Auckland (boat), Canberra–Wellington (boat), Canberra–Suva (boat), Auckland–Wellington (car), Auckland–Suva (boat).

### Requirement 4: Application Types

**User Story:** As a developer, I want the TypeScript types for adjacency edges and map API responses to include transport, so that type safety extends through the full stack.

#### Acceptance Criteria

1. THE Map_Service SHALL include a `transport` field of type `"plane" | "car" | "boat"` in the `AdjacencyEdge` interface.
2. THE Map_Service SHALL include a `transport` field of type `"plane" | "car" | "boat"` in each entry of the `edges` array within the `AdjacencyListEntry` interface.
3. THE Map_Service SHALL NOT include `transport` as an optional field; the field SHALL be required in both interfaces.

### Requirement 5: Query Module Updates

**User Story:** As a game engine consumer, I want adjacency query functions to return transport type alongside existing edge data, so that callers can access transport information without additional queries.

#### Acceptance Criteria

1. WHEN the `getAllAdjacencyEdges` function returns edge data, THE Map_Service SHALL include the `transport` field in each returned `AdjacencyEdge` object.
2. WHEN the `getAdjacentLocations` function returns neighbor data, THE Map_Service SHALL include the transport type for the edge connecting the queried location to each neighbor.
3. WHEN the `getFullMapData` function builds the adjacency list, THE Map_Service SHALL include the `transport` field in each edge entry within every `AdjacencyListEntry`.

### Requirement 6: Map API Response

**User Story:** As a frontend developer, I want the map API response to include transport type for every edge, so that the client can render transport-specific visuals without additional API calls.

#### Acceptance Criteria

1. WHEN a client requests the map data from the map API endpoint, THE Map_Service SHALL return the `transport` field in each entry of the `edges` array within every `AdjacencyListEntry`.
2. THE Map_Service SHALL return transport values as one of the strings `"plane"`, `"car"`, or `"boat"` in the JSON response.
3. THE Map_Service SHALL NOT change the existing structure of the map API response other than adding the `transport` field to each edge entry.

### Requirement 7: Transport Assignment Invariants

**User Story:** As a game designer, I want strict invariants on transport assignment, so that the transport mapping is deterministic and verifiable by tests.

#### Acceptance Criteria

1. THE Map_Service SHALL assign `plane` to every Inter-Region_Adjacency edge, totaling exactly 17 edges with transport `plane`.
2. THE Map_Service SHALL assign either `car` or `boat` to every Intra-Region_Adjacency edge, so that no intra-region edge has transport `plane`.
3. THE Map_Service SHALL assign transport values such that exactly 34 edges have transport `car` and exactly 21 edges have transport `boat`.
4. THE Map_Service SHALL NOT allow any adjacency edge to have a NULL transport value.
5. THE Map_Service SHALL assign transport values matching the authoritative Transport_Mapping for all 72 edges, so that the assignment is deterministic and reproducible.
6. WHEN a new adjacency edge is inserted, THE Map_Service SHALL require an explicit transport value, rejecting inserts without one.

### Requirement 8: Existing Test Updates and New Property Tests

**User Story:** As a developer, I want updated and new property tests verifying transport assignment correctness, so that regressions in transport data are caught automatically.

#### Acceptance Criteria

1. WHEN the adjacency property tests load edge data, THE Map_Service SHALL include the `transport` field in the loaded edge records.
2. THE Map_Service SHALL provide a property test verifying that every edge with `isSameRegion = false` has transport `plane`.
3. THE Map_Service SHALL provide a property test verifying that every edge with `isSameRegion = true` has transport `car` or `boat`, never `plane`.
4. THE Map_Service SHALL provide a property test verifying the exact transport distribution: 17 plane, 34 car, 21 boat.
5. THE Map_Service SHALL provide a property test verifying that no edge has a null or undefined transport value.
6. THE Map_Service SHALL ensure existing property tests (bidirectionality, query correctness, region subgraph connectivity, isSameRegion flag correctness) continue to pass after the transport field is added.
