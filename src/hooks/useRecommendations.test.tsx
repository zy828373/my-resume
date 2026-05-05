// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecommendations } from "./useRecommendations";
import type { RecommendationResponse } from "../types";

function response(payload: unknown, ok = true) {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

const recommendation: RecommendationResponse = {
  updatedAt: "2026-01-01T00:00:00.000Z",
  universeCount: 1,
  featured: [],
  positive: [
    {
      goodId: "1",
      name: "AK-47 | Test",
      marketHashName: "AK-47 | Test",
      image: null,
      taxonomy: {
        categoryKey: "gun",
        categoryLabel: "Gun",
        segmentKey: "gun",
        segmentLabel: "Gun",
        spotlight: "Gun",
      },
      tagProfile: {
        itemTypeKey: "gun",
        itemTypeLabel: "Gun",
        weaponClassKey: "rifle",
        rarityLabel: "Classified",
        specialKey: "normal",
        wearKey: "field_tested",
        stickerFinishKey: null,
        originLabel: null,
        sourceSeriesLabel: null,
        stickerSeriesLabel: null,
        supplyBandKey: "2k_40k",
        recommendationScopes: ["gun_skin"],
      },
      hypeFitScore: 80,
      hypeTags: ["test"],
      recommendationType: "trend_follow",
      score: 90,
      reason: "test",
      expected7dPct: 5,
      entryScore: 70,
      dumpRiskScore: 10,
      teamBuildScore: 40,
      teamExitScore: 5,
      alertLevel: "silent",
      likelyMotives: [],
      topHolders: [],
      dataPoints: [],
      triggerTags: [],
      autonomousPool: {
        pool: "candidate_core",
        admissionScore: 85,
        category: "gun_skin",
        supplyGrade: "S",
        optimalGunSupply: true,
        firstSupplyExclude: false,
        canEnterEntryScore: true,
        canEnterAlertScore: true,
        summary: "core",
        keepReasons: ["ok"],
        downgradeReasons: [],
        excludeReasons: [],
        riskTags: [],
        evidence: [],
      },
    },
  ],
  watch: [],
  risk: [],
  scanner: {
    source: "scanner",
    candidatePages: 2,
    candidatePageSize: 24,
    scannedCandidateCount: 1,
    deepAnalyzedCount: 1,
    recommendationLimit: 15,
    featuredLimit: 3,
    sortBy: "score",
    hotWindowSize: 20,
    randomSampleSize: 10,
    analysisScopes: ["gun_skin"],
    holoStickerSeries: ["paris_2023"],
    windowRangeStart: 1,
    windowRangeEnd: 20,
    poolSize: 1,
    completedRoundsInCycle: 1,
    totalRoundsCompleted: 1,
    roundsRemaining: 14,
    maxRoundsPerCycle: 15,
    paused: false,
    autofilling: false,
    minimumTargetCount: 3,
    lastRoundAt: "2026-01-01T00:00:00.000Z",
    lastBatchCandidates: ["AK-47 | Test"],
    fallbackSource: null,
    preFilter: {
      rawCandidateCount: 12,
      acceptedCandidateCount: 8,
      rejectedCandidateCount: 4,
      sampledCandidateCount: 3,
      candidateShortage: false,
      shortageReason: null,
      sampledFromFiltered: true,
      rejectReasonCounts: {
        STATTRAK_EXCLUDED: 2,
      },
      poolDistribution: {
        candidate_core: 1,
        candidate_low_weight: 0,
        watchlist: 0,
        risk_only: 0,
        excluded: 0,
      },
    },
  },
  boards: [],
};

describe("useRecommendations", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("keeps scanner prefilter diagnostics and autonomous pool data", async () => {
    const states: Array<ReturnType<typeof useRecommendations>> = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ok: true, data: recommendation })));

    function Probe() {
      const state = useRecommendations({ configured: true, active: false });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await states.at(-1)?.refreshRecommendations({ force: true });
    });

    const preFilter = states.at(-1)?.recommendations?.scanner.preFilter;
    expect(preFilter?.rawCandidateCount).toBe(12);
    expect(preFilter?.acceptedCandidateCount).toBe(8);
    expect(preFilter?.rejectedCandidateCount).toBe(4);
    expect(preFilter?.sampledCandidateCount).toBe(3);
    expect(preFilter?.candidateShortage).toBe(false);
    expect(preFilter?.rejectReasonCounts.STATTRAK_EXCLUDED).toBe(2);
    expect(preFilter?.poolDistribution.candidate_core).toBe(1);
    expect(preFilter?.poolDistribution.excluded).toBe(0);
    expect(states.at(-1)?.recommendations?.positive[0]?.autonomousPool.pool).toBe("candidate_core");
  });

  it("adds safe defaults for legacy recommendation responses", async () => {
    const legacy = {
      ...recommendation,
      positive: recommendation.positive.map(({ autonomousPool: _pool, ...card }) => card),
      scanner: {
        ...recommendation.scanner,
        preFilter: undefined,
      },
    };
    const states: Array<ReturnType<typeof useRecommendations>> = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ok: true, data: legacy })));

    function Probe() {
      const state = useRecommendations({ configured: true, active: false });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await states.at(-1)?.refreshRecommendations({ force: true });
    });

    expect(states.at(-1)?.recommendations?.scanner.preFilter?.rawCandidateCount).toBe(0);
    expect(states.at(-1)?.recommendations?.positive[0]?.autonomousPool.riskTags).toContain("LEGACY_RESPONSE");
  });

  it("normalizes partial autonomous pool decisions without crashing card consumers", async () => {
    const partial = {
      ...recommendation,
      positive: recommendation.positive.map((card) => ({
        ...card,
        autonomousPool: {
          pool: "candidate_core",
          admissionScore: 88,
          category: "gun_skin",
          supplyGrade: "S",
        },
      })),
    };
    const states: Array<ReturnType<typeof useRecommendations>> = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ok: true, data: partial })));

    function Probe() {
      const state = useRecommendations({ configured: true, active: false });
      useEffect(() => {
        states.push(state);
      }, [state]);
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await states.at(-1)?.refreshRecommendations({ force: true });
    });

    const pool = states.at(-1)?.recommendations?.positive[0]?.autonomousPool;
    expect(pool?.pool).toBe("candidate_core");
    expect(pool?.canEnterEntryScore).toBe(true);
    expect(pool?.canEnterAlertScore).toBe(true);
    expect(pool?.keepReasons).toEqual([]);
    expect(pool?.downgradeReasons).toEqual([]);
    expect(pool?.excludeReasons).toEqual([]);
    expect(pool?.riskTags).toEqual([]);
  });
});
