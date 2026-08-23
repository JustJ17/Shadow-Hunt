/**
 * @vitest-environment jsdom
 */
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CityMarkers } from "../city-markers";
import type { Location, Region } from "@/lib/map/types";
import { projectToMap } from "@/lib/map/projection";

// --- Test helpers ---

function makeLocation(
  id: string,
  name: string,
  regionId: string,
  isHub: boolean,
  latitude: number,
  longitude: number
): Location {
  return { id, name, regionId, isHub, latitude, longitude };
}

function makeRegion(id: string, name: string): Region {
  return { id, name, hubLocationId: `hub-${id}` };
}

const regionEurope = makeRegion("region-eu", "Europe");
const regionAsia = makeRegion("region-as", "Asia");
const regions = [regionEurope, regionAsia];

const regionColors: Record<string, string> = {
  Europe: "fill-blue-800/30",
  Asia: "fill-amber-800/30",
};

const londonHub = makeLocation("loc-london", "London", "region-eu", true, 51.5074, -0.1278);
const parisNonHub = makeLocation("loc-paris", "Paris", "region-eu", false, 48.8566, 2.3522);
const tokyoHub = makeLocation("loc-tokyo", "Tokyo", "region-as", true, 35.6762, 139.6503);

// --- Test suite ---

describe("CityMarkers", () => {
  describe("rendering", () => {
    it("renders one circle per location", () => {
      const locations = [londonHub, parisNonHub, tokyoHub];

      const { container } = render(
        <svg>
          <CityMarkers
            locations={locations}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      // Each location renders a main circle (+ possibly a highlight ring circle)
      const groups = container.querySelectorAll("g > g");
      expect(groups).toHaveLength(3);
    });

    it("renders nothing when locations is empty", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const groups = container.querySelectorAll("g > g");
      expect(groups).toHaveLength(0);
    });
  });

  describe("hub vs non-hub sizing", () => {
    it("renders hub locations with radius 8 at default zoom", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("r")).toBe("8");
    });

    it("renders non-hub locations with radius 4 at default zoom", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("r")).toBe("4");
    });

    it("renders hub locations with stroke-width 2 at default zoom", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("stroke-width")).toBe("2");
    });

    it("renders non-hub locations with stroke-width 1 at default zoom", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("stroke-width")).toBe("1");
    });
  });

  describe("zoom scaling", () => {
    it("scales hub radius by 1/zoom (zoom=2 → r=4)", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            zoom={2}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("r")).toBe("4");
    });

    it("scales non-hub radius by 1/zoom (zoom=2 → r=2)", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            zoom={2}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("r")).toBe("2");
    });

    it("scales hub stroke-width by 1/zoom (zoom=4 → stroke-width=0.5)", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            zoom={4}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("stroke-width")).toBe("0.5");
    });

    it("scales non-hub stroke-width by 1/zoom (zoom=4 → stroke-width=0.25)", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            zoom={4}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("stroke-width")).toBe("0.25");
    });
  });

  describe("positioning", () => {
    it("positions circles at projected coordinates", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const expected = projectToMap(londonHub.latitude, londonHub.longitude);
      const circle = container.querySelector("[role='button']");
      expect(parseFloat(circle!.getAttribute("cx")!)).toBeCloseTo(expected.x, 2);
      expect(parseFloat(circle!.getAttribute("cy")!)).toBeCloseTo(expected.y, 2);
    });
  });

  describe("region colors", () => {
    it("applies the correct region fill class for Europe", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("class")).toContain("fill-blue-800/30");
    });

    it("applies the correct region fill class for Asia", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[tokyoHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("class")).toContain("fill-amber-800/30");
    });

    it("falls back to fill-gray-600 for unknown regions", () => {
      const unknownLocation = makeLocation(
        "loc-x",
        "Unknown City",
        "region-unknown",
        false,
        0,
        0
      );

      const { container } = render(
        <svg>
          <CityMarkers
            locations={[unknownLocation]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("class")).toContain("fill-gray-600");
    });
  });

  describe("accessibility", () => {
    it("sets role='button' on each marker", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub, parisNonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const buttons = container.querySelectorAll("[role='button']");
      expect(buttons).toHaveLength(2);
    });

    it("sets aria-label to city name when not a legal move", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("aria-label")).toBe("London");
    });

    it("sets aria-label to 'Move to {name}' when highlighted as legal move", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("aria-label")).toBe("Move to London");
    });
  });

  describe("move selection — highlighting", () => {
    it("renders highlight ring on legal move markers when isViewerTurn and not submitting", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub, parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const highlightRings = container.querySelectorAll(".stroke-emerald-400");
      expect(highlightRings).toHaveLength(1);
    });

    it("does not render highlight ring on non-legal move markers", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub, parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      // Paris should not have a highlight ring
      const groups = container.querySelectorAll("g > g");
      const parisGroup = groups[1]; // second location
      const parisHighlight = parisGroup.querySelector(".stroke-emerald-400");
      expect(parisHighlight).toBeNull();
    });

    it("does not render highlight rings when isViewerTurn is false", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub, parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london", "loc-paris"])}
            isViewerTurn={false}
            isSubmitting={false}
          />
        </svg>
      );

      const highlightRings = container.querySelectorAll(".stroke-emerald-400");
      expect(highlightRings).toHaveLength(0);
    });

    it("does not render highlight rings when isSubmitting is true", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub, parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london", "loc-paris"])}
            isViewerTurn={true}
            isSubmitting={true}
          />
        </svg>
      );

      const highlightRings = container.querySelectorAll(".stroke-emerald-400");
      expect(highlightRings).toHaveLength(0);
    });

    it("sets cursor-pointer on highlighted markers", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("class")).toContain("cursor-pointer");
    });

    it("sets cursor-default on non-highlighted markers", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("class")).toContain("cursor-default");
    });
  });

  describe("move selection — interaction", () => {
    it("calls onMoveSelect with location id on click of highlighted marker", () => {
      const onMoveSelect = vi.fn();

      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
            onMoveSelect={onMoveSelect}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      fireEvent.click(circle!);
      expect(onMoveSelect).toHaveBeenCalledWith("loc-london");
    });

    it("calls onMoveSelect on Enter key press on highlighted marker", () => {
      const onMoveSelect = vi.fn();

      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
            onMoveSelect={onMoveSelect}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      fireEvent.keyDown(circle!, { key: "Enter" });
      expect(onMoveSelect).toHaveBeenCalledWith("loc-london");
    });

    it("calls onMoveSelect on Space key press on highlighted marker", () => {
      const onMoveSelect = vi.fn();

      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
            onMoveSelect={onMoveSelect}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      fireEvent.keyDown(circle!, { key: " " });
      expect(onMoveSelect).toHaveBeenCalledWith("loc-london");
    });

    it("does not call onMoveSelect on click of non-legal marker", () => {
      const onMoveSelect = vi.fn();

      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
            onMoveSelect={onMoveSelect}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      fireEvent.click(circle!);
      expect(onMoveSelect).not.toHaveBeenCalled();
    });

    it("does not call onMoveSelect when isSubmitting is true", () => {
      const onMoveSelect = vi.fn();

      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={true}
            onMoveSelect={onMoveSelect}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      fireEvent.click(circle!);
      expect(onMoveSelect).not.toHaveBeenCalled();
    });

    it("does not call onMoveSelect when isViewerTurn is false", () => {
      const onMoveSelect = vi.fn();

      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={false}
            isSubmitting={false}
            onMoveSelect={onMoveSelect}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      fireEvent.click(circle!);
      expect(onMoveSelect).not.toHaveBeenCalled();
    });
  });

  describe("move selection — tabIndex", () => {
    it("sets tabIndex=0 on highlighted markers", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("tabindex")).toBe("0");
    });

    it("sets tabIndex=-1 on non-highlighted markers", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("tabindex")).toBe("-1");
    });

    it("sets tabIndex=-1 on all markers when not viewer turn", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub, parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={false}
          />
        </svg>
      );

      const buttons = container.querySelectorAll("[role='button']");
      buttons.forEach((btn) => {
        expect(btn.getAttribute("tabindex")).toBe("-1");
      });
    });
  });

  describe("move selection — aria-disabled", () => {
    it("sets aria-disabled=false on highlighted markers", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("aria-disabled")).toBe("false");
    });

    it("sets aria-disabled=true on non-highlighted markers", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[parisNonHub]}
            regions={regions}
            regionColors={regionColors}
            legalMoveIds={new Set(["loc-london"])}
            isViewerTurn={true}
            isSubmitting={false}
          />
        </svg>
      );

      const circle = container.querySelector("[role='button']");
      expect(circle!.getAttribute("aria-disabled")).toBe("true");
    });
  });

  describe("backward compatibility", () => {
    it("works without new props (defaults to disabled state)", () => {
      const { container } = render(
        <svg>
          <CityMarkers
            locations={[londonHub, parisNonHub]}
            regions={regions}
            regionColors={regionColors}
          />
        </svg>
      );

      // No highlights
      const highlightRings = container.querySelectorAll(".stroke-emerald-400");
      expect(highlightRings).toHaveLength(0);

      // All markers have tabIndex=-1
      const buttons = container.querySelectorAll("[role='button']");
      buttons.forEach((btn) => {
        expect(btn.getAttribute("tabindex")).toBe("-1");
      });
    });
  });
});
