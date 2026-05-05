export interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export function getFreshCacheEntryValue<T>(
  entry: CacheEntry<T> | undefined,
  now = Date.now(),
): T | undefined {
  if (!entry || entry.expiresAt <= now) {
    return undefined;
  }

  return entry.value;
}

export function hasScannerWindowShortage(
  pendingCount: number,
  windowCount: number,
  randomSampleSize: number,
) {
  const requestedSampleCount = Math.min(Math.max(0, randomSampleSize), Math.max(0, windowCount));
  return Math.max(0, pendingCount) < requestedSampleCount;
}
