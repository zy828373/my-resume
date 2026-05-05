import type { ChartCandle } from "../types.js";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function averageLast(values: number[], count: number) {
  return average(values.slice(-count));
}

export function percentageChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function movingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    if (index < period - 1) {
      return null;
    }

    const slice = values.slice(index - period + 1, index + 1);
    return Number(average(slice).toFixed(2));
  });
}

export function ema(values: number[], period: number) {
  if (!values.length) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    result.push((values[index] - result[index - 1]) * multiplier + result[index - 1]);
  }

  return result;
}

export function calcMacd(values: number[]) {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const dif = values.map((_, index) => Number((ema12[index] - ema26[index]).toFixed(4)));
  const dea = ema(dif, 9).map((value) => Number(value.toFixed(4)));
  const hist = dif.map((value, index) => Number(((value - dea[index]) * 2).toFixed(4)));
  return { dif, dea, hist };
}

export function calcKdj(candles: ChartCandle[]) {
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];
  let currentK = 50;
  let currentD = 50;

  candles.forEach((candle, index) => {
    const start = Math.max(0, index - 8);
    const window = candles.slice(start, index + 1);
    const highest = Math.max(...window.map((row) => row.h));
    const lowest = Math.min(...window.map((row) => row.l));
    const rsv = highest === lowest ? 50 : ((candle.c - lowest) / (highest - lowest)) * 100;
    currentK = (2 * currentK + rsv) / 3;
    currentD = (2 * currentD + currentK) / 3;
    const currentJ = 3 * currentK - 2 * currentD;
    k.push(Number(currentK.toFixed(2)));
    d.push(Number(currentD.toFixed(2)));
    j.push(Number(currentJ.toFixed(2)));
  });

  return { k, d, j };
}
