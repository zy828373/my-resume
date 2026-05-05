import { useEffect, useState } from "react";
import type { ApiResponse, SearchSuggestion } from "../types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.ok) throw new Error(json.error || "请求失败");
  return json.data as T;
}

export interface UseSearchSuggestionsOptions {
  query: string;
  configured: boolean;
  /** Minimum query length before fetching. Default 2. */
  minLength?: number;
  /** Debounce in ms. Default 220. */
  debounceMs?: number;
}

/**
 * Debounced search. Clears results if query is empty or config is missing.
 */
export function useSearchSuggestions({
  query,
  configured,
  minLength = 2,
  debounceMs = 220,
}: UseSearchSuggestionsOptions): SearchSuggestion[] {
  const [results, setResults] = useState<SearchSuggestion[]>([]);

  useEffect(() => {
    if (!configured || query.length < minLength) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      void requestJson<SearchSuggestion[]>(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((next) => {
          if (active) setResults(next);
        })
        .catch(() => {
          if (active) setResults([]);
        });
    }, debounceMs);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, configured, minLength, debounceMs]);

  return results;
}
