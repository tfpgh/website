// A shareable view parsed from the query string. Path links win over node links,
// and node links win over bare camera links. Coords are graph-centered (matching
// the API), converted to world space (+HALF_WORLD) by the caller.
export type UrlState =
  | { kind: "node"; id: number }
  | { kind: "path"; from: number; to: number }
  | { kind: "camera"; x: number; y: number; z: number }
  | { kind: "none" };

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseUrl(search: string): UrlState {
  const p = new URLSearchParams(search);
  const from = num(p.get("from"));
  const to = num(p.get("to"));
  if (from != null && to != null) return { kind: "path", from, to };
  // A lone ?from= can be produced by hand, but the app only serializes complete
  // paths. Treat it as the source article instead of opening a title-less stub.
  if (from != null) return { kind: "node", id: from };
  const n = num(p.get("n"));
  if (n != null) return { kind: "node", id: n };
  const x = num(p.get("x"));
  const y = num(p.get("y"));
  const z = num(p.get("z"));
  if (x != null && y != null && z != null) return { kind: "camera", x, y, z };
  return { kind: "none" };
}
