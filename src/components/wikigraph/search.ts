import { useEffect, useState } from "react";
import { SEARCH_URL } from "./config";
import { BoundedCache } from "./api/cache";
import { fetchJson } from "./api/fetchJson";

// A fuzzy-search hit over article titles: id + title + position + radius +
// cluster. Coords are graph-centered (like NodeMeta / pages), so they feed
// straight into flyTo.
export type SearchResult = {
  id: number;
  t: string;
  x: number;
  y: number;
  r: number;
  cl: number;
};

const cache = new BoundedCache<string, SearchResult[]>(100);

async function fetchSearch(
  q: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const cached = cache.get(q);
  if (cached) return cached;

  const results = await fetchJson<SearchResult[]>(
    `${SEARCH_URL}${encodeURIComponent(q)}`,
    { signal, label: "search" },
  );

  cache.set(q, results);
  return results;
}

// Debounced, abortable title search. Cached hits resolve instantly; in-flight
// requests are aborted when the query changes so stale responses can't win.
// `error` is true only for a genuine failure (never for an aborted request).
export function useSearch(query: string): {
  results: SearchResult[];
  loading: boolean;
  error: boolean;
} {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const q = query.trim();
    setError(false);
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    const cached = cache.get(q);
    if (cached) {
      setResults(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetchSearch(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setLoading(false);
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setResults([]);
          setError(true);
          setLoading(false);
        });
    }, 150);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  return { results, loading, error };
}
