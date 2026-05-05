import { describe, expect, it } from "vitest";
import {
  evaluateAutonomousPoolDecision,
  prefilterScannerCandidates,
} from "./autonomous-pool.js";
import type { AnalysisResponse, ItemTagProfile, ScannerConfig } from "./types.js";

const scanner: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries" | "randomSampleSize"> = {
  analysisScopes: [
    "agent",
    "holo_team_sticker",
    "gun_skin",
    "discontinued_collection_skin",
    "knife_glove",
    "covert_tradeup",
    "weapon_case",
    "capsule",
    "collectible",
  ],
  holoStickerSeries: ["paris_2023", "stockholm_2021", "other"],
  randomSampleSize: 2,
};

function profile(overrides: Partial<ItemTagProfile> = {}): ItemTagProfile {
  return {
    itemTypeKey: "gun",
    itemTypeLabel: "Gun",
    weaponClassKey: "rifle",
    qualityKey: null,
    qualityLabel: null,
    rarityKey: "classified",
    rarityLabel: "Classified",
    stickerRarityKey: null,
    agentRarityKey: null,
    specialKey: "normal",
    wearKey: "field_tested",
    stickerFinishKey: null,
    originKey: "collection",
    originLabel: "Collection",
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
    isOperationSource: false,
    supplyBandKey: "2k_40k",
    hypeFitScore: 90,
    hypeTags: [],
    recommendationScopes: ["gun_skin"],
    ...overrides,
  };
}

function analysis(overrides: {
  tagProfile?: Partial<ItemTagProfile>;
  market?: Partial<AnalysisResponse["market"]>;
  statistic?: Partial<AnalysisResponse["statistic"]>;
  charts?: Partial<AnalysisResponse["charts"]>;
  summary?: Partial<AnalysisResponse["summary"]>;
  history?: Partial<AnalysisResponse["history"]>;
  item?: Partial<AnalysisResponse["item"]>;
  csfloat?: Partial<AnalysisResponse["csfloat"]>;
} = {}): AnalysisResponse {
  const tagProfile = profile(overrides.tagProfile);
  const market = {
    buffClose: 100,
    yyypClose: 101,
    spreadPct: 2,
    buffBuyPrice: 92,
    yyypBuyPrice: 93,
    buffSell: 55,
    yyypSell: 45,
    buffBuy: 30,
    yyypBuy: 25,
    updatedAt: "2026-01-01T00:00:00.000Z",
    t7SellableAt: "2026-01-08T00:00:00.000Z",
    ...overrides.market,
  };
  return {
    item: {
      goodId: "1",
      name: "AK-47 | Test (Field-Tested)",
      marketHashName: "AK-47 | Test (Field-Tested)",
      image: null,
      rarity: "Classified",
      weapon: "AK-47",
      exterior: "Field-Tested",
      ...overrides.item,
    },
    market,
    charts: {
      timestamps: [],
      labels: [],
      buffClose: [],
      yyypClose: [],
      blendClose: Array.from({ length: 30 }, () => 100),
      blendVolume: Array.from({ length: 30 }, () => 5),
      ma7: [],
      ma20: [],
      ...overrides.charts,
    },
    statistic: {
      current: 10_000,
      change7d: null,
      change14d: null,
      change30d: null,
      ...overrides.statistic,
    },
    tagProfile,
    taxonomy: {
      categoryKey: tagProfile.itemTypeKey === "agent" ? "agent" : "gun",
      categoryLabel: tagProfile.itemTypeLabel,
      segmentKey: "test",
      segmentLabel: "Test",
      spotlight: "Test",
    },
    summary: {
      goodId: "1",
      name: "AK-47 | Test",
      image: null,
      buffClose: market.buffClose,
      yyypClose: market.yyypClose,
      spreadPct: market.spreadPct,
      change7d: 4,
      volumeSpike: 1.2,
      entryScore: 60,
      dumpRiskScore: 12,
      signal: "watch",
      alertSignal: {
        level: "silent",
        shouldNotify: false,
        score: 0,
        title: "idle",
        detail: "idle",
        sources: [],
        matchedRules: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      taxonomy: {
        categoryKey: "gun",
        categoryLabel: "Gun",
        segmentKey: "test",
        segmentLabel: "Test",
        spotlight: "Test",
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
      snapshotsAvailable: 4,
      ...overrides.summary,
    },
    history: {
      snapshotsAvailable: 4,
      lastSnapshotAt: "2026-01-01T00:00:00.000Z",
      ...overrides.history,
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
      ...overrides.csfloat,
    },
  } as unknown as AnalysisResponse;
}

describe("autonomous pool rules", () => {
  it("prefilters hard excluded candidates without falling back to rejected rows", () => {
    const result = prefilterScannerCandidates(
      [
        { id: "1", name: "StatTrak AK-47 | Redline", image: null },
        { id: "2", name: "Sticker | Vitality | Paris 2023", image: null },
        { id: "3", name: "AK-47 | Redline (Field-Tested)", image: null },
        { id: "4", name: "Souvenir AWP | Desert Hydra", image: null },
        { id: "5", name: "Music Kit | Hotline Miami", image: null },
        { id: "6", name: "Kilowatt Case", image: null },
        { id: "7", name: "Paris 2023 Legends Sticker Capsule", image: null },
      ],
      scanner,
    );

    expect(result.accepted.map((item) => item.id)).toEqual(["3", "7"]);
    expect(result.diagnostics.candidateShortage).toBe(false);
    expect(result.diagnostics.rejectReasonCounts.STATTRAK_EXCLUDED).toBe(1);
    expect(result.diagnostics.rejectReasonCounts.NON_TARGET_STICKER).toBe(1);
    expect(result.diagnostics.rejectReasonCounts.SOUVENIR_EXCLUDED).toBe(1);
    expect(result.diagnostics.rejectReasonCounts.MUSIC_KIT_EXCLUDED).toBe(1);
    expect(result.diagnostics.rejectReasonCounts.ACTIVE_DROP_CASE_EXCLUDED).toBe(1);
  });

  it("puts optimal supply gun skins into the core candidate pool", () => {
    const decision = evaluateAutonomousPoolDecision(analysis(), scanner);

    expect(decision.pool).toBe("candidate_core");
    expect(decision.supplyGrade).toBe("S");
    expect(decision.optimalGunSupply).toBe(true);
    expect(decision.canEnterEntryScore).toBe(true);
  });

  it("hard excludes high population and high listing normal items", () => {
    const decision = evaluateAutonomousPoolDecision(
      analysis({
        statistic: { current: 80_000 },
        market: { buffSell: 1_000, yyypSell: 650 },
      }),
      scanner,
    );

    expect(decision.pool).toBe("excluded");
    expect(decision.riskTags).toContain("HIGH_SUPPLY");
    expect(decision.firstSupplyExclude).toBe(true);
    expect(decision.supplyGrade).toBe("D");
  });

  it("caps agents below core even when other signals are strong", () => {
    const decision = evaluateAutonomousPoolDecision(
      analysis({
        item: { name: "Agent | Sir Bloody Darryl", weapon: null },
        tagProfile: {
          itemTypeKey: "agent",
          itemTypeLabel: "Agent",
          weaponClassKey: null,
          originKey: "operation_agent",
          originLabel: "Operation Agent",
          isOperationSource: true,
          recommendationScopes: ["agent"],
        },
      }),
      scanner,
    );

    expect(decision.pool).toBe("candidate_low_weight");
    expect(decision.admissionScore).toBeLessThan(80);
  });

  it("rejects non-target stickers at the analysis gate", () => {
    const decision = evaluateAutonomousPoolDecision(
      analysis({
        item: { name: "Sticker | Vitality | Paris 2023", weapon: null },
        tagProfile: {
          itemTypeKey: "sticker",
          itemTypeLabel: "Sticker",
          weaponClassKey: null,
          stickerFinishKey: "paper",
          isTeamSticker: true,
          stickerSeriesKey: "other",
          stickerSeriesLabel: "Other",
          recommendationScopes: ["holo_team_sticker"],
        },
      }),
      scanner,
    );

    expect(decision.pool).toBe("excluded");
    expect(decision.riskTags).toContain("NON_TARGET_STICKER");
  });

  it("does not let holo sticker scope hints bypass selected event series", () => {
    const result = prefilterScannerCandidates(
      [
        {
          id: "stockholm",
          name: "Sticker | Natus Vincere (Holo) | Stockholm 2021",
          scopeHint: "holo_team_sticker",
        },
        {
          id: "paris",
          name: "Sticker | Natus Vincere (Holo) | Paris 2023",
          scopeHint: "holo_team_sticker",
        },
      ],
      {
        ...scanner,
        holoStickerSeries: ["paris_2023"],
      },
    );

    expect(result.accepted.map((item) => item.id)).toEqual(["paris"]);
    expect(result.diagnostics.rejectReasonCounts.SCOPE_NOT_SELECTED).toBe(1);
  });

  it("matches scanner scope against market hash name and source labels", () => {
    const result = prefilterScannerCandidates(
      [
        {
          id: "source-hit",
          name: "Container item",
          marketHashName: "AK-47 | Gold Arabesque (Factory New)",
          sourceLabel: "Dust 2 Collection",
        },
      ],
      {
        ...scanner,
        analysisScopes: ["gun_skin"],
      },
    );

    expect(result.accepted.map((item) => item.id)).toEqual(["source-hit"]);
  });

  it("does not hard exclude high supply from CSFloat sample-only listing counts", () => {
    const decision = evaluateAutonomousPoolDecision(
      analysis({
        statistic: { current: 80_000 },
        market: { buffSell: null, yyypSell: null },
        csfloat: {
          enabled: true,
          source: "api",
          listingCount: 2_000,
        },
      }),
      scanner,
    );

    expect(decision.firstSupplyExclude).toBe(false);
    expect(decision.riskTags).not.toContain("HIGH_SUPPLY");
    expect(decision.riskTags).toContain("SAMPLE_ONLY_LISTINGS");
  });
});
