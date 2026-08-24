/**
 * @vitest-environment jsdom
 */
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TargetPicker } from "../target-picker";
import type { PlayerPollData } from "@/lib/turn-engine/types";

function makePlayers(count: number): PlayerPollData[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `player-${i + 1}`,
    displayName: `Player ${i + 1}`,
    locationId: `loc-${i + 1}`,
    turnPosition: i,
    skipNextTurn: false,
  }));
}

function makeReturnFocusRef() {
  const button = document.createElement("button");
  document.body.appendChild(button);
  return { current: button };
}

describe("TargetPicker", () => {
  describe("rendering", () => {
    it("renders a listbox with role='listbox'", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
      expect(listbox?.getAttribute("aria-label")).toBe("Target player");
    });

    it("renders one option per non-viewer player", () => {
      const players = makePlayers(4);
      const ref = makeReturnFocusRef();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      expect(options.length).toBe(3); // 4 players minus viewer
    });

    it("excludes the viewer from the option list", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { queryByText } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-2"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      // Player 2 is the viewer, should not appear
      const options = document.querySelectorAll('[role="option"]');
      const optionTexts = Array.from(options).map((o) => o.textContent);
      expect(optionTexts).not.toContain("Player 2");
      expect(optionTexts).toContain("Player 1");
      expect(optionTexts).toContain("Player 3");
    });

    it("labels each option with the player display name", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { getByText } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      expect(getByText("Player 2")).toBeTruthy();
      expect(getByText("Player 3")).toBeTruthy();
    });

    it("renders a Cancel button", () => {
      const players = makePlayers(2);
      const ref = makeReturnFocusRef();
      const { getByText } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      expect(getByText("Cancel")).toBeTruthy();
    });
  });

  describe("focus management", () => {
    it("focuses the first option on mount", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const firstOption = container.querySelector('[role="option"]');
      expect(document.activeElement).toBe(firstOption);
    });

    it("returns focus to returnFocusRef on cancel", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const onCancel = vi.fn();
      const { getByText } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={onCancel}
          returnFocusRef={ref}
        />
      );

      fireEvent.click(getByText("Cancel"));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(ref.current);
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowDown moves focus to next option (wraps)", () => {
      const players = makePlayers(4);
      const ref = makeReturnFocusRef();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      // First option is focused on mount
      fireEvent.keyDown(options[0], { key: "ArrowDown" });
      expect(document.activeElement).toBe(options[1]);

      fireEvent.keyDown(options[1], { key: "ArrowDown" });
      expect(document.activeElement).toBe(options[2]);

      // Wrap from last to first
      fireEvent.keyDown(options[2], { key: "ArrowDown" });
      expect(document.activeElement).toBe(options[0]);
    });

    it("ArrowUp moves focus to previous option (wraps)", () => {
      const players = makePlayers(4);
      const ref = makeReturnFocusRef();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      // Wrap from first to last
      fireEvent.keyDown(options[0], { key: "ArrowUp" });
      expect(document.activeElement).toBe(options[2]);

      fireEvent.keyDown(options[2], { key: "ArrowUp" });
      expect(document.activeElement).toBe(options[1]);
    });

    it("Enter selects the focused option", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const onSelect = vi.fn();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={onSelect}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      fireEvent.keyDown(options[0], { key: "Enter" });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("player-2");
    });

    it("Space selects the focused option", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const onSelect = vi.fn();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={onSelect}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      fireEvent.keyDown(options[1], { key: " " });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("player-3");
    });

    it("Escape cancels and returns focus", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const onCancel = vi.fn();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={onCancel}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      fireEvent.keyDown(options[0], { key: "Escape" });

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(ref.current);
    });

    it("Tab is trapped and cycles forward through options and cancel", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { container, getByText } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      const cancelBtn = getByText("Cancel");

      // Tab from first option -> second option
      fireEvent.keyDown(options[0], { key: "Tab" });
      expect(document.activeElement).toBe(options[1]);

      // Tab from last option -> cancel
      fireEvent.keyDown(options[1], { key: "Tab" });
      expect(document.activeElement).toBe(cancelBtn);

      // Tab from cancel -> first option (wrap)
      fireEvent.keyDown(cancelBtn, { key: "Tab" });
      expect(document.activeElement).toBe(options[0]);
    });

    it("Shift+Tab is trapped and cycles backward", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { container, getByText } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      const cancelBtn = getByText("Cancel");

      // Shift+Tab from first option -> cancel (wrap to last focusable)
      fireEvent.keyDown(options[0], { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(cancelBtn);

      // Shift+Tab from cancel -> last option
      fireEvent.keyDown(cancelBtn, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(options[1]);
    });
  });

  describe("interaction", () => {
    it("clicking an option invokes onSelect with the player id", () => {
      const players = makePlayers(4);
      const ref = makeReturnFocusRef();
      const onSelect = vi.fn();
      const { getByText } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={onSelect}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      fireEvent.click(getByText("Player 3"));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("player-3");
    });
  });

  describe("accessibility", () => {
    it("options have role='option'", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const options = container.querySelectorAll('[role="option"]');
      expect(options.length).toBe(2);
      options.forEach((opt) => {
        expect(opt.getAttribute("tabindex")).toBe("0");
      });
    });

    it("options have focus-visible ring styling class", () => {
      const players = makePlayers(3);
      const ref = makeReturnFocusRef();
      const { container } = render(
        <TargetPicker
          players={players}
          viewerPlayerId="player-1"
          onSelect={() => {}}
          onCancel={() => {}}
          returnFocusRef={ref}
        />
      );

      const firstOption = container.querySelector('[role="option"]');
      expect(firstOption?.className).toContain("focus-visible:ring-2");
      expect(firstOption?.className).toContain("focus-visible:ring-blue-400");
    });
  });
});
