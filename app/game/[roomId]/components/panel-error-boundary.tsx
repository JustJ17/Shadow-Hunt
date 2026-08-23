"use client";

import React from "react";

interface PanelErrorBoundaryProps {
  panelName: string;
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary that isolates panel rendering failures.
 * When one panel crashes, others remain functional.
 *
 * Requirements: 1.10, 16.1, 16.2
 */
export class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[PanelErrorBoundary] ${this.props.panelName} crashed:`,
      error,
      errorInfo
    );
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="bg-gray-800 text-gray-400 rounded-lg p-4">
          {this.props.panelName} failed to render
        </div>
      );
    }

    return this.props.children;
  }
}
