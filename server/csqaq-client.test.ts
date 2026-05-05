import { afterEach, describe, expect, it, vi } from "vitest";
import { CsqaqClient } from "./csqaq-client.js";

describe("CsqaqClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("times out stalled response body reads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CsqaqClient(async () => "token");
    const request = client.request<{ value: number }>("/test");
    const assertion = expect(request).rejects.toThrow(/超时/);

    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it("times out stalled initial fetch requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
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

    const client = new CsqaqClient(async () => "token");
    const request = client.request<{ value: number }>("/test");
    const assertion = expect(request).rejects.toThrow(/超时/);

    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it("preserves upstream HTTP status on non-2xx JSON responses", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ msg: "upstream maintenance" }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CsqaqClient(async () => "token");
    await expect(client.request<{ value: number }>("/test")).rejects.toMatchObject({
      status: 503,
      statusCode: 503,
    });
  });
});
