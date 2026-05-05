import type { CsfloatListingSummary } from "./types.js";

const BASE_URL = "https://csfloat.com/api/v1";

type ApiKeyProvider = () => Promise<string | undefined>;

type CsfloatListing = {
  id?: unknown;
  price?: unknown;
  seller?: {
    username?: unknown;
    steam_id?: unknown;
    stall_public?: unknown;
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
        source: "CSFloat Active Listings",
        marketHashName: null,
        listingCount: 0,
        uniqueSellerCount: 0,
        publicSellerCount: 0,
        uniquePaintSeedCount: 0,
        lowestPrice: null,
        highestPrice: null,
        bestFloat: null,
        worstFloat: null,
        limitation: "当前饰品缺少可用于 CSFloat 查询的 market hash name。",
        sellerClusters: [],
        samples: [],
      };
    }

    try {
      const apiKey = (await this.getApiKey?.())?.trim();
      const response = await fetch(
        `${BASE_URL}/listings?limit=20&sort_by=lowest_price&market_hash_name=${encodeURIComponent(marketHashName)}`,
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
      const paintSeeds = payload
        .map((row) => toNumber(row.item?.paint_seed))
        .filter((value): value is number => value != null);

      const sellerMap = new Map<
        string,
        {
          sellerName: string;
          sellerSteamId: string | null;
          listingCount: number;
          lowestPrice: number | null;
          bestFloat: number | null;
          paintSeeds: Set<number>;
          stallPublic: boolean;
        }
      >();

      for (const row of payload) {
        const sellerName =
          typeof row.seller?.username === "string" && row.seller.username.trim().length > 0
            ? row.seller.username
            : "未知卖家";
        const sellerSteamId =
          typeof row.seller?.steam_id === "string" && row.seller.steam_id.trim().length > 0
            ? row.seller.steam_id
            : null;
        const sellerKey = sellerSteamId ?? sellerName;
        const normalizedPrice = normalizePrice(toNumber(row.price));
        const floatValue = toNumber(row.item?.float_value);
        const paintSeed = toNumber(row.item?.paint_seed);
        const current =
          sellerMap.get(sellerKey) ??
          {
            sellerName,
            sellerSteamId,
            listingCount: 0,
            lowestPrice: null,
            bestFloat: null,
            paintSeeds: new Set<number>(),
            stallPublic: row.seller?.stall_public === true,
          };

        current.listingCount += 1;
        current.lowestPrice =
          current.lowestPrice == null || (normalizedPrice != null && normalizedPrice < current.lowestPrice)
            ? normalizedPrice
            : current.lowestPrice;
        current.bestFloat =
          current.bestFloat == null || (floatValue != null && floatValue < current.bestFloat)
            ? floatValue
            : current.bestFloat;

        if (paintSeed != null) {
          current.paintSeeds.add(paintSeed);
        }

        current.stallPublic = current.stallPublic || row.seller?.stall_public === true;
        sellerMap.set(sellerKey, current);
      }

      return {
        enabled: true,
        source: "CSFloat Active Listings",
        marketHashName,
        listingCount: payload.length,
        uniqueSellerCount: sellerMap.size,
        publicSellerCount: [...sellerMap.values()].filter((row) => row.stallPublic).length,
        uniquePaintSeedCount: new Set(paintSeeds).size,
        lowestPrice: prices.length ? Math.min(...prices) : null,
        highestPrice: prices.length ? Math.max(...prices) : null,
        bestFloat: floats.length ? Math.min(...floats) : null,
        worstFloat: floats.length ? Math.max(...floats) : null,
        limitation: apiKey
          ? "当前已接入 CSFloat 官方 active listings 样本，可补充全球在售、卖家分布与 float/模板信息；但官方公开文档未提供全量未上架库存与完整历史持有人链路。"
          : "当前使用 CSFloat 官方公开 active listings 样本，可补充全球在售、卖家分布与 float/模板信息；但它不代表全网库存，也不包含未上架持仓与完整历史流转。",
        sellerClusters: [...sellerMap.values()]
          .sort((left, right) => {
            if (right.listingCount !== left.listingCount) {
              return right.listingCount - left.listingCount;
            }

            return (left.lowestPrice ?? Number.MAX_SAFE_INTEGER) - (right.lowestPrice ?? Number.MAX_SAFE_INTEGER);
          })
          .slice(0, 6)
          .map((row) => ({
            sellerName: row.sellerName,
            sellerSteamId: row.sellerSteamId,
            listingCount: row.listingCount,
            lowestPrice: row.lowestPrice,
            bestFloat: row.bestFloat,
            paintSeedCount: row.paintSeeds.size,
          })),
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
        source: "CSFloat Active Listings",
        marketHashName,
        listingCount: 0,
        uniqueSellerCount: 0,
        publicSellerCount: 0,
        uniquePaintSeedCount: 0,
        lowestPrice: null,
        highestPrice: null,
        bestFloat: null,
        worstFloat: null,
        limitation: `CSFloat active listings 拉取失败：${error instanceof Error ? error.message : String(error)}。如果你有开发者 Key，可以在设置里补充后再试。`,
        sellerClusters: [],
        samples: [],
      };
    }
  }
}
