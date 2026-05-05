import { useCallback, useEffect, useState } from "react";
import type { RecommendationResponse } from "../types";

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

function normalizeCard(card: RecommendationResponse["featured"][number]) {
  return {
    ...card,
    tagProfile: card.tagProfile ?? {
      itemTypeKey: "other",
      itemTypeLabel: "其他",
      weaponClassKey: null,
      rarityLabel: null,
      specialKey: null,
      wearKey: null,
      stickerFinishKey: null,
      originLabel: null,
      sourceSeriesLabel: null,
      stickerSeriesLabel: null,
      supplyBandKey: "unknown",
      recommendationScopes: [],
    },
    hypeFitScore: card.hypeFitScore ?? 0,
    hypeTags: Array.isArray(card.hypeTags) ? card.hypeTags.filter(Boolean) : [],
    likelyMotives: Array.isArray(card.likelyMotives)
      ? card.likelyMotives.filter(Boolean)
      : [],
    topHolders: Array.isArray(card.topHolders) ? card.topHolders : [],
    dataPoints: Array.isArray(card.dataPoints) ? card.dataPoints.filter(Boolean) : [],
    triggerTags: Array.isArray(card.triggerTags) ? card.triggerTags.filter(Boolean) : [],
  };
}

function normalize(response: RecommendationResponse): RecommendationResponse {
  const scanner = response.scanner;
  const normalizeList = (cards: RecommendationResponse["featured"] | undefined) =>
    Array.isArray(cards) ? cards.map(normalizeCard) : [];

  return {
    ...response,
    featured: normalizeList(response.featured),
    positive: normalizeList(response.positive),
    watch: normalizeList(response.watch),
    risk: normalizeList(response.risk),
    scanner: {
      source: scanner?.source ?? "scanner",
      candidatePages: scanner?.candidatePages ?? 0,
      candidatePageSize: scanner?.candidatePageSize ?? 0,
      scannedCandidateCount: scanner?.scannedCandidateCount ?? 0,
      deepAnalyzedCount: scanner?.deepAnalyzedCount ?? 0,
      recommendationLimit: scanner?.recommendationLimit ?? 15,
      featuredLimit: scanner?.featuredLimit ?? 3,
      sortBy: scanner?.sortBy ?? "建仓推荐评分降序",
      hotWindowSize: scanner?.hotWindowSize ?? 20,
      randomSampleSize: scanner?.randomSampleSize ?? 10,
      analysisScopes: scanner?.analysisScopes ?? [
        "agent",
        "holo_team_sticker",
        "gun_skin",
        "discontinued_collection_skin",
      ],
      holoStickerSeries: scanner?.holoStickerSeries ?? [
        "stockholm_2021",
        "antwerp_2022",
        "rio_2022",
        "paris_2023",
        "copenhagen_2024",
        "shanghai_2024",
        "other",
      ],
      windowRangeStart: scanner?.windowRangeStart ?? 1,
      windowRangeEnd: scanner?.windowRangeEnd ?? 20,
      poolSize: scanner?.poolSize ?? 0,
      completedRoundsInCycle: scanner?.completedRoundsInCycle ?? 0,
      totalRoundsCompleted: scanner?.totalRoundsCompleted ?? 0,
      roundsRemaining: scanner?.roundsRemaining ?? 0,
      maxRoundsPerCycle: scanner?.maxRoundsPerCycle ?? 15,
      paused: Boolean(scanner?.paused),
      autofilling: Boolean(scanner?.autofilling),
      minimumTargetCount: scanner?.minimumTargetCount ?? 3,
      lastRoundAt: scanner?.lastRoundAt ?? null,
      lastBatchCandidates: Array.isArray(scanner?.lastBatchCandidates)
        ? scanner.lastBatchCandidates.filter(Boolean)
        : [],
      fallbackSource: scanner?.fallbackSource ?? null,
      resetNotice: scanner?.resetNotice ?? null,
    },
    boards: Array.isArray(response.boards)
      ? response.boards.map((board) => ({
          ...board,
          segments: Array.isArray(board.segments) ? board.segments : [],
        }))
      : [],
  };
}

export interface RefreshRecommendationsOptions {
  force?: boolean;
  sync?: boolean;
  advance?: boolean;
}

export interface UseRecommendationsOptions {
  configured: boolean;
  /** Whether the recommendations tab is currently visible (drives autofill polling). */
  active: boolean;
}

export interface UseRecommendationsResult {
  recommendations: RecommendationResponse | null;
  recommendationsLoading: boolean;
  refreshRecommendations: (
    opts?: boolean | RefreshRecommendationsOptions,
  ) => Promise<RecommendationResponse | null>;
  /** Hits /api/recommendations/continue – used when scanner is paused. */
  continueRecommendations: () => Promise<RecommendationResponse | null>;
  /** Clears scanner runtime and starts a fresh sampling cycle. */
  resetRecommendations: () => Promise<RecommendationResponse | null>;
}

export function useRecommendations({
  configured,
  active,
}: UseRecommendationsOptions): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  const continueRecommendations = useCallback(async () => {
    setRecommendationsLoading(true);
    try {
      const next = normalize(
        await requestJson<RecommendationResponse>("/api/recommendations/continue", {
          method: "POST",
        }),
      );
      setRecommendations(next);
      return next;
    } finally {
      setRecommendationsLoading(false);
    }
  }, []);

  const resetRecommendations = useCallback(async () => {
    setRecommendationsLoading(true);
    try {
      const next = normalize(
        await requestJson<RecommendationResponse>("/api/recommendations/reset", {
          method: "POST",
        }),
      );
      setRecommendations(next);
      return next;
    } finally {
      setRecommendationsLoading(false);
    }
  }, []);

  const refreshRecommendations = useCallback(
    async (forceOrOptions: boolean | RefreshRecommendationsOptions = false) => {
      const opts =
        typeof forceOrOptions === "boolean"
          ? { force: forceOrOptions, sync: false, advance: false }
          : forceOrOptions;
      if (!active && !opts.force && !opts.sync && !opts.advance) {
        return recommendations;
      }

      const query = new URLSearchParams();
      if (opts.force) query.set("force", "1");
      if (opts.sync) query.set("sync", "1");
      if (opts.advance) query.set("advance", "1");

      setRecommendationsLoading(true);
      try {
        const q = query.toString();
        const next = normalize(
          await requestJson<RecommendationResponse>(
            `/api/recommendations${q ? `?${q}` : ""}`,
          ),
        );
        setRecommendations(next);
        return next;
      } finally {
        setRecommendationsLoading(false);
      }
    },
    [active, recommendations],
  );

  // On-activate sync: when user navigates to the recommendations tab.
  useEffect(() => {
    if (!active || !configured) return;

    const minimumCount = recommendations?.scanner.minimumTargetCount ?? 3;
    const hasEnoughCards =
      (recommendations?.positive.length ?? 0) + (recommendations?.watch.length ?? 0) >=
      minimumCount;

    if (!hasEnoughCards && !recommendations?.scanner.paused) {
      void refreshRecommendations({ sync: true, advance: true });
      return;
    }

    void refreshRecommendations({ sync: true });
    // Intentionally only runs when user switches to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, configured]);

  // Autofill polling: keep scanning while below minimum target count.
  useEffect(() => {
    const scanner = recommendations?.scanner;
    const actionableCount =
      (recommendations?.positive.length ?? 0) + (recommendations?.watch.length ?? 0);
    const minimumCount = scanner?.minimumTargetCount ?? 3;

    if (!active || !configured || !scanner || scanner.paused) return;
    if (actionableCount >= minimumCount) return;

    const timeout = window.setTimeout(
      () => {
        void refreshRecommendations();
      },
      scanner.autofilling ? 6000 : 2500,
    );
    return () => window.clearTimeout(timeout);
  }, [
    active,
    configured,
    recommendations?.positive.length,
    recommendations?.watch.length,
    recommendations?.scanner?.autofilling,
    recommendations?.scanner?.lastRoundAt,
    recommendations?.scanner?.minimumTargetCount,
    recommendations?.scanner?.paused,
    refreshRecommendations,
  ]);

  return {
    recommendations,
    recommendationsLoading,
    refreshRecommendations,
    continueRecommendations,
    resetRecommendations,
  };
}
