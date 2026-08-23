/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ActionBar } from "../action-bar";

function renderActionBar(overrides: Partial<Parameters<typeof ActionBar>[0]> = {}) {
  const defaultProps = {
    isViewerTurn: true,
    isSubmitting: false,
    actionsRemaining: 1,
    captureAttemptFlag: false,
    error: null,
    onSkip: vi.fn(),
    onCaptureAttempt: vi.fn(),
    ...overrides,
  };
  const result = render(<ActionBar {...defaultProps} />);
  return { ...result, props: defaultProps };
}

describe("ActionBar", () => {
  describe("Skip Turn button", () => {
    it("calls onSkip when clicked and enabled", () => {
      const { props } = renderActionBar();
      fireEvent.click(screen.getByText("Skip Turn"));
      expect(props.onSkip).toHaveBeenCalledTimes(1);
    });

    it("does not call onSkip when not viewer turn", () => {
      const { props } = renderActionBar({ isViewerTurn: false });
      fireEvent.click(screen.getByText("Skip Turn"));
      expect(props.onSkip).not.toHaveBeenCalled();
    });

    it("does not call onSkip when submitting", () => {
      const { props } = renderActionBar({ isSubmitting: true });
      fireEvent.click(screen.getByText("Skip Turn"));
      expect(props.onSkip).not.toHaveBeenCalled();
    });

    it("does not call onSkip when actionsRemaining is 0", () => {
      const { props } = renderActionBar({ actionsRemaining: 0 });
      fireEvent.click(screen.getByText("Skip Turn"));
      expect(props.onSkip).not.toHaveBeenCalled();
    });
  });

  describe("Capture Attempt button", () => {
    it("shows confirmation prompt on click", () => {
      renderActionBar();
      fireEvent.click(screen.getByText("Capture Attempt"));
      expect(screen.getByText("Are you sure? This ends your turn if wrong.")).toBeTruthy();
    });

    it("does not show confirmation when disabled", () => {
      renderActionBar({ isViewerTurn: false });
      fireEvent.click(screen.getByText("Capture Attempt"));
      expect(screen.queryByText("Are you sure? This ends your turn if wrong.")).toBeNull();
    });

    it("does not show confirmation when captureAttemptFlag is true", () => {
      renderActionBar({ captureAttemptFlag: true });
      fireEvent.click(screen.getByText("Capture Attempt"));
      expect(screen.queryByText("Are you sure? This ends your turn if wrong.")).toBeNull();
    });

    it("does not show confirmation when submitting", () => {
      renderActionBar({ isSubmitting: true });
      fireEvent.click(screen.getByText("Capture Attempt"));
      expect(screen.queryByText("Are you sure? This ends your turn if wrong.")).toBeNull();
    });

    it("does not show confirmation when actionsRemaining is 0", () => {
      renderActionBar({ actionsRemaining: 0 });
      fireEvent.click(screen.getByText("Capture Attempt"));
      expect(screen.queryByText("Are you sure? This ends your turn if wrong.")).toBeNull();
    });
  });

  describe("confirmation flow", () => {
    it("moves focus to Confirm button when confirmation prompt opens", () => {
      renderActionBar();
      fireEvent.click(screen.getByText("Capture Attempt"));
      expect(document.activeElement).toBe(screen.getByText("Confirm"));
    });

    it("calls onCaptureAttempt on Confirm", () => {
      const { props } = renderActionBar();
      fireEvent.click(screen.getByText("Capture Attempt"));
      fireEvent.click(screen.getByText("Confirm"));
      expect(props.onCaptureAttempt).toHaveBeenCalledTimes(1);
    });

    it("hides confirmation prompt after Confirm", () => {
      renderActionBar();
      fireEvent.click(screen.getByText("Capture Attempt"));
      fireEvent.click(screen.getByText("Confirm"));
      expect(screen.queryByText("Are you sure? This ends your turn if wrong.")).toBeNull();
    });

    it("hides confirmation prompt on Cancel", () => {
      renderActionBar();
      fireEvent.click(screen.getByText("Capture Attempt"));
      fireEvent.click(screen.getByText("Cancel"));
      expect(screen.queryByText("Are you sure? This ends your turn if wrong.")).toBeNull();
    });

    it("returns focus to Capture button on Cancel", () => {
      renderActionBar();
      const captureButton = screen.getByText("Capture Attempt");
      fireEvent.click(captureButton);
      fireEvent.click(screen.getByText("Cancel"));
      expect(document.activeElement).toBe(captureButton);
    });

    it("does not call onCaptureAttempt on Cancel", () => {
      const { props } = renderActionBar();
      fireEvent.click(screen.getByText("Capture Attempt"));
      fireEvent.click(screen.getByText("Cancel"));
      expect(props.onCaptureAttempt).not.toHaveBeenCalled();
    });
  });

  describe("disabled states (aria-disabled)", () => {
    it("sets aria-disabled on both buttons when not viewer turn", () => {
      renderActionBar({ isViewerTurn: false });
      expect(screen.getByText("Skip Turn").getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByText("Capture Attempt").getAttribute("aria-disabled")).toBe("true");
    });

    it("sets aria-disabled on Capture when captureAttemptFlag is true", () => {
      renderActionBar({ captureAttemptFlag: true });
      expect(screen.getByText("Capture Attempt").getAttribute("aria-disabled")).toBe("true");
    });

    it("sets aria-disabled on both buttons when submitting", () => {
      renderActionBar({ isSubmitting: true });
      expect(screen.getByText("Skip Turn").getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByText("Capture Attempt").getAttribute("aria-disabled")).toBe("true");
    });

    it("sets aria-disabled on both buttons when actionsRemaining is 0", () => {
      renderActionBar({ actionsRemaining: 0 });
      expect(screen.getByText("Skip Turn").getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByText("Capture Attempt").getAttribute("aria-disabled")).toBe("true");
    });

    it("does not set aria-disabled when fully enabled", () => {
      renderActionBar();
      expect(screen.getByText("Skip Turn").getAttribute("aria-disabled")).toBe("false");
      expect(screen.getByText("Capture Attempt").getAttribute("aria-disabled")).toBe("false");
    });

    it("captureAttemptFlag disables only Capture, not Skip", () => {
      renderActionBar({ captureAttemptFlag: true });
      expect(screen.getByText("Skip Turn").getAttribute("aria-disabled")).toBe("false");
      expect(screen.getByText("Capture Attempt").getAttribute("aria-disabled")).toBe("true");
    });
  });

  describe("error display", () => {
    it("renders error in an alert region when error is non-null", () => {
      renderActionBar({ error: "It is not your turn yet." });
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toBe("It is not your turn yet.");
      expect(alert.getAttribute("aria-live")).toBe("assertive");
    });

    it("does not render alert region when error is null", () => {
      renderActionBar({ error: null });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("removes the alert region when error transitions from non-null to null", () => {
      const { rerender } = render(
        <ActionBar
          isViewerTurn={true}
          isSubmitting={false}
          actionsRemaining={1}
          captureAttemptFlag={false}
          error="Some error"
          onSkip={vi.fn()}
          onCaptureAttempt={vi.fn()}
        />
      );
      expect(screen.getByRole("alert")).toBeTruthy();

      rerender(
        <ActionBar
          isViewerTurn={true}
          isSubmitting={false}
          actionsRemaining={1}
          captureAttemptFlag={false}
          error={null}
          onSkip={vi.fn()}
          onCaptureAttempt={vi.fn()}
        />
      );
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
