import { useCallback, useEffect, useState } from "react";
import type { RefreshRuntimeStatus } from "../types";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.ok) throw new Error(json.error || "请求失败");
  return json.data as T;
}

export interface UseRuntimeStatusOptions {
  /** Enable polling once true. */
  configured: boolean;
}

export interface UseRuntimeStatusResult {
  refreshStatus: RefreshRuntimeStatus | null;
  refreshRuntimeStatus: () => Promise<void>;
}

/**
 * Polls /api/refresh/status at 4s (while job running) or 15s (idle).
 */
export function useRuntimeStatus({ configured }: UseRuntimeStatusOptions): UseRuntimeStatusResult {
  const [refreshStatus, setRefreshStatus] = useState<RefreshRuntimeStatus | null>(null);

  const refreshRuntimeStatus = useCallback(async () => {
    const next = await requestJson<RefreshRuntimeStatus>("/api/refresh/status");
    setRefreshStatus(next);
  }, []);

  useEffect(() => {
    if (!configured) return;
    const timeout = window.setTimeout(
      () => {
        void refreshRuntimeStatus();
      },
      refreshStatus?.running ? 4_000 : 15_000,
    );
    return () => window.clearTimeout(timeout);
  }, [configured, refreshStatus?.running, refreshStatus?.lastRunAt, refreshRuntimeStatus]);

  return { refreshStatus, refreshRuntimeStatus };
}
