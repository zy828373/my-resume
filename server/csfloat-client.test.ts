import { afterEach, describe, expect, it, vi } from "vitest";
import { CsfloatClient } from "./csfloat-client.js";

describe("CsfloatClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("degrades when the initial listings request times out", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CsfloatClient();
    const request = client.getListingSummary("AK-47 | Redline");

    await vi.advanceTimersByTimeAsync(10_000);
    const summary = await request;

    expect(summary.enabled).toBe(false);
    expect(summary.limitation).toContain("timed out");
  });

  it("degrades when the listings response body stalls", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CsfloatClient();
    const request = client.getListingSummary("AK-47 | Redline");

    await vi.advanceTimersByTimeAsync(10_000);
    const summary = await request;

    expect(summary.enabled).toBe(false);
    expect(summary.limitation).toContain("timed out");
  });
});
