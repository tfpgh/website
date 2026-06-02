import type { NodeMeta, Neighbor } from "./data";
import type { PageNeighbor } from "./pages";
import type { PathNode } from "./path";
import type { SearchResult } from "./search";

export type PreviewNode = Pick<NodeMeta, "x" | "y" | "r" | "cl">;

export function makeNodeStub(id: number): NodeMeta {
  return { id, t: "", x: 0, y: 0, r: 0, cl: 0, pr: 0 };
}

export function nodeFromSearch(r: SearchResult): NodeMeta {
  return { id: r.id, t: r.t, x: r.x, y: r.y, r: r.r, cl: r.cl, pr: 0 };
}

export function nodeFromPageNeighbor(n: PageNeighbor): NodeMeta {
  return { id: n[0], t: n[1], x: n[2], y: n[3], r: n[4], cl: n[5], pr: 0 };
}

export function neighborFromPageNeighbor(n: PageNeighbor): Neighbor {
  return [n[2], n[3], n[4], n[5]];
}

export function nodeFromPathNode(n: PathNode): NodeMeta {
  return { id: n.id, t: n.t, x: n.x, y: n.y, r: n.r, cl: n.cl, pr: 0 };
}
