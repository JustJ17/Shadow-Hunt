import { describe, it, expect } from "vitest";
import { projectToMap } from "../projection";

describe("projectToMap", () => {
  describe("known reference points", () => {
    it("maps origin (0, 0) to center of viewBox (500, 250)", () => {
      const result = projectToMap(0, 0);
      expect(result).toEqual({ x: 500, y: 250 });
    });

    it("maps (-90, -180) to bottom-left (0, 500)", () => {
      const result = projectToMap(-90, -180);
      expect(result).toEqual({ x: 0, y: 500 });
    });

    it("maps (90, 180) to top-right (1000, 0)", () => {
      const result = projectToMap(90, 180);
      expect(result).toEqual({ x: 1000, y: 0 });
    });

    it("maps (90, -180) to top-left (0, 0)", () => {
      const result = projectToMap(90, -180);
      expect(result).toEqual({ x: 0, y: 0 });
    });

    it("maps (-90, 180) to bottom-right (1000, 500)", () => {
      const result = projectToMap(-90, 180);
      expect(result).toEqual({ x: 1000, y: 500 });
    });
  });

  describe("monotonicity", () => {
    it("increasing longitude produces increasing x", () => {
      const longitudes = [-180, -90, -45, 0, 45, 90, 180];
      const xValues = longitudes.map((lng) => projectToMap(0, lng).x);

      for (let i = 1; i < xValues.length; i++) {
        expect(xValues[i]).toBeGreaterThan(xValues[i - 1]);
      }
    });

    it("increasing latitude produces decreasing y", () => {
      const latitudes = [-90, -45, 0, 45, 90];
      const yValues = latitudes.map((lat) => projectToMap(lat, 0).y);

      for (let i = 1; i < yValues.length; i++) {
        expect(yValues[i]).toBeLessThan(yValues[i - 1]);
      }
    });
  });

  describe("bounds", () => {
    it("output x is in [0, 1000] for all valid longitudes", () => {
      const longitudes = [-180, -120, -60, 0, 60, 120, 180];
      for (const lng of longitudes) {
        const { x } = projectToMap(0, lng);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1000);
      }
    });

    it("output y is in [0, 500] for all valid latitudes", () => {
      const latitudes = [-90, -60, -30, 0, 30, 60, 90];
      for (const lat of latitudes) {
        const { y } = projectToMap(lat, 0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(500);
      }
    });

    it("output stays within bounds for boundary coordinate combinations", () => {
      const lats = [-90, 90];
      const lngs = [-180, 180];
      for (const lat of lats) {
        for (const lng of lngs) {
          const { x, y } = projectToMap(lat, lng);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1000);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(500);
        }
      }
    });
  });

  describe("determinism", () => {
    it("returns the same result for identical inputs across multiple calls", () => {
      const inputs: [number, number][] = [
        [0, 0],
        [51.5074, -0.1278],
        [-33.9249, 18.4241],
        [35.6762, 139.6503],
      ];

      for (const [lat, lng] of inputs) {
        const first = projectToMap(lat, lng);
        const second = projectToMap(lat, lng);
        const third = projectToMap(lat, lng);
        expect(first).toEqual(second);
        expect(second).toEqual(third);
      }
    });
  });

  describe("actual city coordinates", () => {
    it("projects London (51.5074, -0.1278) to expected range", () => {
      const result = projectToMap(51.5074, -0.1278);
      // London is slightly west of prime meridian, northern hemisphere
      expect(result.x).toBeCloseTo(499.645, 1);
      expect(result.y).toBeCloseTo(106.92, 0);
    });

    it("projects Tokyo (35.6762, 139.6503) to expected range", () => {
      const result = projectToMap(35.6762, 139.6503);
      // Tokyo is far east, northern hemisphere
      expect(result.x).toBeCloseTo(887.92, 0);
      expect(result.y).toBeCloseTo(150.90, 0);
    });

    it("projects Cape Town (-33.9249, 18.4241) to southern hemisphere", () => {
      const result = projectToMap(-33.9249, 18.4241);
      // Cape Town is slightly east of prime meridian, southern hemisphere
      expect(result.x).toBeCloseTo(551.18, 0);
      expect(result.y).toBeCloseTo(344.24, 0);
    });

    it("projects Buenos Aires (-34.6037, -58.3816) to South America region", () => {
      const result = projectToMap(-34.6037, -58.3816);
      // Buenos Aires is western hemisphere, southern hemisphere
      expect(result.x).toBeCloseTo(337.83, 0);
      expect(result.y).toBeCloseTo(346.12, 0);
    });

    it("projects Canberra (-35.2809, 149.1300) to Oceania region", () => {
      const result = projectToMap(-35.2809, 149.13);
      // Canberra is far east, southern hemisphere
      expect(result.x).toBeCloseTo(914.25, 0);
      expect(result.y).toBeCloseTo(348.0, 0);
    });
  });
});
