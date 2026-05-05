import { describe, expect, it } from "vitest";
import { getFreshCacheEntryValue, hasScannerWindowShortage } from "./scanner-utils.js";

describe("scanner utils", () => {
  it("ignores expired recommendation cache entries", () => {
    expect(
      getFreshCacheEntryValue({ expiresAt: 999, value: "stale" }, 1_000),
    ).toBeUndefined();
    expect(
      getFreshCacheEntryValue({ expiresAt: 1_001, value: "fresh" }, 1_000),
    ).toBe("fresh");
  });

  it("reports current-window candidate shortage before sampling", () => {
    expect(hasScannerWindowShortage(2, 10, 5)).toBe(true);
    expect(hasScannerWindowShortage(5, 10, 5)).toBe(false);
    expect(hasScannerWindowShortage(3, 3, 5)).toBe(false);
  });
});
