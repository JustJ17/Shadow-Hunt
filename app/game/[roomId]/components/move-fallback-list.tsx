"use client";

interface MoveFallbackListProps {
  legalMoves: Array<{
    locationId: string;
    locationName: string;
    transport: string;
  }>;
  isViewerTurn: boolean;
  isSubmitting: boolean;
  onMoveSelect: (targetLocationId: string) => void;
}

/**
 * Compact-viewport fallback for move selection.
 * Renders legal move destinations as accessible buttons when the SVG map
 * is hidden on narrow screens (`block sm:hidden`).
 *
 * Requirement: 3.8
 */
export function MoveFallbackList({
  legalMoves,
  isViewerTurn,
  isSubmitting,
  onMoveSelect,
}: MoveFallbackListProps) {
  const isDisabled = !isViewerTurn || isSubmitting;

  if (legalMoves.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-3">
      <h2 className="text-sm font-medium text-gray-400 mb-2">Move to:</h2>
      <ul className="flex flex-col gap-2" role="list">
        {legalMoves.map((move) => (
          <li key={move.locationId}>
            <button
              type="button"
              className={`w-full rounded-md px-3 py-2 text-left text-sm text-white transition-colors ${
                isDisabled
                  ? "bg-gray-800 opacity-50 cursor-not-allowed"
                  : "bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              }`}
              aria-disabled={isDisabled ? "true" : undefined}
              aria-label={`Move to ${move.locationName} via ${move.transport}`}
              onClick={() => {
                if (!isDisabled) {
                  onMoveSelect(move.locationId);
                }
              }}
              onKeyDown={(e) => {
                if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onMoveSelect(move.locationId);
                }
              }}
            >
              {move.locationName}{" "}
              <span className="text-gray-400">({move.transport})</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
