import type { CsfloatListingSummary } from "./types.js";

const BASE_URL = "https://csfloat.com/api/v1";

type ApiKeyProvider = () => Promise<string | undefined>;

type CsfloatListing = {
  id?: unknown;
  price?: unknown;
  seller?: {
    username?: unknown;
    steam_id?: unknown;
  };
  item?: {
    float_value?: unknown;
    paint_seed?: unknown;
    market_hash_name?: unknown;
  };
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizePrice(price: number | null) {
  if (price == null) {
    return null;
  }

  return Number((price / 100).toFixed(2));
}

export class CsfloatClient {
  constructor(private readonly getApiKey?: ApiKeyProvider) {}

  async getListingSummary(marketHashName: string | null): Promise<CsfloatListingSummary> {
    if (!marketHashName) {
      return {
        enabled: false,
        source: "CSFloat Market",
        marketHashName: null,
        listingCount: 0,
        lowestPrice: null,
        highestPrice: null,
        bestFloat: null,
        limitation: "当前饰品缺少可用于 CSFloat 查询的 market hash name。",
        samples: [],
      };
    }

    try {
      const apiKey = (await this.getApiKey?.())?.trim();
      const response = await fetch(
        `${BASE_URL}/listings?limit=12&sort_by=lowest_price&market_hash_name=${encodeURIComponent(marketHashName)}`,
        {
          headers: {
            "User-Agent": "CS2-Monitor/0.1",
            ...(apiKey ? { Authorization: apiKey } : {}),
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as CsfloatListing[];
      const prices = payload.map((row) => normalizePrice(toNumber(row.price))).filter(
        (value): value is number => value != null,
      );
      const floats = payload
        .map((row) => toNumber(row.item?.float_value))
        .filter((value): value is number => value != null);

      return {
        enabled: true,
        source: "CSFloat Market",
        marketHashName,
        listingCount: payload.length,
        lowestPrice: prices.length ? Math.min(...prices) : null,
        highestPrice: prices.length ? Math.max(...prices) : null,
        bestFloat: floats.length ? Math.min(...floats) : null,
        limitation: apiKey
          ? "当前已接入 CSFloat 开发者 Key，可补充官方 listings 样本；但完整全库持仓、未上架库存和全历史流转并不在官方公开文档内。"
          : "当前仅接入 CSFloat 官方公开 listings 数据。若你提供开发者 Key，可进一步提升成功率；但完整全库持仓、未上架库存和全历史流转并不在官方公开文档内。",
        samples: payload.slice(0, 6).map((row) => ({
          listingId: String(row.id ?? ""),
          sellerName:
            typeof row.seller?.username === "string" ? row.seller.username : "未知卖家",
          sellerSteamId:
            typeof row.seller?.steam_id === "string" ? row.seller.steam_id : null,
          price: normalizePrice(toNumber(row.price)),
          floatValue: toNumber(row.item?.float_value),
          paintSeed: toNumber(row.item?.paint_seed),
        })),
      };
    } catch (error) {
      return {
        enabled: false,
        source: "CSFloat Market",
        marketHashName,
        listingCount: 0,
        lowestPrice: null,
        highestPrice: null,
        bestFloat: null,
        limitation: `CSFloat listings 拉取失败：${error instanceof Error ? error.message : String(error)}。如果你有开发者 Key，可以在设置里补充后再试。`,
        samples: [],
      };
    }
  }
}
