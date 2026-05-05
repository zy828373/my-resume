import { useCallback, useState } from "react";
import type { MarketAnalysisResponse, MarketIndex } from "../types";

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

export interface UseMarketResult {
  market: MarketIndex[];
  marketAnalysis: MarketAnalysisResponse | null;
  marketAnalysisLoading: boolean;
  marketAnalysisError: string | null;
  refreshMarketOverview: () => Promise<void>;
  refreshMarketAnalysis: () => Promise<MarketAnalysisResponse | null>;
}

export function useMarket(): UseMarketResult {
  const [market, setMarket] = useState<MarketIndex[]>([]);
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysisResponse | null>(null);
  const [marketAnalysisLoading, setMarketAnalysisLoading] = useState(false);
  const [marketAnalysisError, setMarketAnalysisError] = useState<string | null>(null);

  const refreshMarketOverview = useCallback(async () => {
    const rows = await requestJson<MarketIndex[]>("/api/market/overview");
    setMarket(rows);
  }, []);

  const refreshMarketAnalysis = useCallback(async () => {
    setMarketAnalysisLoading(true);
    setMarketAnalysisError(null);
    try {
      const next = await requestJson<MarketAnalysisResponse>("/api/market/analysis");
      setMarketAnalysis(next);
      return next;
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "指数分析加载失败";
      setMarketAnalysisError(message);
      return null;
    } finally {
      setMarketAnalysisLoading(false);
    }
  }, []);

  return {
    market,
    marketAnalysis,
    marketAnalysisLoading,
    marketAnalysisError,
    refreshMarketOverview,
    refreshMarketAnalysis,
  };
}
