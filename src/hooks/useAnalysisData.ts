import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { AnalysisResponse, HistoryPlaybackResponse, WatchlistSummary } from "../types";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.ok) throw new Error(json.error || "请求失败");
  return json.data as T;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function needsLlmBackfill(analysis: AnalysisResponse | null): boolean {
  return Boolean(
    analysis &&
      analysis.llm.status === "degraded" &&
      analysis.llm.generatedAt == null &&
      !analysis.llm.error,
  );
}

export interface UseAnalysisDataOptions {
  configured: boolean;
  watchlist: WatchlistSummary[];
  /** Changing value (e.g. refreshStatus.lastRunAt) re-triggers a reload for selectedId. */
  refreshTick?: string | null;
  onError: (message: string) => void;
  /** Fires when selectedId changes, so caller can close downstream UI (holder modal, etc). */
  onSelectionChange?: (next: string | null) => void;
}

export interface UseAnalysisDataResult {
  analysis: AnalysisResponse | null;
  historyPlayback: HistoryPlaybackResponse | null;
  loading: boolean;
  analysisSyncing: boolean;
  isSwitchPending: boolean;
  selectedId: string | null;
  selectItem: (goodId: string) => void;
  reloadAnalysis: (force?: boolean) => Promise<void>;
  reloadHistory: () => Promise<void>;
  setSelectedId: (goodId: string | null) => void;
}

export function useAnalysisData({
  configured,
  watchlist,
  refreshTick,
  onError,
  onSelectionChange,
}: UseAnalysisDataOptions): UseAnalysisDataResult {
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [historyPlayback, setHistoryPlayback] = useState<HistoryPlaybackResponse | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [isSwitchPending, startSwitchTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [analysisSyncing, setAnalysisSyncing] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  const analysisCacheRef = useRef<Record<string, AnalysisResponse>>({});
  const historyCacheRef = useRef<Record<string, HistoryPlaybackResponse>>({});
  const llmPollAttemptsRef = useRef<Record<string, number>>({});
  const analysisAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const cacheAnalysis = useCallback((next: AnalysisResponse) => {
    analysisCacheRef.current[next.item.goodId] = next;
  }, []);

  const cacheHistory = useCallback((next: HistoryPlaybackResponse) => {
    historyCacheRef.current[next.goodId] = next;
  }, []);

  const requestAnalysisFast = useCallback(
    async (
      goodId: string,
      {
        force = false,
        mode = "deep",
        background = false,
      }: { force?: boolean; mode?: "summary" | "deep"; background?: boolean } = {},
    ) => {
      if (!background && !force && mode === "deep") {
        const cached = analysisCacheRef.current[goodId];
        if (cached) {
          setAnalysis(cached);
          void requestAnalysisFast(goodId, { mode: "deep", background: true });
          return cached;
        }
      }

      const controller = new AbortController();
      if (!background) {
        analysisAbortRef.current?.abort();
        analysisAbortRef.current = controller;
        setLoading(mode === "summary");
        setAnalysisSyncing(mode === "deep");
      } else if (mode === "deep" && goodId === selectedIdRef.current) {
        setAnalysisSyncing(true);
      }

      try {
        const query = new URLSearchParams();
        if (force) query.set("force", "1");
        if (mode === "summary") query.set("mode", "summary");

        const next = await requestJson<AnalysisResponse>(
          `/api/items/${goodId}/analysis${query.size > 0 ? `?${query.toString()}` : ""}`,
          { signal: controller.signal },
        );
        cacheAnalysis(next);
        if (goodId === selectedIdRef.current) setAnalysis(next);
        return next;
      } catch (caughtError) {
        if (isAbortError(caughtError)) return null;
        if (!background) {
          onErrorRef.current(
            caughtError instanceof Error ? caughtError.message : "饰品分析获取失败",
          );
        }
        return null;
      } finally {
        if (!background) {
          if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
          setLoading(false);
          if (mode === "summary") setAnalysisSyncing(false);
        }
        if (mode === "deep" && goodId === selectedIdRef.current) {
          setAnalysisSyncing(false);
        }
      }
    },
    [cacheAnalysis],
  );

  const loadHistory = useCallback(
    async (goodId: string, background = false) => {
      if (!background) {
        const cached = historyCacheRef.current[goodId];
        if (cached) {
          setHistoryPlayback(cached);
          void loadHistory(goodId, true);
          return;
        }
      }

      const controller = new AbortController();
      if (!background) {
        historyAbortRef.current?.abort();
        historyAbortRef.current = controller;
      }

      try {
        const next = await requestJson<HistoryPlaybackResponse>(
          `/api/items/${goodId}/history`,
          { signal: controller.signal },
        );
        cacheHistory(next);
        if (goodId === selectedIdRef.current) setHistoryPlayback(next);
      } catch (caughtError) {
        if (isAbortError(caughtError)) return;
        if (goodId === selectedIdRef.current) {
          setHistoryPlayback((current) =>
            current?.goodId === goodId
              ? { goodId, snapshotsAvailable: 0, latestAt: null, points: [] }
              : current,
          );
        }
      } finally {
        if (!background && historyAbortRef.current === controller) {
          historyAbortRef.current = null;
        }
      }
    },
    [cacheHistory],
  );

  const selectItem = useCallback(
    (goodId: string) => {
      if (goodId === selectedIdRef.current) return;

      const cachedAnalysis = analysisCacheRef.current[goodId];
      if (cachedAnalysis) setAnalysis(cachedAnalysis);

      const cachedHistory = historyCacheRef.current[goodId];
      if (cachedHistory) setHistoryPlayback(cachedHistory);

      startSwitchTransition(() => {
        setSelectedIdState(goodId);
      });
    },
    [startSwitchTransition],
  );

  const setSelectedId = useCallback((goodId: string | null) => {
    setSelectedIdState(goodId);
  }, []);

  const reloadAnalysis = useCallback(
    async (force = false) => {
      const id = selectedIdRef.current;
      if (!id) return;
      await requestAnalysisFast(id, { force, mode: "deep", background: false });
    },
    [requestAnalysisFast],
  );

  const reloadHistory = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    await loadHistory(id);
  }, [loadHistory]);

  // Notify caller when selection changes so it can clean up downstream UI.
  useEffect(() => {
    onSelectionChangeRef.current?.(selectedId);
  }, [selectedId]);

  // Background summary prefetch for nearby watchlist items (cache warming).
  useEffect(() => {
    if (!configured || watchlist.length <= 1) return;

    const queued = watchlist
      .filter(
        (item) => item.goodId !== selectedId && !analysisCacheRef.current[item.goodId],
      )
      .slice(0, 2);

    if (queued.length === 0) return;

    const timeouts = queued.map((item, index) =>
      window.setTimeout(() => {
        void requestAnalysisFast(item.goodId, { mode: "summary", background: true });
      }, 1200 * (index + 1)),
    );

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [watchlist, selectedId, configured, requestAnalysisFast]);

  // Primary load-on-selection effect.
  useEffect(() => {
    if (selectedId && configured) {
      llmPollAttemptsRef.current[selectedId] = 0;
      const cachedAnalysis = analysisCacheRef.current[selectedId];
      if (cachedAnalysis) {
        setAnalysis(cachedAnalysis);
        setLoading(false);
        void requestAnalysisFast(selectedId, { mode: "deep", background: true });
      } else {
        void requestAnalysisFast(selectedId, { mode: "summary" }).then((next) => {
          if (next && selectedIdRef.current === selectedId) {
            void requestAnalysisFast(selectedId, { mode: "deep", background: true });
          }
        });
      }
      void loadHistory(selectedId);
    } else if (!selectedId) {
      setAnalysis(null);
      setHistoryPlayback(null);
    }
  }, [selectedId, configured, requestAnalysisFast, loadHistory]);

  // LLM backfill polling — up to 8 attempts, 8 seconds apart.
  useEffect(() => {
    if (!selectedId || !analysis || analysis.item.goodId !== selectedId) return;
    if (!needsLlmBackfill(analysis)) return;

    const attempts = llmPollAttemptsRef.current[selectedId] ?? 0;
    if (attempts >= 8) return;

    const timeout = window.setTimeout(() => {
      llmPollAttemptsRef.current[selectedId] = attempts + 1;
      void requestAnalysisFast(selectedId, { mode: "deep", background: false });
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [analysis, selectedId, requestAnalysisFast]);

  // Reload on external refresh tick (e.g. backend batch job finished).
  useEffect(() => {
    if (!configured || !refreshTick || !selectedIdRef.current) return;
    void requestAnalysisFast(selectedIdRef.current, {
      force: false,
      mode: "deep",
      background: false,
    });
    void loadHistory(selectedIdRef.current);
  }, [configured, refreshTick, requestAnalysisFast, loadHistory]);

  return {
    analysis,
    historyPlayback,
    loading,
    analysisSyncing,
    isSwitchPending,
    selectedId,
    selectItem,
    reloadAnalysis,
    reloadHistory,
    setSelectedId,
  };
}
