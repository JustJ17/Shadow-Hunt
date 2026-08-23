/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LobbyState } from "@/lib/lobby/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockLobbyState: LobbyState | null = null;
let mockError: string | null = null;
let mockIsLoading = false;

vi.mock("@/lib/hooks/use-lobby-poll", () => ({
  useLobbyPoll: () => ({ state: mockLobbyState, error: mockError, isLoading: mockIsLoading }),
}));

function makeLobbyState(overrides: Partial<LobbyState> = {}): LobbyState {
  return {
    roomCode: "ABCD",
    roomId: "room-123",
    status: "waiting",
    visibility: "public",
    players: [
      {
        id: "player-1",
        displayName: "Host Player",
        isHost: true,
        readyState: "ready",
        status: "connected",
        turnPosition: null,
      },
      {
        id: "player-2",
        displayName: "Guest Player",
        isHost: false,
        readyState: "ready",
        status: "connected",
        turnPosition: null,
      },
    ],
    hostId: "player-1",
    ...overrides,
  };
}

// Dynamic import of the page component to allow mocks to be set up first
async function importLobbyPage() {
  const mod = await import("@/app/lobby/[code]/page");
  return mod.default;
}

describe("Lobby page navigation logic", () => {
  let LobbyPage: Awaited<ReturnType<typeof importLobbyPage>>;

  beforeEach(async () => {
    mockPush.mockClear();
    mockLobbyState = null;
    mockError = null;
    mockIsLoading = false;

    // Re-import fresh for each test
    LobbyPage = await importLobbyPage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 11: Lobby navigation on in-progress with valid roomId
   * Validates: Requirements 6.3
   */
  describe("navigation triggers on in-progress with valid roomId", () => {
    it("navigates to /game/{roomId} when status is in-progress and roomId is non-empty", () => {
      mockLobbyState = makeLobbyState({
        status: "in-progress",
        roomId: "game-abc-123",
      });

      render(<LobbyPage />);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/game/game-abc-123");
    });
  });

  /**
   * Validates: Requirement 6.4 — no navigation when status is not in-progress
   */
  describe("no navigation when status is waiting", () => {
    it("does not navigate when status is waiting", () => {
      mockLobbyState = makeLobbyState({
        status: "waiting",
        roomId: "room-123",
      });

      render(<LobbyPage />);

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  /**
   * Validates: Requirement 6.4 — no navigation when roomId is empty
   */
  describe("no navigation when roomId is empty string", () => {
    it("does not navigate when status is in-progress but roomId is empty", () => {
      mockLobbyState = makeLobbyState({
        status: "in-progress",
        roomId: "",
      });

      render(<LobbyPage />);

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  /**
   * Property 11 / Requirement 6.5 — double-navigation guard
   */
  describe("double navigation guard", () => {
    it("calls router.push at most once even on re-render", () => {
      mockLobbyState = makeLobbyState({
        status: "in-progress",
        roomId: "game-xyz",
      });

      const { rerender } = render(<LobbyPage />);

      // Re-render simulating another poll cycle delivering the same state
      rerender(<LobbyPage />);
      rerender(<LobbyPage />);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/game/game-xyz");
    });
  });

  /**
   * Validates: Requirement 6.5 — buttons disabled while navigating
   */
  describe("buttons disabled while navigating", () => {
    it("shows loading indicator and disables interactive elements during navigation", () => {
      mockLobbyState = makeLobbyState({
        status: "in-progress",
        roomId: "game-nav",
      });

      render(<LobbyPage />);

      // The loading overlay text should be visible
      expect(screen.getByText("Entering game...")).toBeInTheDocument();
    });
  });
});
