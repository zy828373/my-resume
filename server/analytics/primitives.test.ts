import { describe, expect, it } from "vitest";
import {
  average,
  averageLast,
  calcKdj,
  calcMacd,
  clamp,
  ema,
  movingAverage,
  percentageChange,
  standardDeviation,
} from "./primitives.js";

describe("analytics primitives", () => {
  it("calculates stable numeric helpers", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(average([1, 2, 3])).toBe(2);
    expect(percentageChange(120, 100)).toBe(20);
    expect(standardDeviation([2, 2, 2])).toBe(0);
    expect(movingAverage([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });

  it("handles empty and invalid numeric helper inputs", () => {
    expect(average([])).toBe(0);
    expect(averageLast([2, 4, 6], 2)).toBe(5);
    expect(percentageChange(null, 100)).toBeNull();
    expect(percentageChange(100, null)).toBeNull();
    expect(percentageChange(100, 0)).toBeNull();
    expect(standardDeviation([3])).toBe(0);
    expect(ema([], 12)).toEqual([]);
  });

  it("keeps MACD and KDJ stable for flat inputs", () => {
    const macd = calcMacd(Array.from({ length: 30 }, () => 10));
    expect(macd.dif.at(-1)).toBe(0);
    expect(macd.dea.at(-1)).toBe(0);
    expect(macd.hist.at(-1)).toBe(0);

    const kdj = calcKdj([
      { t: 1, o: 10, c: 10, h: 10, l: 10, v: 1 },
      { t: 2, o: 10, c: 10, h: 10, l: 10, v: 1 },
    ]);
    expect(kdj.k).toEqual([50, 50]);
    expect(kdj.d).toEqual([50, 50]);
    expect(kdj.j).toEqual([50, 50]);
  });
});
