/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { GamePollState } from "@/lib/turn-engine/types";

function createMockState(overrides?: Partial<GamePollState>): GamePollState {
  return {
    roomId: "test-room",
    status: "in-progress",
    viewerPlayerId: "p1",
    currentPlayerId: "p1",
    currentRound: 1,
    actionsRemaining: 2,
    actionBudget: 2,
    players: [
      {
        playerId: "p1",
        displayName: "Player 1",
        locationId: "london",
        turnPosition: 0,
        skipNextTurn: false,
      },
    ],
    privateData: {
      notebook: [],
      actionCards: [],
      pendingReward: null,
      skipNextTurn: false,
      actionPenaltyFlag: false,
      pendingExtraTurns: 0,
      pendingClues: [],
    },
    events: [],
    activeBlockades: [],
    ...overrides,
  };
}

describe("useGamePoll — refetch behavior", () => {
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    clearIntervalSpy = vi.spyOn(global, "clearInterval");
    setIntervalSpy = vi.spyOn(global, "setInterval");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function importHook() {
    const mod = await import("@/lib/hooks/use-game-poll");
    return mod.useGamePoll;
  }

  /**
   * Property 12: Refetch resets poll interval and triggers immediate poll
   * Validates: Requirements 7.2
   */
  describe("Property 12: refetch resets interval and triggers immediate poll", () => {
    it("refetch() triggers an immediate fetch call", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockState()),
      } as Response);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      // Wait for initial poll to complete
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Call refetch — should trigger an immediate poll
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    });

    it("refetch() calls clearInterval to clear the existing interval", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockState()),
      } as Response);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Record clearInterval call count before refetch
      const clearCallsBefore = clearIntervalSpy.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      // refetch should have called clearInterval
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(
        clearCallsBefore
      );
    });

    it("refetch() restarts setInterval after clearing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockState()),
      } as Response);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Record setInterval call count before refetch
      const setCallsBefore = setIntervalSpy.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      // refetch should have called setInterval to restart
      expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(setCallsBefore);

      // Verify new interval was started with the poll function and correct interval
      const lastSetIntervalCall =
        setIntervalSpy.mock.calls[setIntervalSpy.mock.calls.length - 1];
      expect(lastSetIntervalCall[1]).toBe(3000); // POLL_INTERVAL_MS
    });

    it("refetch does not initiate a duplicate fetch if a poll is already in-flight", async () => {
      let resolveInflight!: (value: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolveInflight = resolve;
      });
      global.fetch = vi.fn().mockReturnValue(pendingPromise);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      // Initial poll is in-flight (not resolved yet)
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.isLoading).toBe(true);

      // Call refetch while poll is still in-flight — should NOT trigger a second fetch
      act(() => {
        result.current.refetch();
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Resolve the in-flight poll
      await act(async () => {
        resolveInflight({
          ok: true,
          json: () => Promise.resolve(createMockState()),
        } as Response);
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  /**
   * Property 13: Successful refetch updates state and clears error
   * Validates: Requirements 7.5
   */
  describe("Property 13: successful refetch updates state and clears error", () => {
    it("refetch updates state with new data from the server", async () => {
      const initialState = createMockState({ currentRound: 1 });
      const updatedState = createMockState({ currentRound: 2 });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(initialState),
        } as unknown as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(updatedState),
        } as unknown as Response);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.state?.currentRound).toBe(1);

      // Call refetch — should pick up the updated state
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() =>
        expect(result.current.state?.currentRound).toBe(2)
      );
    });

    it("refetch clears a previously set error on success", async () => {
      // First call fails, setting an error
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Server error" }),
        } as unknown as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(createMockState()),
        } as unknown as Response);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      // Wait for initial poll (which fails)
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe("Server error");

      // Refetch — this time it succeeds
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.state).not.toBeNull();
    });

    it("state is updated and error stays null after successful refetch with no prior error", async () => {
      const state1 = createMockState({ currentPlayerId: "p1" });
      const state2 = createMockState({ currentPlayerId: "p2" });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(state1),
        } as unknown as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(state2),
        } as unknown as Response);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.state?.currentPlayerId).toBe("p1");
      expect(result.current.error).toBeNull();

      // Refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() =>
        expect(result.current.state?.currentPlayerId).toBe("p2")
      );
      expect(result.current.error).toBeNull();
    });
  });

  describe("refetch interaction with game-finished state", () => {
    it("refetch still fetches when game transitions to finished status", async () => {
      const activeState = createMockState({ status: "in-progress" });
      const finishedState = createMockState({ status: "finished" });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(activeState),
        } as unknown as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(finishedState),
        } as unknown as Response);

      const useGamePoll = await importHook();
      const { result } = renderHook(() => useGamePoll("room-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.state?.status).toBe("in-progress");

      // Refetch — fetches finished state
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() =>
        expect(result.current.state?.status).toBe("finished")
      );
    });
  });
});
