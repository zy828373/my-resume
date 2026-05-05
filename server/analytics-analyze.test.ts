import { describe, expect, it, vi } from "vitest";
import type { ChartCandle } from "./types.js";
import type { CsqaqClient } from "./csqaq-client.js";

vi.mock("./history-store.js", () => ({
  appendSnapshot: vi.fn(async (snapshot) => [snapshot]),
  listSnapshots: vi.fn(async () => []),
}));

function candles(): ChartCandle[] {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: 40 }, (_, index) => {
    const price = 100 + index * 0.5;
    return {
      t: start + index * 86_400_000,
      o: price - 0.2,
      c: price,
      h: price + 0.4,
      l: price - 0.4,
      v: 5 + (index % 3),
    };
  });
}

describe("analyzeItem", () => {
  it("builds an analysis response with an autonomous pool decision", async () => {
    const { analyzeItem } = await import("./analytics.js");
    const chart = candles();
    const client = {
      getGoodById: vi.fn(async () => ({
        id: "1",
        name: "AK-47 | Test",
        market_hash_name: "AK-47 | Test (Field-Tested)",
        img: null,
        rare_name: "Classified",
        weapon_name: "AK-47",
        exterior_name: "Field-Tested",
        statistic: 10_000,
        buff_sell_price: 120,
        yyyp_sell_price: 121,
        buff_buy_price: 113,
        yyyp_buy_price: 114,
        buff_sell_num: 60,
        yyyp_sell_num: 40,
        buff_buy_num: 35,
        yyyp_buy_num: 30,
      })),
      getChart: vi.fn(async () => chart),
    } as unknown as CsqaqClient;

    const analysis = await analyzeItem(client, "1", { includeHolders: false });

    expect(analysis.item.goodId).toBe("1");
    expect(analysis.tagProfile.recommendationScopes).toContain("gun_skin");
    expect(analysis.autonomousPool?.pool).not.toBe("excluded");
    expect(analysis.summary.goodId).toBe("1");
  });
});
