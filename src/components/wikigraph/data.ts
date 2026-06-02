import { META_JSON_URL } from "./config";
import { fetchJson } from "./api/fetchJson";

// Neighbor tuple as packed in node_meta tiles: position, radius, cluster id.
// Color is resolved from the cluster id via meta.json (see buildClusterMap).
export type Neighbor = [x: number, y: number, r: number, cl: number];

// One node record from a node_meta tile: geometry, identity, and the scalars
// the hover card and composition bars need. Adjacency is deliberately NOT
// included — that kept tiles ~10x larger; the edge fan and link lists come from
// the per-page detail endpoint instead (see PageDetail). `no`/`ni` are the true
// out/in degrees; `pr` is a 1-based pagerank rank (1 = most central). (no/ni/ob/
// ib optional so a synthesized navigation target can omit them and fall back to
// fetched detail.)
export type NodeMeta = {
  id: number;
  t: string;
  x: number;
  y: number;
  r: number;
  cl: number;
  pr: number;
  no?: number;
  ni?: number;
  // Exact per-direction cluster histograms (top-N [clusterId, count]) for the
  // composition bars. When absent, the frontend approximates from fetched detail.
  ob?: [number, number][];
  ib?: [number, number][];
};

export type Cluster = {
  id: number;
  color: [number, number, number];
  count: number;
  name: string;
  // Graph-centered centroid (PageRank-weighted center of mass) — drives the
  // zoomed-out region labels.
  cx: number;
  cy: number;
};

export type Meta = {
  total_pages: number;
  total_links: number;
  clusters: Cluster[];
};

// Used for node/edge color before meta.json loads (or for unknown clusters).
export const FALLBACK_COLOR: [number, number, number] = [231, 234, 223];

export const wikipediaURL = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

export const rgb = ([r, g, b]: [number, number, number]) =>
  `rgb(${r} ${g} ${b})`;

export async function fetchMeta(): Promise<Meta> {
  return fetchJson<Meta>(META_JSON_URL, { label: "meta.json" });
}

export function buildClusterMap(meta: Meta): Map<number, Cluster> {
  return new Map(meta.clusters.map((c) => [c.id, c]));
}
