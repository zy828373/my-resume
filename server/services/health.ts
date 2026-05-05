import type {
  HealthResponse,
  RefreshRuntimeStatus,
  RuntimeConfig,
  ScannerConfig,
} from "../types.js";
import type { SnapshotStoreStats } from "../history-store.js";

type SnapshotHealthStats = SnapshotStoreStats & {
  error?: string;
};

type ScannerRuntimeHealth = {
  paused: boolean;
  autofilling: boolean;
  completedRoundsInCycle: number;
  totalRoundsCompleted: number;
  lastRoundAt: string | null;
  lastBatchCandidates: string[];
  lastError: string | null;
};

export function buildHealthResponse({
  config,
  autoRefresh,
  scannerConfig,
  scannerRuntime,
  snapshots,
  csqaqConfigured,
  csfloatConfigured,
  llmEnabled,
}: {
  config: RuntimeConfig;
  autoRefresh: RefreshRuntimeStatus;
  scannerConfig: ScannerConfig;
  scannerRuntime: ScannerRuntimeHealth;
  snapshots: SnapshotHealthStats;
  csqaqConfigured: boolean;
  csfloatConfigured: boolean;
  llmEnabled: boolean;
}): HealthResponse {
  return {
    checkedAt: new Date().toISOString(),
    configured: csqaqConfigured,
    llmEnabled,
    autoRefreshEnabled: autoRefresh.enabled,
    dataSources: {
      csqaqConfigured,
      csfloatConfigured,
      llmEnabled,
    },
    watchlistCount: config.watchlist.length,
    portfolioCount: config.portfolio?.length ?? 0,
    snapshots,
    autoRefresh,
    scanner: {
      enabled: scannerConfig.enabled,
      paused: scannerRuntime.paused,
      autofilling: scannerRuntime.autofilling,
      completedRoundsInCycle: scannerRuntime.completedRoundsInCycle,
      totalRoundsCompleted: scannerRuntime.totalRoundsCompleted,
      lastRoundAt: scannerRuntime.lastRoundAt,
      lastBatchCandidates: scannerRuntime.lastBatchCandidates,
    },
    recentError: snapshots.error ?? autoRefresh.lastError ?? scannerRuntime.lastError,
  };
}
