import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResponse, ApiResponse, HolderDrilldownResponse } from "../types";

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

type Holder = AnalysisResponse["holderInsights"][number];

export interface UseHolderDetailResult {
  holderDetail: HolderDrilldownResponse | null;
  holderDetailLoading: boolean;
  holderDetailError: string | null;
  loadHolderDetail: (
    target: { goodId: string; taskId: number; steamId?: string | null },
    page?: number,
  ) => Promise<void>;
  openHolderDetail: (holder: Holder, goodId?: string | null) => void;
  closeHolderDetail: () => void;
}

export function useHolderDetail(): UseHolderDetailResult {
  const [holderDetail, setHolderDetail] = useState<HolderDrilldownResponse | null>(null);
  const [holderDetailLoading, setHolderDetailLoading] = useState(false);
  const [holderDetailError, setHolderDetailError] = useState<string | null>(null);
  const holderPageSizeRef = useRef(24);
  const holderRequestIdRef = useRef(0);
  const holderAbortRef = useRef<AbortController | null>(null);

  const cancelHolderRequest = useCallback(() => {
    holderRequestIdRef.current += 1;
    holderAbortRef.current?.abort();
    holderAbortRef.current = null;
  }, []);

  const loadHolderDetail = useCallback(
    async (
      target: { goodId: string; taskId: number; steamId?: string | null },
      page = 1,
    ) => {
      cancelHolderRequest();
      const requestId = holderRequestIdRef.current;
      const controller = new AbortController();
      holderAbortRef.current = controller;
      setHolderDetailLoading(true);
      setHolderDetailError(null);

      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: String(holderPageSizeRef.current),
        });
        if (target.steamId) query.set("steamId", target.steamId);

        const next = await requestJson<HolderDrilldownResponse>(
          `/api/items/${target.goodId}/holders/${target.taskId}?${query.toString()}`,
          { signal: controller.signal },
        );
        if (requestId !== holderRequestIdRef.current) return;
        setHolderDetail(next);
      } catch (caughtError) {
        if (isAbortError(caughtError) || requestId !== holderRequestIdRef.current) return;
        setHolderDetailError(
          caughtError instanceof Error ? caughtError.message : "席位详情获取失败",
        );
      } finally {
        if (requestId !== holderRequestIdRef.current) return;
        if (holderAbortRef.current === controller) {
          holderAbortRef.current = null;
        }
        setHolderDetailLoading(false);
      }
    },
    [cancelHolderRequest],
  );

  const openHolderDetail = useCallback(
    (holder: Holder, goodId?: string | null) => {
      if (!goodId || !holder.taskId) return;
      void loadHolderDetail({
        goodId,
        taskId: holder.taskId,
        steamId: holder.steamId ?? null,
      });
    },
    [loadHolderDetail],
  );

  const closeHolderDetail = useCallback(() => {
    cancelHolderRequest();
    setHolderDetail(null);
    setHolderDetailError(null);
    setHolderDetailLoading(false);
  }, [cancelHolderRequest]);

  useEffect(() => () => cancelHolderRequest(), [cancelHolderRequest]);

  return {
    holderDetail,
    holderDetailLoading,
    holderDetailError,
    loadHolderDetail,
    openHolderDetail,
    closeHolderDetail,
  };
}
