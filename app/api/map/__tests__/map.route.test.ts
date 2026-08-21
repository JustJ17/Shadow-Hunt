import "dotenv/config";
import { describe, it, expect } from "vitest";
import { GET } from "../route";
import type { MapData } from "@/lib/map/types";

// **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6**

describe("GET /api/map", () => {
  it("returns 200 with complete map data", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const data: MapData = await response.json();
    expect(data).toHaveProperty("regions");
    expect(data).toHaveProperty("adjacency");
  });

  it("response contains 6 regions", async () => {
    const response = await GET();
    const data: MapData = await response.json();

    expect(data.regions).toHaveLength(6);
  });

  it("response contains 40 locations total", async () => {
    const response = await GET();
    const data: MapData = await response.json();

    const totalLocations = data.regions.reduce(
      (sum, region) => sum + region.locations.length,
      0
    );
    expect(totalLocations).toBe(40);
  });

  it("response contains adjacency lists for all locations", async () => {
    const response = await GET();
    const data: MapData = await response.json();

    expect(data.adjacency).toHaveLength(40);

    // Every adjacency entry should have a locationId and edges array
    for (const entry of data.adjacency) {
      expect(entry).toHaveProperty("locationId");
      expect(entry).toHaveProperty("adjacentLocationIds");
      expect(entry).toHaveProperty("edges");
      expect(Array.isArray(entry.edges)).toBe(true);
    }
  });

  it("adjacency entries include isSameRegion flag", async () => {
    const response = await GET();
    const data: MapData = await response.json();

    // Find an entry that has at least one edge
    const entryWithEdges = data.adjacency.find(
      (entry) => entry.edges.length > 0
    );
    expect(entryWithEdges).toBeDefined();

    for (const edge of entryWithEdges!.edges) {
      expect(edge).toHaveProperty("targetLocationId");
      expect(edge).toHaveProperty("isSameRegion");
      expect(typeof edge.isSameRegion).toBe("boolean");
    }
  });

  it("each location has hub designation (isHub field)", async () => {
    const response = await GET();
    const data: MapData = await response.json();

    const allLocations = data.regions.flatMap((r) => r.locations);

    // Every location should have the isHub field
    for (const loc of allLocations) {
      expect(loc).toHaveProperty("isHub");
      expect(typeof loc.isHub).toBe("boolean");
    }

    // There should be at least 6 hubs (one per region)
    const hubCount = allLocations.filter((loc) => loc.isHub).length;
    expect(hubCount).toBeGreaterThanOrEqual(6);
  });

  it("response does not contain game state fields", async () => {
    const response = await GET();
    const data: MapData = await response.json();
    const responseStr = JSON.stringify(data);

    const forbiddenFields = [
      "gameThreat",
      "gameSpies",
      "GameThreat",
      "GameSpy",
      "captured",
      "capturedByPlayerId",
    ];

    for (const field of forbiddenFields) {
      expect(responseStr).not.toContain(field);
    }
  });

  it("response includes Cache-Control header", async () => {
    const response = await GET();

    const cacheControl = response.headers.get("Cache-Control");
    expect(cacheControl).toBe("public, max-age=86400, immutable");
  });
});
