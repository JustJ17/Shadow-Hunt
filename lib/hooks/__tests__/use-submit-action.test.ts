/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSubmitAction } from "@/lib/hooks/use-submit-action";
import type { ActionPayload } from "@/lib/turn-engine/types";

describe("useSubmitAction", () => {
  const roomId = "room-123";
  let refetch: () => void;

  beforeEach(() => {
    refetch = vi.fn() as unknown as () => void;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchSuccess() {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, actionType: "SKIP", actionsRemaining: 0 }),
      } as Response)
    );
  }

  function mockFetchError(code: string, status = 400) {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({ success: false, code, error: "Some error" }),
      } as Response)
    );
  }

  function mockFetchNetworkFailure() {
    global.fetch = vi.fn(() => Promise.reject(new Error("Failed to fetch")));
  }

  describe("initial state", () => {
    it("returns isSubmitting=false and error=null initially", () => {
      mockFetchSuccess();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.submit).toBe("function");
    });
  });

  describe("successful submission", () => {
    it("sends POST to correct endpoint with payload as JSON body", async () => {
      mockFetchSuccess();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      const payload: ActionPayload = { actionType: "SKIP" };

      await act(async () => {
        await result.current.submit(payload);
      });

      expect(global.fetch).toHaveBeenCalledWith(`/api/game/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    });

    it("calls refetch on 2xx response", async () => {
      mockFetchSuccess();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("sets isSubmitting=true during request and false after", async () => {
      let resolveFetch!: (value: Response) => void;
      global.fetch = vi.fn(
        () => new Promise<Response>((resolve) => { resolveFetch = resolve; })
      );

      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submit({ actionType: "SKIP" });
      });

      // isSubmitting should be true while request is pending
      expect(result.current.isSubmitting).toBe(true);

      await act(async () => {
        resolveFetch({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response);
        await submitPromise!;
      });

      expect(result.current.isSubmitting).toBe(false);
    });

    it("clears error at start of new submission", async () => {
      // First: set an error
      mockFetchError("NOT_YOUR_TURN", 403);
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.error).not.toBeNull();

      // Second: new submission clears it
      mockFetchSuccess();
      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("sets error from error code on non-2xx response", async () => {
      mockFetchError("NOT_YOUR_TURN", 403);
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.error).toBe("It is not your turn yet.");
      expect(refetch).not.toHaveBeenCalled();
    });

    it("calls refetch on CONCURRENCY_CONFLICT in addition to setting error", async () => {
      mockFetchError("CONCURRENCY_CONFLICT", 409);
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.error).toBe(
        "Another action was processed simultaneously. The board has been refreshed."
      );
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("sets UNKNOWN error on network failure", async () => {
      mockFetchNetworkFailure();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.error).toBe(
        "Something went wrong. Please check your connection and try again."
      );
    });

    it("falls back to UNKNOWN when response has no code field", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: "Internal server error" }),
        } as Response)
      );
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.error).toBe(
        "Something went wrong. Please check your connection and try again."
      );
    });

    it("sets isSubmitting=false after error response", async () => {
      mockFetchError("GAME_NOT_ACTIVE", 400);
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe("in-flight guard", () => {
    it("rejects concurrent submit calls — only one request is sent", async () => {
      let resolveFetch!: (value: Response) => void;
      global.fetch = vi.fn(
        () => new Promise<Response>((resolve) => { resolveFetch = resolve; })
      );

      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      let promise1: Promise<void>;
      act(() => {
        promise1 = result.current.submit({ actionType: "SKIP" });
      });

      // Attempt a second submit while first is in-flight
      act(() => {
        result.current.submit({ actionType: "MOVE", targetLocationId: "loc-1" });
      });

      await act(async () => {
        resolveFetch({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response);
        await promise1!;
      });

      // Only one fetch call was made
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/game/${roomId}/action`,
        expect.objectContaining({
          body: JSON.stringify({ actionType: "SKIP" }),
        })
      );
    });
  });

  describe("MOVE payload", () => {
    it("sends MOVE action with targetLocationId", async () => {
      mockFetchSuccess();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      const payload: ActionPayload = { actionType: "MOVE", targetLocationId: "loc-xyz" };

      await act(async () => {
        await result.current.submit(payload);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/game/${roomId}/action`,
        expect.objectContaining({
          body: JSON.stringify(payload),
        })
      );
    });
  });

  describe("USE_CARD payload", () => {
    it("sends USE_CARD action with cardId and optional targetPlayerId", async () => {
      mockFetchSuccess();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      const payload: ActionPayload = {
        actionType: "USE_CARD",
        cardId: "card-42",
        targetPlayerId: "player-2",
      };

      await act(async () => {
        await result.current.submit(payload);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/game/${roomId}/action`,
        expect.objectContaining({
          body: JSON.stringify(payload),
        })
      );
    });
  });

  describe("CAPTURE_ATTEMPT payload", () => {
    it("sends CAPTURE_ATTEMPT action with correct payload", async () => {
      mockFetchSuccess();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      const payload: ActionPayload = { actionType: "CAPTURE_ATTEMPT" };

      await act(async () => {
        await result.current.submit(payload);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/game/${roomId}/action`,
        expect.objectContaining({
          body: JSON.stringify(payload),
        })
      );
    });
  });

  describe("isSubmitting lifecycle — network failure", () => {
    it("sets isSubmitting=false after network failure", async () => {
      mockFetchNetworkFailure();
      const { result } = renderHook(() => useSubmitAction(roomId, refetch));

      await act(async () => {
        await result.current.submit({ actionType: "SKIP" });
      });

      expect(result.current.isSubmitting).toBe(false);
    });
  });
});
