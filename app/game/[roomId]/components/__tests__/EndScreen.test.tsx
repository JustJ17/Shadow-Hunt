/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EndScreen } from "../EndScreen";
import type { GameEventData } from "@/lib/turn-engine/types";
import type { GameResultResponse } from "@/lib/turn-engine/game-result";

// Mock next/link to render as a plain anchor
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// --- Test helpers ---

function makeGameWonEvent(overrides?: Partial<GameEventData>): GameEventData {
  return {
    id: "evt-1",
    sequenceNumber: 10,
    roundNumber: 5,
    type: "game-won",
    payload: {
      winnerId: "player-winner",
      locationId: "loc-capture",
      mastermindLocationId: "loc-mastermind",
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGameDrawEvent(overrides?: Partial<GameEventData>): GameEventData {
  return {
    id: "evt-2",
    sequenceNumber: 10,
    roundNumber: 20,
    type: "game-draw",
    payload: {
      roundNumber: 20,
      mastermindLocationId: "loc-mastermind",
      reason: "max-rounds-exceeded",
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockFetchWithResult(result: GameResultResponse) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(result),
  });
}

function mockFetchTimeout() {
  return vi.fn().mockImplementation(() => {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("AbortError")), 10);
    });
  });
}

function mockFetchFailure() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: "Internal server error" }),
  });
}

const winApiResult: GameResultResponse = {
  outcome: "win",
  winnerId: "player-winner",
  winnerDisplayName: "Alice",
  winLocationId: "loc-capture",
  winLocationName: "Central Park",
  mastermindLocationId: "loc-mastermind",
  mastermindLocationName: "Grand Library",
  roundNumber: 5,
};

const drawApiResult: GameResultResponse = {
  outcome: "draw",
  roundNumber: 20,
  reason: "max-rounds-exceeded",
  mastermindLocationId: "loc-mastermind",
  mastermindLocationName: "Grand Library",
};

// --- Test suite ---

describe("EndScreen", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("Win outcome", () => {
    it("renders winner display name with trophy indicator", async () => {
      global.fetch = mockFetchWithResult(winApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-other"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        // The winner badge has an aria-label "Winner: Alice"
        expect(screen.getByLabelText("Winner: Alice")).toBeInTheDocument();
      });

      // Trophy indicator should be present within the winner badge
      const winnerBadge = screen.getByLabelText("Winner: Alice");
      expect(winnerBadge.textContent).toContain("🏆");
      expect(winnerBadge.textContent).toContain("Alice");
    });

    it('renders "You won!" heading when viewer is the winner', async () => {
      global.fetch = mockFetchWithResult(winApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-winner"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("You won!")).toBeInTheDocument();
      });
    });

    it('renders "[Name] found the target" heading when viewer is not the winner', async () => {
      global.fetch = mockFetchWithResult(winApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-other"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText("Alice found the target")
        ).toBeInTheDocument();
      });
    });

    it("renders mastermind location name for win outcome", async () => {
      global.fetch = mockFetchWithResult(winApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-other"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Grand Library")).toBeInTheDocument();
      });
    });

    it("renders capture location name for win outcome", async () => {
      global.fetch = mockFetchWithResult(winApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-other"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Central Park")).toBeInTheDocument();
      });
    });
  });

  describe("Draw outcome", () => {
    it("renders draw heading", async () => {
      global.fetch = mockFetchWithResult(drawApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-1"
          events={[makeGameDrawEvent()]}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText("Game Ended in a Draw")
        ).toBeInTheDocument();
      });
    });

    it("renders draw reason with round number", async () => {
      global.fetch = mockFetchWithResult(drawApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-1"
          events={[makeGameDrawEvent()]}
        />
      );

      await waitFor(() => {
        // The paragraph contains "Maximum rounds exceeded — no one found the target in 20 rounds."
        expect(
          screen.getByText(/no one found the target in/)
        ).toBeInTheDocument();
      });

      // Verify the "Rounds Played" detail row shows the round number
      expect(screen.getByText("Rounds Played")).toBeInTheDocument();
      // "20" appears both in paragraph and in rounds played row - use getAllByText
      const twentyElements = screen.getAllByText("20");
      expect(twentyElements.length).toBeGreaterThanOrEqual(1);
    });

    it("renders mastermind location name for draw outcome", async () => {
      global.fetch = mockFetchWithResult(drawApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-1"
          events={[makeGameDrawEvent()]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Grand Library")).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it('renders "Return to Lobby" link', async () => {
      global.fetch = mockFetchWithResult(winApiResult);

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-winner"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        const link = screen.getByRole("link", { name: /Return to Lobby/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", "/");
      });
    });
  });

  describe("Fallback and error states", () => {
    it("renders fallback message when API fetch fails", async () => {
      global.fetch = mockFetchFailure();

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-1"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Result details unavailable/)
        ).toBeInTheDocument();
      });
    });

    it("renders fallback message when API times out", async () => {
      global.fetch = mockFetchTimeout();

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-1"
          events={[makeGameWonEvent()]}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Result details unavailable/)
        ).toBeInTheDocument();
      });
    });

    it("renders generic game ended view when no end event in feed and API fails", async () => {
      global.fetch = mockFetchFailure();

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-1"
          events={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Game Ended")).toBeInTheDocument();
      });
    });

    it("renders Return to Lobby link in fallback view", async () => {
      global.fetch = mockFetchFailure();

      render(
        <EndScreen
          roomId="room-1"
          playerId="player-1"
          events={[]}
        />
      );

      await waitFor(() => {
        const link = screen.getByRole("link", { name: /Return to Lobby/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", "/");
      });
    });
  });
});
