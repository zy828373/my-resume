import { describe, expect, it } from "vitest";
import { buildHealthResponse } from "./health.js";
import type { RefreshRuntimeStatus, RuntimeConfig, ScannerConfig } from "../types.js";

describe("health service", () => {
  it("builds a complete health response", () => {
    const config = {
      watchlist: [{ goodId: "1", name: "Test" }],
      portfolio: [],
    } as RuntimeConfig;
    const autoRefresh = {
      enabled: true,
      intervalMinutes: 20,
      includeDeep: true,
      maxDeepItems: 3,
      running: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunMs: null,
      lastRunSummaryCount: 0,
      lastRunDeepCount: 0,
      lastRunTriggeredBy: null,
      lastError: null,
    } satisfies RefreshRuntimeStatus;
    const scannerConfig = {
      enabled: true,
      candidatePages: 1,
      candidatePageSize: 10,
      deepAnalyzeLimit: 5,
      recommendationLimit: 5,
      featuredLimit: 2,
      hotWindowSize: 10,
      randomSampleSize: 2,
      maxRoundsPerCycle: 3,
      analysisScopes: ["agent"],
      holoStickerSeries: ["paris_2023"],
    } satisfies ScannerConfig;

    const health = buildHealthResponse({
      config,
      autoRefresh,
      scannerConfig,
      scannerRuntime: {
        paused: false,
        autofilling: false,
        completedRoundsInCycle: 1,
        totalRoundsCompleted: 4,
        lastRoundAt: "2026-01-01T00:00:00.000Z",
        lastBatchCandidates: ["a"],
        lastError: null,
      },
      snapshots: {
        itemCount: 2,
        rowCount: 8,
        latestAt: "2026-01-01T00:00:00.000Z",
      },
      csqaqConfigured: true,
      csfloatConfigured: false,
      llmEnabled: true,
    });

    expect(health.configured).toBe(true);
    expect(health.llmEnabled).toBe(true);
    expect(health.autoRefreshEnabled).toBe(true);
    expect(health.watchlistCount).toBe(1);
    expect(health.snapshots.rowCount).toBe(8);
    expect(health.scanner.totalRoundsCompleted).toBe(4);
  });

  it("surfaces degraded snapshot stats without dropping legacy fields", () => {
    const config = {
      watchlist: [],
      portfolio: [],
    } as RuntimeConfig;
    const autoRefresh = {
      enabled: false,
      intervalMinutes: 20,
      includeDeep: true,
      maxDeepItems: 3,
      running: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunMs: null,
      lastRunSummaryCount: 0,
      lastRunDeepCount: 0,
      lastRunTriggeredBy: null,
      lastError: null,
    } satisfies RefreshRuntimeStatus;
    const scannerConfig = {
      enabled: false,
      candidatePages: 1,
      candidatePageSize: 10,
      deepAnalyzeLimit: 5,
      recommendationLimit: 5,
      featuredLimit: 2,
      hotWindowSize: 10,
      randomSampleSize: 2,
      maxRoundsPerCycle: 3,
      analysisScopes: ["agent"],
      holoStickerSeries: ["paris_2023"],
    } satisfies ScannerConfig;

    const health = buildHealthResponse({
      config,
      autoRefresh,
      scannerConfig,
      scannerRuntime: {
        paused: false,
        autofilling: false,
        completedRoundsInCycle: 0,
        totalRoundsCompleted: 0,
        lastRoundAt: null,
        lastBatchCandidates: [],
        lastError: null,
      },
      snapshots: {
        itemCount: 0,
        rowCount: 0,
        latestAt: null,
        error: "snapshots damaged",
      },
      csqaqConfigured: false,
      csfloatConfigured: false,
      llmEnabled: false,
    });

    expect(health.llmEnabled).toBe(false);
    expect(health.autoRefreshEnabled).toBe(false);
    expect(health.snapshots.error).toBe("snapshots damaged");
    expect(health.recentError).toBe("snapshots damaged");
  });
});
