import { useCallback, useState } from "react";
import type { ApiResponse, WatchlistSummary } from "../types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.ok) throw new Error(json.error || "请求失败");
  return json.data as T;
}

export interface UseWatchlistOptions {
  onError: (message: string) => void;
  /**
   * Called when the watchlist first loads and nothing is selected.
   * Caller decides what "selecting" means (e.g., wires into useAnalysisData.setSelectedId).
   */
  onAutoSelect?: (goodId: string) => void;
  /** Read current selection to decide whether auto-select should fire. */
  getSelectedId?: () => string | null;
}

export interface UseWatchlistResult {
  watchlist: WatchlistSummary[];
  watchlistLoading: boolean;
  refreshWatchlist: (force?: boolean) => Promise<void>;
  removeWatch: (goodId: string) => Promise<void>;
  addWatch: (goodId: string, name: string) => Promise<void>;
}

export function useWatchlist({
  onError,
  onAutoSelect,
  getSelectedId,
}: UseWatchlistOptions): UseWatchlistResult {
  const [watchlist, setWatchlist] = useState<WatchlistSummary[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  const refreshWatchlist = useCallback(
    async (force = false) => {
      setWatchlistLoading(true);
      try {
        const payload = await requestJson<{ configured: boolean; items: WatchlistSummary[] }>(
          `/api/watchlist/analysis${force ? "?force=1" : ""}`,
        );
        setWatchlist(payload.items);

        if (
          onAutoSelect &&
          !getSelectedId?.() &&
          payload.items.length > 0
        ) {
          onAutoSelect(payload.items[0].goodId);
        }
      } catch (caughtError) {
        onError(
          caughtError instanceof Error ? caughtError.message : "监控池刷新失败",
        );
      } finally {
        setWatchlistLoading(false);
      }
    },
    [onError, onAutoSelect, getSelectedId],
  );

  const addWatch = useCallback(
    async (goodId: string, name: string) => {
      try {
        await requestJson("/api/config/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goodId, name }),
        });
      } catch (caughtError) {
        onError(
          caughtError instanceof Error ? caughtError.message : "加入监控失败",
        );
      }
    },
    [onError],
  );

  const removeWatch = useCallback(
    async (goodId: string) => {
      try {
        await requestJson(`/api/config/watchlist/${goodId}`, { method: "DELETE" });
      } catch (caughtError) {
        onError(
          caughtError instanceof Error ? caughtError.message : "移除失败",
        );
      }
    },
    [onError],
  );

  return { watchlist, watchlistLoading, refreshWatchlist, removeWatch, addWatch };
}
