/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { MapData } from "@/lib/map/types";

const sampleMapData: MapData = {
  regions: [
    {
      id: "region-1",
      name: "Europe",
      hubLocationId: "loc-1",
      locations: [
        { id: "loc-1", name: "London", regionId: "region-1", isHub: true, latitude: 51.5074, longitude: -0.1278 },
        { id: "loc-2", name: "Paris", regionId: "region-1", isHub: false, latitude: 48.8566, longitude: 2.3522 },
      ],
    },
  ],
  adjacency: [
    {
      locationId: "loc-1",
      adjacentLocationIds: ["loc-2"],
      edges: [{ targetLocationId: "loc-2", isSameRegion: true, transport: "boat" }],
    },
    {
      locationId: "loc-2",
      adjacentLocationIds: ["loc-1"],
      edges: [{ targetLocationId: "loc-1", isSameRegion: true, transport: "boat" }],
    },
  ],
};

function createFetchMock(response: MapData = sampleMapData) {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    } as Response)
  );
}

function createFailingFetchMock(message = "Network error") {
  return vi.fn(() => Promise.reject(new Error(message)));
}

describe("useMapData", () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = createFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function importHook() {
    const mod = await import("@/lib/hooks/use-map-data");
    return mod.useMapData;
  }

  describe("fetching and caching", () => {
    it("fetches map data on mount and sets data", async () => {
      const useMapData = await importHook();

      const { result } = renderHook(() => useMapData());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(sampleMapData);
      expect(result.current.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith("/api/map");
    });

    it("serves from cache on subsequent renders without additional requests", async () => {
      const useMapData = await importHook();

      const { result: first } = renderHook(() => useMapData());
      await waitFor(() => expect(first.current.isLoading).toBe(false));

      const { result: second } = renderHook(() => useMapData());
      await waitFor(() => expect(second.current.isLoading).toBe(false));

      expect(second.current.data).toEqual(sampleMapData);
      // Only one fetch call total — second render used cache
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("deduplicates concurrent requests (multiple hooks → one fetch)", async () => {
      // Use a delayed fetch to ensure both hooks mount before it resolves
      let resolveFetch!: (value: Response) => void;
      global.fetch = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      );

      const useMapData = await importHook();

      const { result: hook1 } = renderHook(() => useMapData());
      const { result: hook2 } = renderHook(() => useMapData());

      expect(hook1.current.isLoading).toBe(true);
      expect(hook2.current.isLoading).toBe(true);

      // Resolve the single pending fetch
      await act(async () => {
        resolveFetch({
          ok: true,
          json: () => Promise.resolve(sampleMapData),
        } as Response);
      });

      await waitFor(() => expect(hook1.current.isLoading).toBe(false));
      await waitFor(() => expect(hook2.current.isLoading).toBe(false));

      expect(hook1.current.data).toEqual(sampleMapData);
      expect(hook2.current.data).toEqual(sampleMapData);
      // Only one fetch despite two hooks
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("lookup functions", () => {
    it("idToName returns location name for valid id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToName("loc-1")).toBe("London");
      expect(result.current.idToName("loc-2")).toBe("Paris");
    });

    it("idToName returns 'Unknown' for unknown id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToName("nonexistent")).toBe("Unknown");
    });

    it("idToCoordinates returns latitude and longitude for valid id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToCoordinates("loc-1")).toEqual({
        latitude: 51.5074,
        longitude: -0.1278,
      });
    });

    it("idToCoordinates returns null for unknown id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToCoordinates("nonexistent")).toBeNull();
    });

    it("idToRegion returns region object for valid location id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToRegion("loc-1")).toEqual({
        id: "region-1",
        name: "Europe",
        hubLocationId: "loc-1",
      });
    });

    it("idToRegion returns null for unknown id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToRegion("nonexistent")).toBeNull();
    });

    it("idToAdjacency returns edges array for valid location id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToAdjacency("loc-1")).toEqual([
        { targetLocationId: "loc-2", isSameRegion: true, transport: "boat" },
      ]);
    });

    it("idToAdjacency returns empty array for unknown id", async () => {
      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.idToAdjacency("nonexistent")).toEqual([]);
    });
  });

  describe("error handling and retry", () => {
    it("sets error state on fetch failure", async () => {
      global.fetch = createFailingFetchMock("Network error");

      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBe("Network error");
      expect(result.current.data).toBeNull();
    });

    it("retry clears cache and re-fetches successfully", async () => {
      global.fetch = createFailingFetchMock("Server error");

      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe("Server error");

      // Replace fetch with a successful mock for retry
      global.fetch = createFetchMock();

      await act(async () => {
        result.current.retry();
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual(sampleMapData);
    });

    it("sets error when response is not ok", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response)
      );

      const useMapData = await importHook();
      const { result } = renderHook(() => useMapData());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBe("Map fetch failed");
      expect(result.current.data).toBeNull();
    });
  });
});
