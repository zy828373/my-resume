import { useCallback, useRef, useState } from "react";
import type { AnalysisResponse, HolderDrilldownResponse } from "../types";

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

  const loadHolderDetail = useCallback(
    async (
      target: { goodId: string; taskId: number; steamId?: string | null },
      page = 1,
    ) => {
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
        );
        setHolderDetail(next);
      } catch (caughtError) {
        setHolderDetailError(
          caughtError instanceof Error ? caughtError.message : "席位详情获取失败",
        );
      } finally {
        setHolderDetailLoading(false);
      }
    },
    [],
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
    setHolderDetail(null);
    setHolderDetailError(null);
    setHolderDetailLoading(false);
  }, []);

  return {
    holderDetail,
    holderDetailLoading,
    holderDetailError,
    loadHolderDetail,
    openHolderDetail,
    closeHolderDetail,
  };
}
