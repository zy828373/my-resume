import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse, HealthResponse } from "../types";

const HEALTH_POLL_INTERVAL_MS = 20_000;
const HEALTH_REQUEST_TIMEOUT_MS = 10_000;

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, HEALTH_REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abort, { once: true });
  }

  try {
    const response = await fetch(url, { signal: controller.signal });
    const json = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !json.ok) throw new Error(json.error || "请求失败");
    return json.data as T;
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new Error("健康状态请求超时");
    }

    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    window.clearTimeout(timeoutId);
  }
}

export function useHealthStatus({ enabled }: { enabled: boolean }) {
  const [healthStatus, setHealthStatus] = useState<HealthResponse | null>(null);
  const [healthStatusLoading, setHealthStatusLoading] = useState(false);
  const [healthStatusError, setHealthStatusError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const activeControllerRef = useRef<AbortController | null>(null);

  const refreshHealthStatus = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setHealthStatusLoading(true);

    try {
      const next = await requestJson<HealthResponse>("/api/health", controller.signal);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setHealthStatus(next);
      setHealthStatusError(null);
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setHealthStatusError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
      setHealthStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        void refreshHealthStatus().finally(() => {
          if (!cancelled) {
            schedule();
          }
        });
      }, HEALTH_POLL_INTERVAL_MS);
    };

    schedule();
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
      if (mountedRef.current) {
        setHealthStatusLoading(false);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, refreshHealthStatus]);

  return {
    healthStatus,
    healthStatusLoading,
    healthStatusError,
    healthStatusStale: Boolean(healthStatus && healthStatusError),
    refreshHealthStatus,
  };
}
