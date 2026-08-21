// Feature: adjacency-transport-type, Property 1: Inter-region edges use plane transport
// Feature: adjacency-transport-type, Property 2: Intra-region edges use car or boat transport
// Feature: adjacency-transport-type, Property 3: Transport distribution invariant
// Feature: adjacency-transport-type, Property 4: Query functions expose valid transport
// Feature: adjacency-transport-type, Property 5: Transport mapping determinism

import fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

interface Edge {
  id: string;
  locationAId: string;
  locationBId: string;
  isSameRegion: boolean;
  transport: string;
}

let allEdges: Edge[] = [];
let prisma: PrismaClient;

describe("Transport Property Tests", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL not set");
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
    allEdges = await prisma.adjacency.findMany();
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Property 1: Inter-region edges use plane transport", () => {
    // **Validates: Requirements 2.4, 3.2, 7.1, 8.2**
    it("every edge with isSameRegion=false has transport='plane'", () => {
      const interRegionEdges = allEdges.filter(e => !e.isSameRegion);
      expect(interRegionEdges.length).toBe(17);

      fc.assert(
        fc.property(fc.constantFrom(...interRegionEdges), (edge: Edge) => {
          expect(edge.transport).toBe("plane");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 2: Intra-region edges use car or boat", () => {
    // **Validates: Requirements 2.5, 3.1, 7.2, 8.3**
    it("every edge with isSameRegion=true has transport 'car' or 'boat', never 'plane'", () => {
      const intraRegionEdges = allEdges.filter(e => e.isSameRegion);
      expect(intraRegionEdges.length).toBe(55);

      fc.assert(
        fc.property(fc.constantFrom(...intraRegionEdges), (edge: Edge) => {
          expect(["car", "boat"]).toContain(edge.transport);
          expect(edge.transport).not.toBe("plane");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 3: Transport distribution invariant", () => {
    // **Validates: Requirements 7.3, 8.4**
    it("exactly 17 plane, 34 car, 21 boat, totaling 72", () => {
      expect(allEdges.length).toBe(72);

      const counts = { plane: 0, car: 0, boat: 0 };
      for (const edge of allEdges) {
        counts[edge.transport as keyof typeof counts]++;
      }

      expect(counts.plane).toBe(17);
      expect(counts.car).toBe(34);
      expect(counts.boat).toBe(21);
    });
  });

  describe("Property 4: No null/undefined transport values", () => {
    // **Validates: Requirements 1.4, 5.1, 5.2, 5.3, 6.2, 7.4, 8.1, 8.5**
    it("every edge has a non-null transport in {plane, car, boat}", () => {
      fc.assert(
        fc.property(fc.constantFrom(...allEdges), (edge: Edge) => {
          expect(edge.transport).toBeDefined();
          expect(edge.transport).not.toBeNull();
          expect(["plane", "car", "boat"]).toContain(edge.transport);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 5: Transport mapping determinism", () => {
    // **Validates: Requirements 2.3, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.5**
    it("querying edges twice yields identical transport values", async () => {
      // Query edges a second time
      const secondQuery = await prisma.adjacency.findMany();

      // Build a map from edge id to transport for both queries
      const firstMap = new Map(allEdges.map(e => [e.id, e.transport]));
      const secondMap = new Map(secondQuery.map(e => [e.id, e.transport]));

      expect(firstMap.size).toBe(secondMap.size);

      fc.assert(
        fc.property(fc.constantFrom(...allEdges), (edge: Edge) => {
          expect(secondMap.get(edge.id)).toBe(firstMap.get(edge.id));
        }),
        { numRuns: 100 }
      );
    });
  });
});
