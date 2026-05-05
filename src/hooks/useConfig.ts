import { useCallback, useState } from "react";
import type {
  ConfigResponse,
  RecommendationScopeKey,
  ScannerConfig,
  StickerSeriesKey,
} from "../types";

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

export interface ScannerForm {
  enabled: boolean;
  deepAnalyzeLimit: string;
  recommendationLimit: string;
  featuredLimit: string;
  hotWindowSize: string;
  randomSampleSize: string;
  maxRoundsPerCycle: string;
  analysisScopes: RecommendationScopeKey[];
  holoStickerSeries: StickerSeriesKey[];
}

export const DEFAULT_ANALYSIS_SCOPES: RecommendationScopeKey[] = [
  "agent",
  "holo_team_sticker",
  "gun_skin",
  "discontinued_collection_skin",
];

export const DEFAULT_HOLO_STICKER_SERIES: StickerSeriesKey[] = [
  "stockholm_2021",
  "antwerp_2022",
  "rio_2022",
  "paris_2023",
  "copenhagen_2024",
  "shanghai_2024",
  "other",
];

export function createScannerForm(scanner?: ScannerConfig | null): ScannerForm {
  return {
    enabled: scanner?.enabled ?? true,
    deepAnalyzeLimit: String(scanner?.deepAnalyzeLimit ?? 15),
    recommendationLimit: String(scanner?.recommendationLimit ?? 15),
    featuredLimit: String(scanner?.featuredLimit ?? 3),
    hotWindowSize: String(scanner?.hotWindowSize ?? 20),
    randomSampleSize: String(scanner?.randomSampleSize ?? 10),
    maxRoundsPerCycle: String(scanner?.maxRoundsPerCycle ?? 15),
    analysisScopes: scanner?.analysisScopes?.length
      ? scanner.analysisScopes
      : DEFAULT_ANALYSIS_SCOPES,
    holoStickerSeries: scanner?.holoStickerSeries?.length
      ? scanner.holoStickerSeries
      : DEFAULT_HOLO_STICKER_SERIES,
  };
}

export interface UseConfigOptions {
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onConfigLoaded?: (config: ConfigResponse) => void;
}

export interface UseConfigResult {
  config: ConfigResponse | null;
  tokenInput: string;
  setTokenInput: React.Dispatch<React.SetStateAction<string>>;
  csfloatKeyInput: string;
  setCsfloatKeyInput: React.Dispatch<React.SetStateAction<string>>;
  scannerForm: ScannerForm;
  setScannerForm: React.Dispatch<React.SetStateAction<ScannerForm>>;
  refreshConfig: () => Promise<ConfigResponse | null>;
  saveToken: (bindIp: boolean) => Promise<ConfigResponse | null>;
  bindIpOnly: () => Promise<void>;
  saveCsfloatKey: () => Promise<ConfigResponse | null>;
  saveScannerConfig: () => Promise<ConfigResponse | null>;
}

/**
 * Owns server config + its 3 inputs + 4 settings handlers.
 * Handlers refresh config on success and leave downstream data refresh
 * (watchlist/recommendations/analysis) to the caller via onConfigLoaded or
 * by reacting to the returned config.
 */
export function useConfig({ onMessage, onError, onConfigLoaded }: UseConfigOptions): UseConfigResult {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [csfloatKeyInput, setCsfloatKeyInput] = useState("");
  const [scannerForm, setScannerForm] = useState<ScannerForm>(() => createScannerForm());

  const refreshConfig = useCallback(async () => {
    try {
      const next = await requestJson<ConfigResponse>("/api/config");
      setConfig(next);
      setScannerForm(createScannerForm(next.scanner));
      onConfigLoaded?.(next);
      return next;
    } catch (caughtError) {
      onError(
        caughtError instanceof Error ? caughtError.message : "配置加载失败",
      );
      return null;
    }
  }, [onError, onConfigLoaded]);

  const saveToken = useCallback(
    async (bindIp: boolean) => {
      if (!tokenInput.trim()) {
        onError("请先粘贴 ApiToken");
        return null;
      }
      try {
        const payload = await requestJson<{
          maskedToken: string | null;
          bindResult?: string | null;
        }>("/api/config/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiToken: tokenInput.trim(), bindIp }),
        });
        setTokenInput("");
        onMessage(payload.bindResult || "ApiToken 已保存");
        return await refreshConfig();
      } catch (caughtError) {
        onError(
          caughtError instanceof Error ? caughtError.message : "保存 Token 失败",
        );
        return null;
      }
    },
    [tokenInput, onError, onMessage, refreshConfig],
  );

  const bindIpOnly = useCallback(async () => {
    try {
      const payload = await requestJson<{ message: string }>("/api/config/bind-ip", {
        method: "POST",
      });
      onMessage(payload.message);
    } catch (caughtError) {
      onError(
        caughtError instanceof Error ? caughtError.message : "绑定 IP 失败",
      );
    }
  }, [onError, onMessage]);

  const saveCsfloatKey = useCallback(async () => {
    if (!csfloatKeyInput.trim()) {
      onError("请先粘贴 CSFloat 开发者 Key");
      return null;
    }
    try {
      const payload = await requestJson<{ maskedCsfloatApiKey: string | null }>(
        "/api/config/csfloat-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: csfloatKeyInput.trim() }),
        },
      );
      setCsfloatKeyInput("");
      onMessage(`CSFloat Key 已保存 ${payload.maskedCsfloatApiKey ?? ""}`.trim());
      return await refreshConfig();
    } catch (caughtError) {
      onError(
        caughtError instanceof Error ? caughtError.message : "保存 CSFloat Key 失败",
      );
      return null;
    }
  }, [csfloatKeyInput, onError, onMessage, refreshConfig]);

  const saveScannerConfig = useCallback(async () => {
    try {
      const payload = await requestJson<ScannerConfig>("/api/config/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: scannerForm.enabled,
          deepAnalyzeLimit: Number(scannerForm.deepAnalyzeLimit),
          recommendationLimit: Number(scannerForm.recommendationLimit),
          featuredLimit: Number(scannerForm.featuredLimit),
          hotWindowSize: Number(scannerForm.hotWindowSize),
          randomSampleSize: Number(scannerForm.randomSampleSize),
          maxRoundsPerCycle: Number(scannerForm.maxRoundsPerCycle),
          analysisScopes: scannerForm.analysisScopes,
          holoStickerSeries: scannerForm.holoStickerSeries,
        }),
      });
      setScannerForm(createScannerForm(payload));
      onMessage(
        `自主推荐扫描参数已保存：热门窗口 ${payload.hotWindowSize} / 随机抽样 ${payload.randomSampleSize} / 范围 ${payload.analysisScopes.length} 类`,
      );
      return await refreshConfig();
    } catch (caughtError) {
      onError(
        caughtError instanceof Error ? caughtError.message : "保存扫描设置失败",
      );
      return null;
    }
  }, [scannerForm, onError, onMessage, refreshConfig]);

  return {
    config,
    tokenInput,
    setTokenInput,
    csfloatKeyInput,
    setCsfloatKeyInput,
    scannerForm,
    setScannerForm,
    refreshConfig,
    saveToken,
    bindIpOnly,
    saveCsfloatKey,
    saveScannerConfig,
  };
}
