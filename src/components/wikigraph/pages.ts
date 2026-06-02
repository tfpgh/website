import { useEffect, useState } from "react";
import { PAGES_URL } from "./config";
import { BoundedCache } from "./api/cache";
import { fetchJson } from "./api/fetchJson";

// A neighbor row from pages.pmtiles: id + title + position + radius + cluster.
export type PageNeighbor = [
  id: number,
  t: string,
  x: number,
  y: number,
  r: number,
  cl: number,
];

export type PageDetail = {
  id: number;
  t: string;
  // The page's own position/radius — served by the endpoint but historically
  // undeclared. Lets a cold deep link (?n=<id>) frame the node from one fetch.
  x: number;
  y: number;
  r: number;
  cl: number;
  pr: number;
  no?: number;
  ni?: number;
  ob?: [number, number][];
  ib?: [number, number][];
  out: PageNeighbor[];
  in: PageNeighbor[];
};

// Hilbert d2xy, matching PMTiles' tileid_to_zxy. A page id maps to a tileid of
// base(z) + id, where base(z) is the count of all tiles below the packing zoom;
// since that base equals the scan accumulator at level z, the in-level position
// is exactly the id, so we only need the d2xy step.
function idOnLevel(z: number, pos: number): [number, number] {
  const n = 2 ** z;
  let t = pos;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t / 2);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

// Smallest z with 4^z >= totalPages — the packing zoom from build_page_archive.
export function packZoom(totalPages: number): number {
  return Math.max(1, Math.ceil(Math.log2(totalPages) / 2));
}

export function pageZXY(
  id: number,
  totalPages: number,
): [number, number, number] {
  const z = packZoom(totalPages);
  const [x, y] = idOnLevel(z, id);
  return [z, x, y];
}

const cache = new BoundedCache<number, PageDetail>(300);
// In-flight requests, so an eager hover-prefetch and the subsequent click share
// one fetch instead of racing two. Resolved results graduate to `cache`.
const pending = new Map<number, Promise<PageDetail>>();

export function fetchPage(
  id: number,
  totalPages: number,
  signal?: AbortSignal,
): Promise<PageDetail> {
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);
  const inflight = signal ? null : pending.get(id);
  if (inflight) return inflight;

  const [z, x, y] = pageZXY(id, totalPages);
  const url = PAGES_URL.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  const p = (async () => {
    try {
      const detail = await fetchJson<PageDetail>(url, {
        signal,
        label: `page ${id}:`,
      });
      cache.set(id, detail);
      return detail;
    } finally {
      if (!signal) pending.delete(id);
    }
  })();
  if (!signal) pending.set(id, p);
  return p;
}

// Fetch the detail record for the focused node, debounced so sweeping the
// cursor across nodes doesn't fire a request per node. Cached hits are instant.
export function usePageDetail(
  id: number | undefined,
  totalPages: number | undefined,
): { detail: PageDetail | null; loading: boolean; error: boolean } {
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    if (id == null || !totalPages) {
      setDetail(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(id);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return;
    }

    setDetail(null);
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetchPage(id, totalPages, ctrl.signal)
        .then((d) => {
          setDetail(d);
          setLoading(false);
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setDetail(null);
          setError(true);
          setLoading(false);
        });
    }, 180);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [id, totalPages]);

  return { detail, loading, error };
}
