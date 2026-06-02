import { useEffect, useState } from "react";
import { PATH_URL } from "./config";
import { BoundedCache } from "./api/cache";
import { fetchJson } from "./api/fetchJson";

// One step in a shortest path. Same geometry fields as a tile/search record
// (graph-centered coords + cluster) so the frontend can draw the path without
// any follow-up fetches — /path returns the per-step records, not just ids.
export type PathNode = {
  id: number;
  t: string;
  x: number;
  y: number;
  r: number;
  cl: number;
};

export type PathResult =
  | { found: true; length: number; path: PathNode[] }
  | { found: false; length?: number; path?: never };

const cache = new BoundedCache<string, PathResult>(50);

async function fetchPath(
  from: number,
  to: number,
  signal: AbortSignal,
): Promise<PathResult> {
  const key = `${from},${to}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${PATH_URL}?from=${from}&to=${to}`;
  const result = await fetchJson<PathResult>(url, { signal, label: "path" });

  cache.set(key, result);
  return result;
}

// Shortest path between two articles. Deterministic, so identical (from, to)
// queries cache forever; same-node shortcuts to an empty path without a fetch.
// `error` flags a network/server failure (distinct from a found:false "no
// route"); `reload` retries after one. An aborted request never sets error.
export function useFindPath(
  fromId: number | null,
  toId: number | null,
): {
  result: PathResult | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
} {
  const [result, setResult] = useState<PathResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    setError(false);
    if (fromId == null || toId == null) {
      setResult(null);
      setLoading(false);
      return;
    }
    if (fromId === toId) {
      setResult({ found: true, length: 0, path: [] });
      setLoading(false);
      return;
    }

    const cached = cache.get(`${fromId},${toId}`);
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }

    setResult(null);
    setLoading(true);
    const ctrl = new AbortController();
    fetchPath(fromId, toId, ctrl.signal)
      .then((r) => {
        setResult(r);
        setLoading(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setResult(null);
        setError(true);
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [fromId, toId, nonce]);

  return { result, loading, error, reload };
}
