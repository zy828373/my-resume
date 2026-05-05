import { describe, expect, it } from "vitest";
import {
  buildItemTagProfile,
  candidateMatchesScannerScopes,
  normalizeHoloStickerSeries,
  normalizeRecommendationScopes,
  tagProfileMatchesScanner,
} from "./item-taxonomy.js";
import type { NormalizedDetail } from "./types.js";

function detail(overrides: Partial<NormalizedDetail>): NormalizedDetail {
  const name = overrides.name ?? "AK-47 | Redline";
  const marketHashName = overrides.marketHashName ?? name;
  const weapon = Object.hasOwn(overrides, "weapon") ? (overrides.weapon ?? null) : "AK-47";
  return {
    goodId: "1",
    name,
    marketHashName,
    image: null,
    rarity: "Classified",
    weapon,
    exterior: "Field-Tested",
    statistic: null,
    updatedAt: null,
    buffPrice: null,
    yyypPrice: null,
    buffBuyPrice: null,
    yyypBuyPrice: null,
    buffSell: null,
    yyypSell: null,
    buffBuy: null,
    yyypBuy: null,
    raw: {},
    ...overrides,
  };
}

describe("item taxonomy", () => {
  it("normalizes configured recommendation scopes and sticker series", () => {
    expect(normalizeRecommendationScopes(["agent", "agent", "bad"])).toEqual(["agent"]);
    expect(normalizeHoloStickerSeries(["paris_2023", "bad"])).toEqual(["paris_2023"]);
  });

  it("matches scanner candidates by scope", () => {
    expect(
      candidateMatchesScannerScopes("Agent | Sir Bloody Darryl", {
        analysisScopes: ["agent"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(true);

    expect(
      candidateMatchesScannerScopes("Sticker | Natus Vincere (Holo) | Paris 2023", {
        analysisScopes: ["holo_team_sticker"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(true);

    expect(
      candidateMatchesScannerScopes("StatTrak AK-47 | Redline", {
        analysisScopes: ["gun_skin"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(false);

    expect(
      candidateMatchesScannerScopes("Kilowatt Case", {
        analysisScopes: ["weapon_case"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(true);
    expect(
      candidateMatchesScannerScopes("AK-47 | Case Hardened (Field-Tested)", {
        analysisScopes: ["weapon_case"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(false);

    expect(
      candidateMatchesScannerScopes("Paris 2023 Legends Sticker Capsule", {
        analysisScopes: ["capsule"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(true);
  });

  it("matches normal gun skins while rejecting souvenirs", () => {
    expect(
      candidateMatchesScannerScopes("AK-47 | Redline (Field-Tested)", {
        analysisScopes: ["gun_skin"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(true);

    expect(
      candidateMatchesScannerScopes("Souvenir AK-47 | Safari Mesh (Field-Tested)", {
        analysisScopes: ["gun_skin"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(false);
  });

  it("builds discontinued collection gun profiles for scanner filtering", () => {
    const profile = buildItemTagProfile(
      detail({
        name: "AK-47 | Gold Arabesque",
        marketHashName: "AK-47 | Gold Arabesque (Factory New)",
        exterior: "Factory New",
        raw: {
          collection_name: "Dust 2 Collection",
        },
      }),
      5_000,
    );

    expect(profile.itemTypeKey).toBe("gun");
    expect(profile.isDiscontinuedCandidate).toBe(true);
    expect(profile.recommendationScopes).toContain("gun_skin");
    expect(profile.recommendationScopes).toContain("discontinued_collection_skin");
    expect(
      tagProfileMatchesScanner(profile, {
        analysisScopes: ["discontinued_collection_skin"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(true);
  });

  it("classifies common item families and sticker finishes", () => {
    const knife = buildItemTagProfile(detail({ name: "Karambit | Doppler", weapon: null }), 1_000);
    const glove = buildItemTagProfile(detail({ name: "Sport Gloves | Vice", weapon: null }), 1_000);
    const pistol = buildItemTagProfile(detail({ name: "Desert Eagle | Blaze", weapon: "Desert Eagle" }), 5_000);
    const smg = buildItemTagProfile(detail({ name: "MP9 | Hot Rod", weapon: "MP9" }), 5_000);
    const shotgun = buildItemTagProfile(detail({ name: "Nova | Bloomstick", weapon: "Nova" }), 5_000);
    const machinegun = buildItemTagProfile(detail({ name: "Negev | Power Loader", weapon: "Negev" }), 5_000);
    const goldSticker = buildItemTagProfile(
      detail({
        name: "Sticker | FURIA (Gold) | Antwerp 2022",
        marketHashName: "Sticker | FURIA (Gold) | Antwerp 2022",
        weapon: null,
        raw: { collection_name: "Antwerp 2022 Legends Capsule" },
      }),
      5_000,
    );
    const glitterSticker = buildItemTagProfile(
      detail({
        name: "Sticker | Cloud9 (Glitter) | Copenhagen 2024",
        marketHashName: "Sticker | Cloud9 (Glitter) | Copenhagen 2024",
        weapon: null,
        raw: { collection_name: "Copenhagen 2024 Legends Capsule" },
      }),
      5_000,
    );
    const paperSticker = buildItemTagProfile(
      detail({
        name: "Sticker | Vitality | Rio 2022",
        marketHashName: "Sticker | Vitality | Rio 2022",
        weapon: null,
        raw: { collection_name: "Rio 2022 Legends Capsule" },
      }),
      5_000,
    );

    expect(knife.itemTypeKey).toBe("knife");
    expect(glove.itemTypeKey).toBe("glove");
    expect(pistol.weaponClassKey).toBe("pistol");
    expect(smg.weaponClassKey).toBe("smg");
    expect(shotgun.weaponClassKey).toBe("shotgun");
    expect(machinegun.weaponClassKey).toBe("machinegun");
    expect(goldSticker.stickerFinishKey).toBe("gold");
    expect(goldSticker.stickerSeriesKey).toBe("antwerp_2022");
    expect(glitterSticker.stickerFinishKey).toBe("glitter");
    expect(glitterSticker.stickerSeriesKey).toBe("copenhagen_2024");
    expect(paperSticker.stickerFinishKey).toBe("paper");
    expect(paperSticker.stickerSeriesKey).toBe("rio_2022");
  });

  it("resolves non-gun item types and source origins", () => {
    const cases = [
      {
        profile: buildItemTagProfile(detail({ name: "Paris 2023 Legends Sticker Capsule", weapon: null }), null),
        expectedType: "capsule",
      },
      {
        profile: buildItemTagProfile(detail({ name: "Music Kit | Hotline Miami", weapon: null }), null),
        expectedType: "music_kit",
      },
      {
        profile: buildItemTagProfile(detail({ name: "Patch | Bravo", weapon: null }), null),
        expectedType: "patch",
      },
      {
        profile: buildItemTagProfile(detail({ name: "Charm | Hot Sauce", weapon: null }), null),
        expectedType: "charm",
      },
      {
        profile: buildItemTagProfile(detail({ name: "Operation Riptide Premium Pass", weapon: null }), null),
        expectedType: "tool",
      },
      {
        profile: buildItemTagProfile(detail({ name: "Recoil Case", weapon: null }), null),
        expectedType: "weapon_case",
      },
      {
        profile: buildItemTagProfile(detail({ name: "The 2021 Dust 2 Collection", weapon: null }), null),
        expectedType: "collectible",
      },
      {
        profile: buildItemTagProfile(detail({ name: "Unlisted Market Object", weapon: null }), null),
        expectedType: "other",
      },
    ];

    for (const row of cases) {
      expect(row.profile.itemTypeKey).toBe(row.expectedType);
    }
    expect(cases[0]?.profile.recommendationScopes).toContain("capsule");

    expect(
      buildItemTagProfile(detail({ raw: { source_name: "Armory Pass" } }), 5_000).originKey,
    ).toBe("armory");
    expect(
      buildItemTagProfile(detail({ raw: { source_name: "Copenhagen 2024 Souvenir Package" } }), 5_000).originKey,
    ).toBe("souvenir_package");
    expect(
      buildItemTagProfile(
        detail({
          name: "Sticker | NAVI (Holo) | Stockholm 2021",
          marketHashName: "Sticker | NAVI (Holo) | Stockholm 2021",
          weapon: null,
          raw: { source_name: "Stockholm 2021 Legends Capsule" },
        }),
        5_000,
      ).originKey,
    ).toBe("capsule");
    expect(
      buildItemTagProfile(detail({ raw: { source_name: "Masterminds Music Kit Box" } }), 5_000).originKey,
    ).toBe("music_kit");
    expect(
      buildItemTagProfile(detail({ raw: { source_name: "Operation Patch Pack" } }), 5_000).originKey,
    ).toBe("patch_pack");
    expect(buildItemTagProfile(detail({ raw: { source_name: "Recoil Case" } }), 5_000).originKey).toBe("case");
    expect(
      buildItemTagProfile(detail({ raw: { source_name: "Operation Broken Fang Collection" } }), 5_000).originKey,
    ).toBe("operation_collection");
    expect(
      buildItemTagProfile(
        detail({
          name: "Agent | Sir Bloody Darryl",
          marketHashName: "Agent | Sir Bloody Darryl",
          weapon: null,
          raw: { source_name: "Operation Riptide Agent" },
        }),
        5_000,
      ).originKey,
    ).toBe("operation_agent");
  });

  it("rejects holo stickers outside the selected series or signed player scope", () => {
    expect(
      candidateMatchesScannerScopes("Sticker | Natus Vincere (Holo) | Stockholm 2021", {
        analysisScopes: ["holo_team_sticker"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(false);

    const signatureProfile = buildItemTagProfile(
      detail({
        name: "Sticker | s1mple (Holo) | Paris 2023",
        marketHashName: "Sticker | s1mple (Holo) | Paris 2023",
        weapon: null,
        raw: { collection_name: "Paris 2023 Autograph Capsule" },
      }),
      5_000,
    );

    expect(signatureProfile.isPlayerSignature).toBe(true);
    expect(signatureProfile.recommendationScopes).not.toContain("holo_team_sticker");
    expect(
      tagProfileMatchesScanner(signatureProfile, {
        analysisScopes: ["holo_team_sticker"],
        holoStickerSeries: ["paris_2023"],
      }),
    ).toBe(false);
  });

  it("does not treat generic team words as target team sticker tokens", () => {
    const profile = buildItemTagProfile(
      detail({
        name: "Sticker | Teamwork (Holo) | Paris 2023",
        marketHashName: "Sticker | Teamwork (Holo) | Paris 2023",
        weapon: null,
      }),
      5_000,
    );

    expect(profile.isTeamSticker).toBe(false);
    expect(profile.recommendationScopes).not.toContain("holo_team_sticker");
  });
});
