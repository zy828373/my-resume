import { describe, expect, it } from "vitest";
import {
  applyPushSignal,
  buildRecommendationCard,
  buildRecommendationResponse,
  isAutonomousRecommendationEligible,
  normalizeDetail,
} from "./analytics.js";
import type {
  AlertSignal,
  AnalysisResponse,
  AutonomousPool,
  AutonomousPoolDecision,
  BoardTaxonomy,
  ItemTagProfile,
  ScannerConfig,
} from "./types.js";

const updatedAt = "2026-01-01T00:00:00.000Z";

function idleAlert(): AlertSignal {
  return {
    level: "silent",
    shouldNotify: false,
    score: 0,
    title: "idle",
    detail: "idle",
    sources: [],
    matchedRules: [],
    updatedAt,
  };
}

function agentTaxonomy(): BoardTaxonomy {
  return {
    categoryKey: "agent",
    categoryLabel: "Agent",
    segmentKey: "agent",
    segmentLabel: "Agent",
    spotlight: "Agent",
  };
}

function agentProfile(): ItemTagProfile {
  return {
    itemTypeKey: "agent",
    itemTypeLabel: "Agent",
    weaponClassKey: null,
    qualityKey: null,
    qualityLabel: null,
    rarityKey: null,
    rarityLabel: null,
    stickerRarityKey: null,
    agentRarityKey: "master",
    specialKey: null,
    wearKey: null,
    stickerFinishKey: null,
    originKey: "operation_agent",
    originLabel: "Operation Agent",
    sourceSeriesKey: null,
    sourceSeriesLabel: null,
    stickerSeriesKey: null,
    stickerSeriesLabel: null,
    isTeamSticker: false,
    isPlayerSignature: false,
    isStatTrak: false,
    isSouvenir: false,
    isDiscontinuedCandidate: false,
    isRareDropSource: false,
    isOperationSource: true,
    supplyBandKey: "2k_40k",
    hypeFitScore: 60,
    hypeTags: ["agent"],
    recommendationScopes: ["agent"],
  };
}

function poolDecision(pool: AutonomousPool, admissionScore: number): AutonomousPoolDecision {
  return {
    pool,
    admissionScore,
    category: "agent",
    supplyGrade: "NA",
    optimalGunSupply: null,
    firstSupplyExclude: false,
    canEnterEntryScore: pool === "candidate_core" || pool === "candidate_low_weight",
    canEnterAlertScore: pool !== "excluded",
    summary: pool,
    keepReasons: [pool],
    downgradeReasons: [],
    excludeReasons: [],
    riskTags: [],
    evidence: [],
  };
}

function makeAnalysis(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  const alertSignal = idleAlert();
  const taxonomy = agentTaxonomy();
  const tagProfile = agentProfile();

  return {
    item: {
      goodId: "agent-1",
      name: "Agent Test",
      marketHashName: "Agent Test",
      image: null,
      rarity: null,
      weapon: null,
      exterior: null,
    },
    market: {
      buffClose: 100,
      yyypClose: 101,
      spreadPct: 3,
      buffBuyPrice: 98,
      yyypBuyPrice: 99,
      buffSell: 12,
      yyypSell: 10,
      buffBuy: 8,
      yyypBuy: 7,
      updatedAt,
      t7SellableAt: updatedAt,
    },
    charts: {
      timestamps: [],
      labels: [],
      buffClose: [],
      yyypClose: [],
      blendClose: [],
      blendVolume: [],
      ma7: [],
      ma20: [],
    },
    indicators: {
      macd: { dif: [], dea: [], hist: [], signal: "hold", summary: "hold" },
      kdj: { k: [], d: [], j: [], signal: "hold", summary: "hold" },
    },
    prediction: {
      direction: "up",
      confidence: 70,
      expected7dPct: 6,
      lowBand: null,
      baseBand: null,
      highBand: null,
      cooldownRiskPct: 20,
    },
    scores: {
      entryScore: 48,
      dumpRiskScore: 12,
      entryLabel: "watch",
      dumpLabel: "low",
      entryReasons: [],
      dumpReasons: [],
      entryDrivers: [],
      dumpDrivers: [],
    },
    strategy: {
      tone: "entry",
      action: "watch",
      actionSummary: "watch entry",
      positionMinPct: 0,
      positionMaxPct: 5,
      targetPrice: null,
      defensePrice: null,
      lockDays: 7,
      cooldownSummary: "ok",
    },
    marketContext: {
      priceTier: {
        key: "mid",
        label: "Mid",
        latestPrice: 100,
        description: "mid",
        buildVolumeThreshold: 1,
        dangerDropThresholdPct: -10,
        spreadRiskThresholdPct: 12,
        cooldownWeight: 1,
      },
      teamSignal: {
        buildScore: 40,
        exitScore: 5,
        status: "neutral",
        summary: "neutral",
        buildReasons: [],
        exitReasons: [],
      },
    },
    reasoning: [],
    alerts: [],
    statistic: {
      current: 5_000,
      change7d: null,
      change14d: null,
      change30d: null,
    },
    llm: {
      enabled: false,
      status: "disabled",
      provider: "none",
      model: "none",
      generatedAt: null,
      summary: "disabled",
      regime: "neutral",
      confidence: null,
      buildSignalStrength: null,
      dumpSignalStrength: null,
      cooldownAssessment: "unknown",
      alertDecision: "unavailable",
      expected7dRange: { lowPct: null, basePct: null, highPct: null },
      evidence: [],
      counterSignals: [],
      actionPlan: [],
      nextCheckMinutes: null,
      shouldPushAlert: false,
      pushReason: "",
    },
    pushSignal: alertSignal,
    taxonomy,
    tagProfile,
    holderInsights: [],
    earlyAccumulation: {
      state: "none",
      score: 0,
      title: "none",
      detail: "none",
      detectedBuilders: 0,
      totalTrackedSharePct: null,
      likelyMotives: [],
    },
    bottomReversal: {
      triggered: false,
      score: 0,
      title: "none",
      detail: "none",
      overlapDays: 0,
      shrinkDays: 0,
      recentLowDays: 0,
    },
    csfloat: {
      enabled: false,
      source: "disabled",
      marketHashName: null,
      listingCount: 0,
      uniqueSellerCount: 0,
      publicSellerCount: 0,
      uniquePaintSeedCount: 0,
      lowestPrice: null,
      highestPrice: null,
      bestFloat: null,
      worstFloat: null,
      limitation: "disabled",
      sellerClusters: [],
      samples: [],
    },
    holders: {
      rows: [],
      top5: null,
      top1: null,
      top10: null,
      top5SharePct: null,
      top10SharePct: null,
      delta24h: null,
      delta7d: null,
    },
    history: {
      snapshotsAvailable: 0,
      lastSnapshotAt: null,
    },
    summary: {
      goodId: "agent-1",
      name: "Agent Test",
      image: null,
      buffClose: 100,
      yyypClose: 101,
      spreadPct: 3,
      change7d: 4,
      volumeSpike: 1.2,
      entryScore: 48,
      dumpRiskScore: 12,
      signal: "watch",
      alertSignal,
      taxonomy,
      updatedAt,
      snapshotsAvailable: 0,
    },
    ...overrides,
  };
}

describe("analytics", () => {
  it("normalizes detail payloads from flat market fields", () => {
    const detail = normalizeDetail(
      {
        name: "AK-47 | Redline",
        market_hash_name: "AK-47 | Redline (Field-Tested)",
        img: "https://example.test/ak.png",
        rare_name: "Classified",
        weapon_name: "AK-47",
        exterior_name: "Field-Tested",
        statistic: "1234",
        buff_sell_price: "100.5",
        yyyp_sell_price: 101.5,
        buff_buy_num: "12",
        yyyp_buy_num: 13,
      },
      "123",
    );

    expect(detail.goodId).toBe("123");
    expect(detail.name).toBe("AK-47 | Redline");
    expect(detail.marketHashName).toBe("AK-47 | Redline (Field-Tested)");
    expect(detail.statistic).toBe(1234);
    expect(detail.buffPrice).toBe(100.5);
    expect(detail.yyypPrice).toBe(101.5);
    expect(detail.buffBuy).toBe(12);
    expect(detail.yyypBuy).toBe(13);
  });

  it("applies entry, risk, watch, and idle push signals", () => {
    const entry = makeAnalysis({
      scores: { ...makeAnalysis().scores, entryScore: 120, dumpRiskScore: 20 },
      marketContext: {
        ...makeAnalysis().marketContext,
        teamSignal: { ...makeAnalysis().marketContext.teamSignal, buildScore: 90, exitScore: 5 },
      },
    });
    expect(applyPushSignal(entry).pushSignal.level).toBe("push_entry");

    const risk = makeAnalysis({
      scores: { ...makeAnalysis().scores, entryScore: 10, dumpRiskScore: 130 },
      marketContext: {
        ...makeAnalysis().marketContext,
        teamSignal: { ...makeAnalysis().marketContext.teamSignal, buildScore: 5, exitScore: 95 },
      },
    });
    expect(applyPushSignal(risk).pushSignal.level).toBe("push_risk");

    const cooldownWatch = makeAnalysis({
      prediction: { ...makeAnalysis().prediction, cooldownRiskPct: 85 },
      scores: { ...makeAnalysis().scores, entryScore: 120, dumpRiskScore: 10 },
      marketContext: {
        ...makeAnalysis().marketContext,
        teamSignal: { ...makeAnalysis().marketContext.teamSignal, buildScore: 90, exitScore: 5 },
      },
    });
    expect(applyPushSignal(cooldownWatch).pushSignal.level).toBe("watch");

    const idle = makeAnalysis({
      scores: { ...makeAnalysis().scores, entryScore: 5, dumpRiskScore: 4 },
      marketContext: {
        ...makeAnalysis().marketContext,
        teamSignal: { ...makeAnalysis().marketContext.teamSignal, buildScore: 5, exitScore: 4 },
      },
    });
    expect(applyPushSignal(idle).pushSignal.level).toBe("silent");
  });

  it("builds autonomous recommendation cards and grouped responses", () => {
    const positive = applyPushSignal(makeAnalysis());
    const card = buildRecommendationCard(positive);

    expect(isAutonomousRecommendationEligible(positive)).toBe(true);
    expect(card?.goodId).toBe("agent-1");
    expect(card?.recommendationType).toBe("trend_follow");
    expect(card?.autonomousPool.pool).toBe("candidate_low_weight");
    expect(card?.autonomousPool.canEnterEntryScore).toBe(true);

    const blocked = makeAnalysis({
      tagProfile: { ...agentProfile(), isStatTrak: true },
    });
    expect(isAutonomousRecommendationEligible(blocked)).toBe(false);
    expect(buildRecommendationCard(blocked)).toBeNull();

    const positiveTwo = applyPushSignal(
      makeAnalysis({
        item: { ...makeAnalysis().item, goodId: "agent-2", name: "Agent Two" },
        scores: { ...makeAnalysis().scores, entryScore: 55, dumpRiskScore: 10 },
        autonomousPool: poolDecision("candidate_low_weight", 66),
      }),
    );
    const watch = applyPushSignal(
      makeAnalysis({
        item: { ...makeAnalysis().item, goodId: "agent-watch", name: "Agent Watch" },
        scores: { ...makeAnalysis().scores, entryScore: 20, dumpRiskScore: 15 },
        autonomousPool: poolDecision("watchlist", 45),
      }),
    );
    const risk = applyPushSignal(
      makeAnalysis({
        item: { ...makeAnalysis().item, goodId: "agent-risk", name: "Agent Risk" },
        scores: { ...makeAnalysis().scores, entryScore: 5, dumpRiskScore: 130 },
        marketContext: {
          ...makeAnalysis().marketContext,
          teamSignal: { ...makeAnalysis().marketContext.teamSignal, buildScore: 5, exitScore: 95 },
        },
        autonomousPool: poolDecision("risk_only", 30),
      }),
    );
    const riskTwo = applyPushSignal(
      makeAnalysis({
        item: { ...makeAnalysis().item, goodId: "agent-risk-2", name: "Agent Risk 2" },
        scores: { ...makeAnalysis().scores, entryScore: 4, dumpRiskScore: 95 },
        autonomousPool: poolDecision("risk_only", 25),
      }),
    );
    const response = buildRecommendationResponse([positive, positiveTwo, watch, risk, riskTwo], {
      recommendationLimit: 5,
      featuredLimit: 2,
    });

    expect(response.universeCount).toBe(5);
    expect(response.positive).toHaveLength(2);
    expect(response.watch).toHaveLength(1);
    expect(response.risk).toHaveLength(2);
    expect(response.boards[0]?.key).toBe("agent");
  });

  it("recomputes autonomous pool decisions when current scanner scope is provided", () => {
    const staleCoreDecision = poolDecision("candidate_core", 95);
    const analysis = makeAnalysis({
      autonomousPool: staleCoreDecision,
    });
    const stickerOnlyScanner: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries"> = {
      analysisScopes: ["holo_team_sticker"],
      holoStickerSeries: ["paris_2023"],
    };

    expect(isAutonomousRecommendationEligible(analysis)).toBe(true);
    expect(isAutonomousRecommendationEligible(analysis, stickerOnlyScanner)).toBe(false);
    expect(buildRecommendationCard(analysis, stickerOnlyScanner)).toBeNull();
  });
});
