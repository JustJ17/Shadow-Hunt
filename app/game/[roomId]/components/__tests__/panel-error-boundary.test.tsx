/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PanelErrorBoundary } from "../panel-error-boundary";

// Suppress React error boundary console noise in tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test render crash");
  }
  return <div data-testid="child-content">Hello panel</div>;
}

describe("PanelErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <PanelErrorBoundary panelName="Notebook">
        <ThrowingChild shouldThrow={false} />
      </PanelErrorBoundary>
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.queryByText("Notebook failed to render")).not.toBeInTheDocument();
  });

  it("renders fallback UI when a child throws during render", () => {
    render(
      <PanelErrorBoundary panelName="Notebook">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>
    );

    expect(screen.getByText("Notebook failed to render")).toBeInTheDocument();
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
  });

  it("includes the panel name in the fallback message", () => {
    render(
      <PanelErrorBoundary panelName="Event Feed">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>
    );

    expect(screen.getByText("Event Feed failed to render")).toBeInTheDocument();
  });

  it("renders fallback in a muted container with appropriate styling", () => {
    render(
      <PanelErrorBoundary panelName="TurnHud">
        <ThrowingChild shouldThrow={true} />
      </PanelErrorBoundary>
    );

    const fallback = screen.getByText("TurnHud failed to render");
    expect(fallback.className).toContain("bg-gray-800");
    expect(fallback.className).toContain("text-gray-400");
    expect(fallback.className).toContain("rounded-lg");
    expect(fallback.className).toContain("p-4");
  });

  it("isolates errors — sibling boundaries remain unaffected", () => {
    render(
      <div>
        <PanelErrorBoundary panelName="Broken">
          <ThrowingChild shouldThrow={true} />
        </PanelErrorBoundary>
        <PanelErrorBoundary panelName="Working">
          <ThrowingChild shouldThrow={false} />
        </PanelErrorBoundary>
      </div>
    );

    expect(screen.getByText("Broken failed to render")).toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.queryByText("Working failed to render")).not.toBeInTheDocument();
  });
});
