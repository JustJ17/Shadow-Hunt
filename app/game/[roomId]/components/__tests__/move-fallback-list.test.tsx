/**
 * @vitest-environment jsdom
 */
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MoveFallbackList } from "../move-fallback-list";

const legalMoves = [
  { locationId: "loc-paris", locationName: "Paris", transport: "car" },
  { locationId: "loc-berlin", locationName: "Berlin", transport: "plane" },
  { locationId: "loc-rome", locationName: "Rome", transport: "boat" },
];

describe("MoveFallbackList", () => {
  describe("rendering", () => {
    it("renders one button per legal move destination", () => {
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      const buttons = getAllByRole("button");
      expect(buttons).toHaveLength(3);
    });

    it("renders nothing when legalMoves is empty", () => {
      const { container } = render(
        <MoveFallbackList
          legalMoves={[]}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      expect(container.innerHTML).toBe("");
    });

    it("displays location name and transport type for each move", () => {
      const { getByText } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      expect(getByText("(car)")).toBeTruthy();
      expect(getByText("(plane)")).toBeTruthy();
      expect(getByText("(boat)")).toBeTruthy();
    });

    it("renders a heading for accessibility", () => {
      const { getByText } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      expect(getByText("Move to:")).toBeTruthy();
    });

    it("has block sm:hidden class on the container", () => {
      const { container } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      const wrapper = container.firstElementChild;
      expect(wrapper?.className).toContain("block");
      expect(wrapper?.className).toContain("sm:hidden");
    });
  });

  describe("interaction", () => {
    it("calls onMoveSelect with locationId when a button is clicked", () => {
      const onMoveSelect = vi.fn();
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={onMoveSelect}
        />
      );

      fireEvent.click(getAllByRole("button")[0]);
      expect(onMoveSelect).toHaveBeenCalledWith("loc-paris");
    });

    it("calls onMoveSelect on Enter key press", () => {
      const onMoveSelect = vi.fn();
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={onMoveSelect}
        />
      );

      fireEvent.keyDown(getAllByRole("button")[1], { key: "Enter" });
      expect(onMoveSelect).toHaveBeenCalledWith("loc-berlin");
    });

    it("calls onMoveSelect on Space key press", () => {
      const onMoveSelect = vi.fn();
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={onMoveSelect}
        />
      );

      fireEvent.keyDown(getAllByRole("button")[2], { key: " " });
      expect(onMoveSelect).toHaveBeenCalledWith("loc-rome");
    });

    it("does not call onMoveSelect when not viewer turn", () => {
      const onMoveSelect = vi.fn();
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={false}
          isSubmitting={false}
          onMoveSelect={onMoveSelect}
        />
      );

      fireEvent.click(getAllByRole("button")[0]);
      expect(onMoveSelect).not.toHaveBeenCalled();
    });

    it("does not call onMoveSelect when submitting", () => {
      const onMoveSelect = vi.fn();
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={true}
          onMoveSelect={onMoveSelect}
        />
      );

      fireEvent.click(getAllByRole("button")[0]);
      expect(onMoveSelect).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("sets aria-disabled on buttons when not viewer turn", () => {
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={false}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      const buttons = getAllByRole("button");
      for (const button of buttons) {
        expect(button.getAttribute("aria-disabled")).toBe("true");
      }
    });

    it("sets aria-disabled on buttons when submitting", () => {
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={true}
          onMoveSelect={() => {}}
        />
      );

      const buttons = getAllByRole("button");
      for (const button of buttons) {
        expect(button.getAttribute("aria-disabled")).toBe("true");
      }
    });

    it("does not set aria-disabled when active", () => {
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      const buttons = getAllByRole("button");
      for (const button of buttons) {
        expect(button.getAttribute("aria-disabled")).toBeNull();
      }
    });

    it("provides descriptive aria-label for each button", () => {
      const { getAllByRole } = render(
        <MoveFallbackList
          legalMoves={legalMoves}
          isViewerTurn={true}
          isSubmitting={false}
          onMoveSelect={() => {}}
        />
      );

      const buttons = getAllByRole("button");
      expect(buttons[0].getAttribute("aria-label")).toBe(
        "Move to Paris via car"
      );
      expect(buttons[1].getAttribute("aria-label")).toBe(
        "Move to Berlin via plane"
      );
      expect(buttons[2].getAttribute("aria-label")).toBe(
        "Move to Rome via boat"
      );
    });
  });
});
