import type {
  ChartCandle,
  HolderRow,
  MarketIndex,
  MonitorBusinessItem,
  MonitorInventoryItem,
  MonitorSnapshotPoint,
  MonitorTaskProfile,
} from "./types.js";

const BASE_URL = "https://api.csqaq.com/api/v1";
const REQUEST_GAP_MS = 1200;
// Follow the same successful public chart mapping used by the previous local project:
// 1 = BUFF, 2 = 悠悠有品.
const PLATFORM_CANDIDATES = [1, 2] as const;

type ApiEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

let requestChain = Promise.resolve();
let lastRequestFinishedAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestFinishedAt));
  if (wait > 0) {
    await sleep(wait);
  }
}

async function schedule<T>(task: () => Promise<T>) {
  const chained = requestChain.then(async () => {
    await throttle();
    try {
      return await task();
    } finally {
      lastRequestFinishedAt = Date.now();
    }
  });

  requestChain = chained.then(
    () => undefined,
    () => undefined,
  );
  return chained;
}

function toErrorMessage(payload: unknown, status: number) {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object" && "msg" in payload) {
    return String((payload as { msg?: unknown }).msg ?? `HTTP ${status}`);
  }

  return `HTTP ${status}`;
}

export class CsqaqClient {
  constructor(private readonly getToken: () => Promise<string | undefined>) {}

  async request<T>(
    path: string,
    init?: RequestInit,
    auth = true,
  ): Promise<ApiEnvelope<T>> {
    return schedule(async () => {
      const headers = new Headers(init?.headers ?? {});
      headers.set("Content-Type", "application/json");
      headers.set("User-Agent", "CS2-Monitor/0.1");

      if (auth) {
        const token = await this.getToken();
        if (!token) {
          throw new Error("尚未配置 ApiToken。");
        }

        headers.set("ApiToken", token);
      }

      let response: Response | null = null;
      let lastFetchError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await fetch(`${BASE_URL}${path}`, {
            ...init,
            headers,
          });
          break;
        } catch (error) {
          lastFetchError = error;
          if (attempt >= 2) {
            throw error;
          }

          await sleep(800 * (attempt + 1));
        }
      }

      if (!response) {
        throw lastFetchError instanceof Error ? lastFetchError : new Error("CSQAQ 请求失败");
      }

      const text = await response.text();
      let payload: ApiEnvelope<T> | null = null;

      if (text) {
        try {
          payload = JSON.parse(text) as ApiEnvelope<T>;
        } catch {
          const htmlLike = text.trimStart().startsWith("<");
          if (response.status === 429) {
            throw new Error("CSQAQ 接口触发频率限制，请 2 到 5 秒后重试。");
          }

          if (htmlLike) {
            throw new Error(
              `CSQAQ 返回了 HTML 页面（HTTP ${response.status}），可能是限流或风控拦截，请稍后重试。`,
            );
          }

          throw new Error(`CSQAQ 返回了非 JSON 响应（${response.status}）`);
        }
      }

      if (!response.ok || !payload) {
        throw new Error(toErrorMessage(payload, response.status));
      }

      if (typeof payload.code === "number" && payload.code >= 400) {
        throw new Error(payload.msg || "CSQAQ 接口返回异常");
      }

      return payload;
    });
  }

  async getCurrentData() {
    const payload = await this.request<{
      sub_index_data: Array<Record<string, unknown>>;
    }>("/current_data?type=init", { method: "GET" }, false);

    return (payload.data.sub_index_data ?? []).map<MarketIndex>((row) => ({
      id: Number(row.id ?? 0),
      name: String(row.name ?? ""),
      nameKey: String(row.name_key ?? ""),
      marketIndex: Number(row.market_index ?? 0),
      chgNum: Number(row.chg_num ?? 0),
      chgRate: Number(row.chg_rate ?? 0),
      open: Number(row.open ?? 0),
      close: Number(row.close ?? 0),
      high: Number(row.high ?? 0),
      low: Number(row.low ?? 0),
      updatedAt: String(row.updated_at ?? ""),
      img: typeof row.img === "string" ? row.img : undefined,
    }));
  }

  async bindLocalIp() {
    const payload = await this.request<string>("/sys/bind_local_ip", {
      method: "POST",
      body: JSON.stringify({}),
    });

    return payload.data;
  }

  async searchSuggest(text: string) {
    const payload = await this.request<Array<Record<string, unknown>>>(
      `/search/suggest?text=${encodeURIComponent(text)}`,
      { method: "GET" },
    );

    return (payload.data ?? []).map((row) => ({
      id: String(row.id ?? ""),
      value: String(row.value ?? ""),
    }));
  }

  async getPageList(pageIndex = 1, pageSize = 24) {
    const payload = await this.request<{
      current_page?: unknown;
      data?: Array<Record<string, unknown>>;
    }>("/info/get_page_list", {
      method: "POST",
      body: JSON.stringify({
        page_index: pageIndex,
        page_size: pageSize,
        search: "",
        filter: {},
      }),
    });

    return {
      currentPage: Number(payload.data.current_page ?? pageIndex),
      items: (payload.data.data ?? []).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        image: typeof row.img === "string" ? row.img : null,
        rarity: typeof row.rarity_localized_name === "string" ? row.rarity_localized_name : null,
        exterior:
          typeof row.exterior_localized_name === "string" ? row.exterior_localized_name : null,
        yyypSellPrice: row.yyyp_sell_price == null ? null : Number(row.yyyp_sell_price),
        yyypSellNum: row.yyyp_sell_num == null ? null : Number(row.yyyp_sell_num),
      })),
    };
  }

  async getPopularGoods() {
    const payload = await this.request<Array<Record<string, unknown>>>(
      "/info/get_popular_goods",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    return (payload.data ?? []).map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      marketHashName:
        typeof row.market_hash_name === "string" ? row.market_hash_name : null,
      image: typeof row.img === "string" ? row.img : null,
      rankNum: row.rank_num == null ? null : Number(row.rank_num),
      rankNumChange:
        row.rank_num_change == null ? null : Number(row.rank_num_change),
      turnoverNumber:
        row.turnover_number == null ? null : Number(row.turnover_number),
    }));
  }

  async getGoodById(goodId: string) {
    const payload = await this.request<Record<string, unknown>>(
      `/info/good?id=${encodeURIComponent(goodId)}`,
      { method: "GET" },
    );
    return payload.data ?? {};
  }

  async getGoodStatistic(goodId: string) {
    const payload = await this.request<Array<Record<string, unknown>> | Record<string, unknown>>(
      `/info/good/statistic?id=${encodeURIComponent(goodId)}`,
      { method: "GET" },
    );
    return payload.data;
  }

  async getChartAll(goodId: string, plat: number, periods = "1day") {
    const payload = await this.request<Array<Record<string, unknown>>>(
      "/info/simple/chartAll",
      {
        method: "POST",
        body: JSON.stringify({
          good_id: String(goodId),
          plat,
          periods,
          max_time: Date.now(),
        }),
      },
    );

    const candles = (payload.data ?? [])
      .map<ChartCandle>((row) => ({
        t: Number(row.t ?? 0),
        o: Number(row.o ?? 0),
        c: Number(row.c ?? 0),
        h: Number(row.h ?? 0),
        l: Number(row.l ?? 0),
        v: Number(row.v ?? 0),
      }))
      .filter((row) => row.t > 0)
      .sort((a, b) => a.t - b.t);

    return candles;
  }

  async getChart(goodId: string, platform: number, key = "sell_price", period = "180") {
    const payload = await this.request<{
      timestamp?: unknown[];
      main_data?: unknown[];
      num_data?: unknown[];
    }>("/info/chart", {
      method: "POST",
      body: JSON.stringify({
        good_id: String(goodId),
        key,
        platform,
        period,
        style: "all_style",
      }),
    });

    const timestamps = Array.isArray(payload.data.timestamp) ? payload.data.timestamp : [];
    const prices = Array.isArray(payload.data.main_data) ? payload.data.main_data : [];
    const activity = Array.isArray(payload.data.num_data) ? payload.data.num_data : [];
    const candles: ChartCandle[] = [];

    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = Number(timestamps[index] ?? 0);
      const close = Number(prices[index] ?? 0);
      const prev = index > 0 ? Number(prices[index - 1] ?? close) : close;
      const volume = Number(activity[index] ?? 0);

      if (timestamp > 0 && close > 0) {
        candles.push({
          t: timestamp,
          o: prev,
          c: close,
          h: Math.max(prev, close),
          l: Math.min(prev, close),
          v: Number.isFinite(volume) ? volume : 0,
        });
      }
    }

    return candles;
  }

  async getMonitorRank(goodId: string) {
    const payload = await this.request<Array<Record<string, unknown>>>(
      "/monitor/rank",
      {
        method: "POST",
        body: JSON.stringify({ good_id: String(goodId) }),
      },
    );

    return (payload.data ?? []).map<HolderRow>((row) => ({
      id: row.id ? Number(row.id) : undefined,
      steamName: String(row.steam_name ?? "未知持仓"),
      steamId: row.steam_id ? String(row.steam_id) : undefined,
      avatar: row.avatar ? String(row.avatar) : undefined,
      num: Number(row.num ?? 0),
    }));
  }

  async getMonitorTaskInfo(taskId: string | number) {
    const payload = await this.request<{
      info?: Array<Record<string, unknown>>;
      is_user?: unknown;
      is_subscribe?: unknown;
    }>("/task/get_task_info", {
      method: "POST",
      body: JSON.stringify({ task_id: String(taskId) }),
    });

    const row = payload.data.info?.[0] ?? {};
    return {
      taskId: Number(row.id ?? taskId),
      steamName: String(row.steam_name ?? "未知席位"),
      steamId: row.steam_id ? String(row.steam_id) : null,
      avatar: row.avatar ? String(row.avatar) : null,
      inventoryCount: row.amount == null ? null : Number(row.amount),
      visibleAssetCount: row.asset_cnt == null ? null : Number(row.asset_cnt),
      activeDays: row.active_time == null ? null : Number(row.active_time),
      state: row.state == null ? null : Number(row.state),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      tradedAt: row.traded_at ? String(row.traded_at) : null,
      inventoryState: row.inventory_state == null ? null : Number(row.inventory_state),
      isUser: payload.data.is_user === true,
      isSubscribe: payload.data.is_subscribe === true,
    } satisfies MonitorTaskProfile;
  }

  async getMonitorTaskInventory(taskId: string | number, pageIndex = 1, pageSize = 24) {
    const payload = await this.request<Array<Record<string, unknown>>>("/task/get_task_all", {
      method: "POST",
      body: JSON.stringify({
        task_id: String(taskId),
        page_index: pageIndex,
        page_size: pageSize,
      }),
    });

    return (payload.data ?? []).map<MonitorInventoryItem>((row) => ({
      categoryName: String(row.gp_name ?? "未分类"),
      price: row.price == null ? null : Number(row.price),
      marketName: String(row.market_name ?? "未知饰品"),
      tradable: Number(row.tradable ?? 0) === 1,
      count: Number(row.num ?? 0),
      createdAt: row.created_at ? String(row.created_at) : null,
      iconUrl:
        typeof row.icon_url === "string" && row.icon_url.startsWith("http") ? row.icon_url : null,
      goodId: row.good_id == null ? null : String(row.good_id),
    }));
  }

  async getMonitorTaskBusiness(
    taskId: string | number,
    pageIndex = 1,
    pageSize = 20,
    search = "",
    type = "ALL",
  ) {
    const payload = await this.request<{
      trades?: Array<Record<string, unknown>>;
    }>("/task/get_task_business", {
      method: "POST",
      body: JSON.stringify({
        task_id: Number(taskId),
        page_index: pageIndex,
        page_size: pageSize,
        search,
        type,
      }),
    });

    return (payload.data.trades ?? []).map<MonitorBusinessItem>((row) => ({
      goodId: row.good_id == null ? null : String(row.good_id),
      marketName: String(row.market_name ?? "未知饰品"),
      count: Number(row.count ?? 0),
      iconUrl:
        typeof row.icon_url === "string" && row.icon_url.startsWith("http") ? row.icon_url : null,
      tradable: Number(row.tradable ?? 0) === 1,
      type: row.type == null ? null : Number(row.type),
      createdAt: row.created_at ? String(row.created_at) : null,
    }));
  }

  async getMonitorTaskSnapshots(taskId: string | number) {
    const payload = await this.request<Array<Record<string, unknown>>>("/task/get_task_recent", {
      method: "POST",
      body: JSON.stringify({ task_id: String(taskId) }),
    });

    return (payload.data ?? []).map<MonitorSnapshotPoint>((row) => ({
      snapshotId: Number(row.snapshot_id ?? 0),
      createdAt: row.created_at ? String(row.created_at) : null,
    }));
  }

  platformCandidates() {
    return [...PLATFORM_CANDIDATES];
  }
}
