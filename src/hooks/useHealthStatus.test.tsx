// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHealthStatus } from "./useHealthStatus";
import type { HealthResponse } from "../types";

const sampleHealth: HealthResponse = {
  checkedAt: "2026-01-01T00:00:00.000Z",
  configured: true,
  llmEnabled: true,
  autoRefreshEnabled: true,
  dataSources: {
    csqaqConfigured: true,
    csfloatConfigured: false,
    llmEnabled: true,
  },
  watchlistCount: 1,
  portfolioCount: 0,
  snapshots: {
    itemCount: 1,
    rowCount: 2,
    latestAt: "2026-01-01T00:00:00.000Z",
  },
  autoRefresh: {
    enabled: true,
    intervalMinutes: 20,
    includeDeep: true,
    maxDeepItems: 3,
    running: false,
    lastRunAt: null,
    nextRunAt: null,
    lastRunMs: null,
    lastRunSummaryCount: 0,
    lastRunDeepCount: 0,
    lastRunTriggeredBy: null,
    lastError: null,
  },
  scanner: {
    enabled: true,
    paused: false,
    autofilling: false,
    completedRoundsInCycle: 0,
    totalRoundsCompleted: 0,
    lastRoundAt: null,
    lastBatchCandidates: [],
  },
  recentError: null,
};

function response(payload: unknown, ok = true) {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe("useHealthStatus", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps polling after a failed health request", async () => {
    const states: Array<ReturnType<typeof useHealthStatus>> = [];
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(response({ ok: true, data: sampleHealth }));
    vi.stubGlobal("fetch", fetchMock);

    function Probe() {
      const state = useHealthStatus({ enabled: true });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.healthStatusError).toBe("network down");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.healthStatus?.checkedAt).toBe(sampleHealth.checkedAt);
    expect(states.at(-1)?.healthStatusError).toBeNull();
  });

  it("times out a hung health request and schedules the next poll", async () => {
    const states: Array<ReturnType<typeof useHealthStatus>> = [];
    const fetchMock = vi.fn((_: string, init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      }

      return Promise.resolve(response({ ok: true, data: sampleHealth }));
    });
    vi.stubGlobal("fetch", fetchMock);

    function Probe() {
      const state = useHealthStatus({ enabled: true });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(states.at(-1)?.healthStatusLoading).toBe(false);
    expect(states.at(-1)?.healthStatusError).toContain("超时");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.healthStatus?.checkedAt).toBe(sampleHealth.checkedAt);
    expect(states.at(-1)?.healthStatusError).toBeNull();
  });

  it("ignores older health responses when requests overlap", async () => {
    const states: Array<ReturnType<typeof useHealthStatus>> = [];
    const first = deferred<Response>();
    const second = deferred<Response>();
    const newerHealth = { ...sampleHealth, checkedAt: "2026-01-01T00:01:00.000Z" };
    const olderHealth = { ...sampleHealth, checkedAt: "2026-01-01T00:00:00.000Z" };
    const signals: AbortSignal[] = [];
    const fetchMock = vi
      .fn((_url: string, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        return fetchMock.mock.calls.length === 1 ? first.promise : second.promise;
      });
    vi.stubGlobal("fetch", fetchMock);

    function Probe() {
      const state = useHealthStatus({ enabled: false });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });

    act(() => {
      void states.at(-1)?.refreshHealthStatus();
      void states.at(-1)?.refreshHealthStatus();
    });
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      second.resolve(response({ ok: true, data: newerHealth }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(states.at(-1)?.healthStatus?.checkedAt).toBe(newerHealth.checkedAt);
    expect(states.at(-1)?.healthStatusLoading).toBe(false);

    await act(async () => {
      first.resolve(response({ ok: true, data: olderHealth }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(states.at(-1)?.healthStatus?.checkedAt).toBe(newerHealth.checkedAt);
    expect(states.at(-1)?.healthStatusLoading).toBe(false);
  });

  it("keeps stale health warnings visible while retrying", async () => {
    const states: Array<ReturnType<typeof useHealthStatus>> = [];
    const pendingRetry = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ ok: true, data: sampleHealth }))
      .mockRejectedValueOnce(new Error("health failed"))
      .mockReturnValueOnce(pendingRetry.promise);
    vi.stubGlobal("fetch", fetchMock);

    function Probe() {
      const state = useHealthStatus({ enabled: false });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });

    await act(async () => {
      await states.at(-1)?.refreshHealthStatus();
    });
    await act(async () => {
      await states.at(-1)?.refreshHealthStatus();
    });
    expect(states.at(-1)?.healthStatusStale).toBe(true);
    expect(states.at(-1)?.healthStatusError).toBe("health failed");

    act(() => {
      void states.at(-1)?.refreshHealthStatus();
    });
    expect(states.at(-1)?.healthStatusStale).toBe(true);
    expect(states.at(-1)?.healthStatusError).toBe("health failed");

    await act(async () => {
      pendingRetry.resolve(response({ ok: true, data: { ...sampleHealth, checkedAt: "2026-01-01T00:02:00.000Z" } }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(states.at(-1)?.healthStatusStale).toBe(false);
    expect(states.at(-1)?.healthStatusError).toBeNull();
  });

  it("does not publish an in-flight polling result after polling is disabled", async () => {
    const states: Array<ReturnType<typeof useHealthStatus>> = [];
    const pending = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetchMock);

    function Probe({ enabled }: { enabled: boolean }) {
      const state = useHealthStatus({ enabled });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe enabled />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.healthStatusLoading).toBe(true);

    await act(async () => {
      root.render(<Probe enabled={false} />);
    });
    expect(states.at(-1)?.healthStatusLoading).toBe(false);
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      pending.resolve(response({ ok: true, data: sampleHealth }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(states.at(-1)?.healthStatus).toBeNull();
  });
});
