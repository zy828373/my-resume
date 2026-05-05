import type {
  ItemTagProfile,
  NormalizedDetail,
  RecommendationScopeKey,
  ScannerConfig,
  StickerSeriesKey,
} from "./types.js";

export const DEFAULT_RECOMMENDATION_SCOPES: RecommendationScopeKey[] = [
  "agent",
  "holo_team_sticker",
  "gun_skin",
  "discontinued_collection_skin",
  "knife_glove",
  "covert_tradeup",
  "weapon_case",
  "capsule",
  "collectible",
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

export const RECOMMENDATION_SCOPE_LABELS: Record<RecommendationScopeKey, string> = {
  agent: "探员板块",
  holo_team_sticker: "全息战队贴纸板块",
  gun_skin: "枪皮板块",
  discontinued_collection_skin: "绝版收藏品枪皮板块",
  knife_glove: "刀手套板块",
  covert_tradeup: "红皮炼金燃料",
  weapon_case: "武器箱板块",
  capsule: "胶囊板块",
  collectible: "收藏品板块",
};

export const HOLO_STICKER_SERIES_LABELS: Record<StickerSeriesKey, string> = {
  stockholm_2021: "Stockholm 2021",
  antwerp_2022: "Antwerp 2022",
  rio_2022: "Rio 2022",
  paris_2023: "Paris 2023",
  copenhagen_2024: "Copenhagen 2024",
  shanghai_2024: "Shanghai 2024",
  other: "其他年份",
};

const GUN_WEAPON_TOKENS = [
  "ak-47",
  "awp",
  "m4a1",
  "m4a4",
  "aug",
  "sg 553",
  "famas",
  "galil",
  "ssg 08",
  "scar-20",
  "g3sg1",
  "glock",
  "usp",
  "desert eagle",
  "p2000",
  "p250",
  "five-seven",
  "fn57",
  "r8",
  "tec-9",
  "dual berettas",
  "cz75",
  "mp9",
  "mac-10",
  "ump-45",
  "p90",
  "mp7",
  "pp-bizon",
  "mp5-sd",
  "xm1014",
  "mag-7",
  "sawed-off",
  "nova",
  "m249",
  "negev",
  "步枪",
  "手枪",
  "微型冲锋枪",
  "霰弹枪",
  "机枪",
  "法玛斯",
  "加利尔",
  "沙漠之鹰",
  "格洛克",
  "新星",
  "内格夫",
];

const TEAM_STICKER_TOKENS = [
  "faze",
  "faze clan",
  "g2",
  "navi",
  "natus vincere",
  "tyloo",
  "vitality",
  "team vitality",
  "spirit",
  "team spirit",
  "mouz",
  "liquid",
  "team liquid",
  "furia",
  "pain",
  "pain gaming",
  "flyquest",
  "mongolz",
  "the mongolz",
  "lynn vision",
  "rare atom",
  "astralis",
  "fnatic",
  "nip",
  "heroic",
  "ence",
  "complexity",
  "virtus.pro",
  "vp",
  "imperial",
  "mibr",
  "legacy",
  "wildcard",
  "m80",
  "saw",
  "sharks",
  "3dmax",
  "big",
  "falcons",
  "eternal fire",
  "gamerlegion",
  "cloud9",
  "copenhagen flames",
  "bad news eagles",
  "bne",
  "outsiders",
  "avangar",
  "entropiq",
  "forze",
  "9ine",
  "itb",
  "into the breach",
  "fluxo",
  "grayhound",
  "ihc",
  "renegades",
  "aurora",
  "monte",
  "apeks",
  "b8",
  "ecstatic",
  "og",
  "betboom",
  "passion ua",
  "ninjas in pyjamas",
];

const PLAYER_SIGNATURE_TOKENS = [
  "autograph",
  "signature",
  "签名",
  "选手",
  "player",
];

const DISCONTINUED_SOURCE_TOKENS = [
  "稀有掉落",
  "大行动",
  "绝版",
  "operation",
  "exclusive",
  "rare drop",
  "古堡",
  "cobblestone",
  "死城之谜",
  "cache",
  "overpass",
  "神魔",
  "gods and monsters",
  "旭日",
  "rising sun",
  "解体厂",
  "chop shop",
  "挪威人",
  "norse",
  "运河水城",
  "canals",
  "圣马克镇",
  "st. marc",
  "st marc",
  "裂网大行动",
  "shattered web",
  "狂牙大行动",
  "broken fang",
  "激流大行动",
  "riptide",
  "血猎大行动",
  "bloodhound",
  "九头蛇大行动",
  "hydra",
  "野火大行动",
  "wildfire",
  "控制收藏品",
  "control collection",
  "浩劫收藏品",
  "havoc collection",
  "远古收藏品",
  "ancient collection",
  "列车停放站 2021",
  "train collection",
  "荒漠迷城 2021",
  "mirage collection",
  "炙热沙城 2021",
  "dust 2 collection",
  "殒命大厦 2021",
  "vertigo collection",
];

function includesAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

export function normalizeItemText(text: string | null | undefined) {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getPathValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function pickString(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeKey(value: string | null) {
  if (!value) return null;
  return normalizeItemText(value)
    .replace(/[™★（）()|]/g, "")
    .replace(/\s+/g, "_");
}

function resolveStickerSeries(text: string): StickerSeriesKey | null {
  const normalized = normalizeItemText(text);
  if (includesAny(normalized, ["stockholm", "斯德哥尔摩"]) && normalized.includes("2021")) {
    return "stockholm_2021";
  }
  if (includesAny(normalized, ["antwerp", "安特卫普"]) && normalized.includes("2022")) {
    return "antwerp_2022";
  }
  if (includesAny(normalized, ["rio", "里约"]) && normalized.includes("2022")) return "rio_2022";
  if (includesAny(normalized, ["paris", "巴黎"]) && normalized.includes("2023")) return "paris_2023";
  if (includesAny(normalized, ["copenhagen", "哥本哈根"]) && normalized.includes("2024")) {
    return "copenhagen_2024";
  }
  if (includesAny(normalized, ["shanghai", "上海"]) && normalized.includes("2024")) {
    return "shanghai_2024";
  }
  if (normalized.includes("印花") || normalized.includes("sticker")) return "other";
  return null;
}

function resolveStickerFinish(text: string): ItemTagProfile["stickerFinishKey"] {
  const normalized = normalizeItemText(text);
  if (includesAny(normalized, ["(holo)", "（全息）", " holo", "全息"])) return "holo";
  if (includesAny(normalized, ["(glitter)", "（闪耀）", " glitter", "闪耀"])) return "glitter";
  if (includesAny(normalized, ["(gold)", "（金色）", " gold", "金色"])) return "gold";
  if (includesAny(normalized, ["sticker", "印花"])) return "paper";
  return null;
}

function resolveWear(text: string): ItemTagProfile["wearKey"] {
  const normalized = normalizeItemText(text);
  if (includesAny(normalized, ["factory new", "崭新出厂"])) return "factory_new";
  if (includesAny(normalized, ["minimal wear", "略有磨损"])) return "minimal_wear";
  if (includesAny(normalized, ["field-tested", "field tested", "久经沙场"])) return "field_tested";
  if (includesAny(normalized, ["well-worn", "well worn", "破损不堪"])) return "well_worn";
  if (includesAny(normalized, ["battle-scarred", "battle scarred", "战痕累累"])) return "battle_scarred";
  if (includesAny(normalized, ["not painted", "无涂装"])) return "not_painted";
  return null;
}

function resolveSpecial(text: string, quality: string | null): ItemTagProfile["specialKey"] {
  const normalized = normalizeItemText(`${text} ${quality ?? ""}`);
  const hasStar = text.includes("★") || quality === "★";
  const hasStatTrak = includesAny(normalized, ["stattrak", "stat trak"]);
  if (includesAny(normalized, ["souvenir", "纪念品"])) return "souvenir";
  if (hasStar && hasStatTrak) return "star_stattrak";
  if (hasStatTrak) return "stattrak";
  if (hasStar) return "star";
  return "normal";
}

function resolveItemType(detail: NormalizedDetail, text: string): Pick<ItemTagProfile, "itemTypeKey" | "itemTypeLabel" | "weaponClassKey"> {
  const typeText = `${detail.weapon ?? ""} ${text}`;
  const normalized = normalizeItemText(typeText);
  if (includesAny(normalized, ["knife", "bayonet", "karambit", "匕首", "刺刀", "爪子刀", "折刀"])) {
    return { itemTypeKey: "knife", itemTypeLabel: "匕首", weaponClassKey: null };
  }
  if (includesAny(normalized, ["glove", "手套", "hand wraps", "bloodhound", "hydra", "broken fang"])) {
    return { itemTypeKey: "glove", itemTypeLabel: "手套", weaponClassKey: null };
  }
  if (includesAny(normalized, ["agent", "探员", "特工", "terrorist", "counter-terrorist"])) {
    return { itemTypeKey: "agent", itemTypeLabel: "探员", weaponClassKey: null };
  }
  if (includesAny(normalized, ["capsule", "胶囊"])) {
    return { itemTypeKey: "capsule", itemTypeLabel: "胶囊", weaponClassKey: null };
  }
  if (includesAny(normalized, ["sticker", "印花"])) {
    return { itemTypeKey: "sticker", itemTypeLabel: "印花", weaponClassKey: null };
  }
  if (includesAny(normalized, ["music kit", "音乐盒", "音乐集"])) {
    return { itemTypeKey: "music_kit", itemTypeLabel: "音乐盒", weaponClassKey: null };
  }
  if (includesAny(normalized, ["patch", "布章"])) {
    return { itemTypeKey: "patch", itemTypeLabel: "布章", weaponClassKey: null };
  }
  if (includesAny(normalized, ["charm", "挂件"])) {
    return { itemTypeKey: "charm", itemTypeLabel: "挂件", weaponClassKey: null };
  }
  if (includesAny(normalized, ["tool", "key", "pass", "工具", "钥匙", "通行证"])) {
    return { itemTypeKey: "tool", itemTypeLabel: "工具", weaponClassKey: null };
  }
  if (includesAny(normalized, GUN_WEAPON_TOKENS)) {
    if (includesAny(normalized, ["步枪", "ak-47", "awp", "m4a", "aug", "sg 553", "famas", "galil", "ssg 08", "scar-20", "g3sg1"])) {
      return { itemTypeKey: "gun", itemTypeLabel: "枪皮", weaponClassKey: "rifle" };
    }
    if (includesAny(normalized, ["手枪", "glock", "usp", "desert eagle", "p2000", "p250", "five-seven", "fn57", "r8", "tec-9", "dual berettas", "cz75"])) {
      return { itemTypeKey: "gun", itemTypeLabel: "枪皮", weaponClassKey: "pistol" };
    }
    if (includesAny(normalized, ["微型冲锋枪", "mp9", "mac-10", "ump-45", "p90", "mp7", "pp-bizon", "mp5-sd"])) {
      return { itemTypeKey: "gun", itemTypeLabel: "枪皮", weaponClassKey: "smg" };
    }
    if (includesAny(normalized, ["霰弹枪", "xm1014", "mag-7", "sawed-off", "nova"])) {
      return { itemTypeKey: "gun", itemTypeLabel: "枪皮", weaponClassKey: "shotgun" };
    }
    if (includesAny(normalized, ["机枪", "m249", "negev", "内格夫"])) {
      return { itemTypeKey: "gun", itemTypeLabel: "枪皮", weaponClassKey: "machinegun" };
    }
    return { itemTypeKey: "gun", itemTypeLabel: "枪皮", weaponClassKey: "rifle" };
  }
  if (includesAny(normalized, ["weapon case", "武器箱", "case"])) {
    return { itemTypeKey: "weapon_case", itemTypeLabel: "武器箱", weaponClassKey: null };
  }
  if (includesAny(normalized, ["collection", "收藏品"])) {
    return { itemTypeKey: "collectible", itemTypeLabel: "收藏品", weaponClassKey: null };
  }
  return { itemTypeKey: "other", itemTypeLabel: "其他", weaponClassKey: null };
}

function extractSourceLabels(raw: Record<string, unknown>) {
  const rows = [
    raw.container,
    raw.containers,
    raw.container_info,
    raw.containerInfo,
    getPathValue(raw, "goods_info.container"),
    getPathValue(raw, "goods_info.containers"),
    getPathValue(raw, "goods_info.container_info"),
  ].flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));
  const objectLabels = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof record.short_name === "string"
            ? record.short_name
            : "";
      const comment =
        typeof record.comment === "string"
          ? record.comment
          : typeof record.type_name === "string"
            ? record.type_name
            : "";
      return `${name} ${comment}`.trim();
    })
    .filter((value): value is string => Boolean(value));
  const directLabels = [
    pickString(raw, ["container_name", "source_name", "series_name", "collection_name"]),
    pickString(raw, [
      "goods_info.container_name",
      "goods_info.source_name",
      "goods_info.series_name",
      "goods_info.collection_name",
    ]),
  ].filter((value): value is string => Boolean(value));

  return [...new Set([...objectLabels, ...directLabels])];
}

function resolveOrigin(text: string, sourceText: string): Pick<ItemTagProfile, "originKey" | "originLabel" | "sourceSeriesKey" | "sourceSeriesLabel" | "isRareDropSource" | "isOperationSource" | "isDiscontinuedCandidate"> {
  const normalizedSource = normalizeItemText(sourceText);
  const normalized = normalizedSource || normalizeItemText(text).replace(/case hardened/g, "");
  const sourceLabel = sourceText.split("  ")[0]?.trim() || null;
  const isRareDropSource = includesAny(normalized, ["稀有掉落", "rare drop"]);
  const isOperationSource = includesAny(normalized, ["大行动", "operation", "shattered web", "broken fang", "riptide", "bloodhound", "hydra", "wildfire"]);
  const isDiscontinuedCandidate =
    isRareDropSource ||
    isOperationSource ||
    includesAny(normalized, DISCONTINUED_SOURCE_TOKENS);

  if (includesAny(normalized, ["武库", "armory"])) {
    return {
      originKey: "armory",
      originLabel: "武库通行证兑换",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  if (includesAny(normalized, ["souvenir package", "纪念包"])) {
    return {
      originKey: "souvenir_package",
      originLabel: "纪念包",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  if (includesAny(normalized, ["capsule", "胶囊"])) {
    return {
      originKey: "capsule",
      originLabel: "胶囊",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  if (includesAny(normalized, ["music", "音乐集"])) {
    return {
      originKey: "music_kit",
      originLabel: "音乐集",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  if (includesAny(normalized, ["patch", "布章包"])) {
    return {
      originKey: "patch_pack",
      originLabel: "布章包",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  if (includesAny(normalized, ["case", "武器箱"])) {
    return {
      originKey: "case",
      originLabel: "武器箱",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  if (includesAny(normalized, ["collection", "收藏品"])) {
    return {
      originKey: isOperationSource ? "operation_collection" : "collection",
      originLabel: isOperationSource ? "大行动收藏品" : "收藏品",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  if (includesAny(normalized, ["agent", "探员"])) {
    return {
      originKey: isOperationSource ? "operation_agent" : "collection",
      originLabel: isOperationSource ? "大行动探员" : "探员",
      sourceSeriesKey: normalizeKey(sourceLabel),
      sourceSeriesLabel: sourceLabel,
      isRareDropSource,
      isOperationSource,
      isDiscontinuedCandidate,
    };
  }
  return {
    originKey: null,
    originLabel: null,
    sourceSeriesKey: normalizeKey(sourceLabel),
    sourceSeriesLabel: sourceLabel,
    isRareDropSource,
    isOperationSource,
    isDiscontinuedCandidate,
  };
}

function resolveSupplyBand(statistic: number | null): ItemTagProfile["supplyBandKey"] {
  if (statistic == null || Number.isNaN(statistic)) return "unknown";
  if (statistic < 2_000) return "under_2k";
  if (statistic <= 40_000) return "2k_40k";
  return "over_40k";
}

function rarityWeight(rarityKey: string | null, agentRarityKey: string | null) {
  const rarityWeights: Record<string, number> = {
    contraband: 18,
    covert: 16,
    classified: 12,
    restricted: 9,
    mil_spec: 6,
    industrial_grade: 3,
    consumer_grade: 2,
    base_grade: 1,
    违禁: 18,
    隐秘: 16,
    保密: 12,
    受限: 9,
    军规级: 6,
    工业级: 3,
    消费级: 2,
    普通级: 1,
    extraordinary: 12,
    exotic: 9,
    remarkable: 7,
    high_grade: 4,
    非凡: 12,
    奇异: 9,
    卓越: 7,
    高级: 4,
  };
  const agentWeights: Record<string, number> = {
    master: 12,
    superior: 8,
    exceptional: 6,
    distinguished: 4,
    大师: 12,
    非凡: 10,
    卓越: 8,
    高级: 4,
  };
  if (agentRarityKey && agentWeights[agentRarityKey] != null) {
    return agentWeights[agentRarityKey]!;
  }
  if (rarityKey && rarityWeights[rarityKey] != null) {
    return rarityWeights[rarityKey]!;
  }
  return 0;
}

function calculateHype(profile: Omit<ItemTagProfile, "hypeFitScore" | "hypeTags" | "recommendationScopes">) {
  let score = 0;
  const tags: string[] = [];
  const isGun = profile.itemTypeKey === "gun";

  if (profile.supplyBandKey === "2k_40k") {
    score += 28;
    tags.push("存世 2k-4w");
  } else if (profile.supplyBandKey === "under_2k") {
    score += 10;
    tags.push("极低存世观察");
  }

  if (isGun && ["factory_new", "minimal_wear", "field_tested"].includes(profile.wearKey ?? "")) {
    score += 12;
    tags.push("FN/MW/FT");
  }

  if (isGun && profile.specialKey === "normal") {
    score += 10;
    tags.push("普通非 ST/纪念品");
  } else if (isGun && (profile.isStatTrak || profile.isSouvenir)) {
    score -= 20;
  }

  const qualityScore = rarityWeight(profile.rarityKey, profile.agentRarityKey);
  if (qualityScore > 0) {
    score += qualityScore;
    if (qualityScore >= 9) tags.push("高品质权重");
  }

  if (profile.isDiscontinuedCandidate) {
    score += 18;
    tags.push("绝版/稀缺来源");
  }
  if (profile.isOperationSource) {
    score += 12;
    tags.push(profile.itemTypeKey === "agent" ? "大行动探员" : "大行动内容");
  }
  if (profile.isRareDropSource) {
    score += 10;
    tags.push("稀有掉落来源");
  }
  if (profile.stickerFinishKey === "holo" && profile.isTeamSticker && !profile.isPlayerSignature) {
    score += 30;
    tags.push("全息战队贴纸", "非签名");
  }
  if (profile.itemTypeKey === "agent") {
    score += 20;
    tags.push("探员题材");
  }

  return {
    hypeFitScore: Math.max(0, Math.min(100, Math.round(score))),
    hypeTags: [...new Set(tags)],
  };
}

function resolveRecommendationScopes(profile: Omit<ItemTagProfile, "recommendationScopes">) {
  const scopes: RecommendationScopeKey[] = [];
  const isGoodSupply = profile.supplyBandKey === "2k_40k";
  const isTargetWear = ["factory_new", "minimal_wear", "field_tested"].includes(profile.wearKey ?? "");
  const isNormalGun = profile.itemTypeKey === "gun" && !profile.isStatTrak && !profile.isSouvenir;
  const rarityText = `${profile.rarityKey ?? ""} ${profile.rarityLabel ?? ""}`.toLowerCase();
  const isCovert = isNormalGun && includesAny(rarityText, ["covert", "隐秘", "绝密"]);

  if (profile.itemTypeKey === "agent") scopes.push("agent");
  if (profile.stickerFinishKey === "holo" && profile.isTeamSticker && !profile.isPlayerSignature) {
    scopes.push("holo_team_sticker");
  }
  if (isNormalGun && isGoodSupply && isTargetWear) scopes.push("gun_skin");
  if (isNormalGun && isGoodSupply && isTargetWear && profile.isDiscontinuedCandidate) {
    scopes.push("discontinued_collection_skin");
  }
  if (profile.itemTypeKey === "knife" || profile.itemTypeKey === "glove") scopes.push("knife_glove");
  if (isCovert) scopes.push("covert_tradeup");
  if (profile.itemTypeKey === "weapon_case") scopes.push("weapon_case");
  if (profile.itemTypeKey === "capsule" || profile.originKey === "capsule") scopes.push("capsule");
  if (["collectible", "patch", "charm"].includes(profile.itemTypeKey)) scopes.push("collectible");

  return scopes;
}

export function buildItemTagProfile(detail: NormalizedDetail, statistic: number | null): ItemTagProfile {
  const qualityLabel = pickString(detail.raw, ["goods_info.quality_localized_name", "quality_localized_name"]);
  const text = `${detail.name} ${detail.marketHashName ?? ""} ${detail.weapon ?? ""} ${detail.rarity ?? ""} ${detail.exterior ?? ""} ${qualityLabel ?? ""}`;
  const normalized = normalizeItemText(text);
  const itemType = resolveItemType(detail, text);
  const sourceLabels = extractSourceLabels(detail.raw);
  const sourceText = sourceLabels.join("  ");
  const fullText = `${text} ${sourceText}`;
  const stickerFinishKey = resolveStickerFinish(fullText);
  const stickerSeriesKey = resolveStickerSeries(fullText);
  const normalizedSource = normalizeItemText(sourceText);
  const origin = resolveOrigin(text, sourceText);
  const isStatTrak = includesAny(normalized, ["stattrak", "stat trak"]);
  const isSouvenir = includesAny(normalized, ["souvenir", "纪念品"]);
  const sourceSuggestsSignature = includesAny(normalizedSource, PLAYER_SIGNATURE_TOKENS);
  const sourceSuggestsTeamStickerSource = Boolean(normalizedSource) && !sourceSuggestsSignature;
  const hasKnownTeamToken = TEAM_STICKER_TOKENS.some((token) => normalized.includes(token));
  const isPlayerSignature =
    itemType.itemTypeKey === "sticker" &&
    includesAny(`${normalized} ${normalizedSource}`, PLAYER_SIGNATURE_TOKENS);
  const isTeamSticker =
    itemType.itemTypeKey === "sticker" &&
    !isPlayerSignature &&
    (hasKnownTeamToken || (stickerSeriesKey != null && sourceSuggestsTeamStickerSource));
  const agentRarityKey = itemType.itemTypeKey === "agent" ? normalizeKey(detail.rarity) : null;
  const baseProfile = {
    ...itemType,
    qualityKey: normalizeKey(qualityLabel),
    qualityLabel,
    rarityKey: normalizeKey(detail.rarity),
    rarityLabel: detail.rarity,
    stickerRarityKey: itemType.itemTypeKey === "sticker" ? normalizeKey(detail.rarity) : null,
    agentRarityKey,
    specialKey: resolveSpecial(text, qualityLabel),
    wearKey: resolveWear(`${detail.exterior ?? ""} ${text}`),
    stickerFinishKey,
    originKey:
      itemType.itemTypeKey === "agent" && origin.isOperationSource
        ? "operation_agent"
        : origin.originKey,
    originLabel:
      itemType.itemTypeKey === "agent" && origin.isOperationSource
        ? "大行动探员"
        : origin.originLabel,
    sourceSeriesKey: origin.sourceSeriesKey,
    sourceSeriesLabel: origin.sourceSeriesLabel,
    stickerSeriesKey,
    stickerSeriesLabel: stickerSeriesKey ? HOLO_STICKER_SERIES_LABELS[stickerSeriesKey] : null,
    isTeamSticker,
    isPlayerSignature,
    isStatTrak,
    isSouvenir,
    isDiscontinuedCandidate: origin.isDiscontinuedCandidate,
    isRareDropSource: origin.isRareDropSource,
    isOperationSource: origin.isOperationSource,
    supplyBandKey: resolveSupplyBand(statistic),
  } satisfies Omit<ItemTagProfile, "hypeFitScore" | "hypeTags" | "recommendationScopes">;
  const hype = calculateHype(baseProfile);

  return {
    ...baseProfile,
    ...hype,
    recommendationScopes: resolveRecommendationScopes({ ...baseProfile, ...hype }),
  };
}

export function normalizeRecommendationScopes(value: unknown): RecommendationScopeKey[] {
  const allowed = new Set(DEFAULT_RECOMMENDATION_SCOPES);
  const rows = Array.isArray(value) ? value : DEFAULT_RECOMMENDATION_SCOPES;
  const normalized = rows.filter((row): row is RecommendationScopeKey => allowed.has(row as RecommendationScopeKey));
  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_RECOMMENDATION_SCOPES];
}

export function normalizeHoloStickerSeries(value: unknown): StickerSeriesKey[] {
  const allowed = new Set(DEFAULT_HOLO_STICKER_SERIES);
  const rows = Array.isArray(value) ? value : DEFAULT_HOLO_STICKER_SERIES;
  const normalized = rows.filter((row): row is StickerSeriesKey => allowed.has(row as StickerSeriesKey));
  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_HOLO_STICKER_SERIES];
}

export function tagProfileMatchesScanner(profile: ItemTagProfile, scanner?: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries"> | null) {
  const scopes = normalizeRecommendationScopes(scanner?.analysisScopes);
  const selectedSeries = normalizeHoloStickerSeries(scanner?.holoStickerSeries);
  const scopeMatched = profile.recommendationScopes.some((scope) => scopes.includes(scope));
  if (!scopeMatched) return false;
  if (
    profile.recommendationScopes.includes("holo_team_sticker") &&
    scopes.includes("holo_team_sticker") &&
    !selectedSeries.includes(profile.stickerSeriesKey ?? "other")
  ) {
    return false;
  }
  return true;
}

export function candidateMatchesScannerScopes(
  candidateName: string,
  scanner?: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries"> | null,
) {
  const text = normalizeItemText(candidateName);
  const scopes = normalizeRecommendationScopes(scanner?.analysisScopes);
  const series = normalizeHoloStickerSeries(scanner?.holoStickerSeries);
  if (includesAny(text, ["stattrak", "stat trak"])) return false;
  if (scopes.includes("agent") && includesAny(text, ["agent", "探员", "特工"])) return true;
  if (
    scopes.includes("weapon_case") &&
    includesAny(text, [" weapon case", " case", "武器箱"]) &&
    !includesAny(text, ["case hardened"])
  ) {
    return true;
  }
  if (scopes.includes("capsule") && includesAny(text, ["capsule", "胶囊"])) return true;
  if (
    scopes.includes("knife_glove") &&
    includesAny(text, ["knife", "bayonet", "karambit", "glove", "手套", "匕首", "刺刀"])
  ) {
    return true;
  }
  if (scopes.includes("holo_team_sticker") && includesAny(text, ["sticker", "印花"]) && includesAny(text, ["holo", "全息"])) {
    const stickerSeries = resolveStickerSeries(text) ?? "other";
    return series.includes(stickerSeries);
  }
  if (
    scopes.includes("gun_skin") &&
    includesAny(text, GUN_WEAPON_TOKENS) &&
    !includesAny(text, ["souvenir", "纪念品", "sticker", "印花"])
  ) {
    return true;
  }
  if (scopes.includes("covert_tradeup")) {
    return includesAny(text, GUN_WEAPON_TOKENS) && !includesAny(text, ["souvenir", "纪念品", "stattrak"]);
  }
  if (scopes.includes("collectible")) {
    return includesAny(text, ["collection", "collectible", "patch", "charm", "收藏品", "布章", "挂件"]);
  }
  return false;
}
