import { type Layer } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import { HALF_WORLD } from "../config";
import type { Neighbor, NodeMeta } from "../data";
import type { PreviewNode } from "../nodes";
import type { PathNode, PathResult } from "../path";

const SAFETY_CAP = 1000;
const ARC_SEGMENTS = 25;
const ARC_CURVE = 0.15;
const PATH_SEGMENTS = 25;

export type Seg = {
  source: [number, number];
  target: [number, number];
  color: [number, number, number, number];
};

const topByRadius = (ns: Neighbor[], cap: number) =>
  ns.length > cap ? [...ns].sort((a, b) => b[2] - a[2]).slice(0, cap) : ns;

export function buildHighlightLayers(args: {
  focus: NodeMeta | null;
  neighbors: { out: Neighbor[]; in: Neighbor[] };
  preview: PreviewNode | null;
  routeShown: boolean;
  colorOf: (cl: number) => [number, number, number];
}): Layer[] {
  const { focus, neighbors, preview, routeShown, colorOf } = args;
  // focus.r <= 0 only for an id-only path stub mid-hydration — skip until the
  // route (or backfilled geometry) lands so nothing draws at world center.
  if (!focus || focus.r <= 0 || routeShown) return [];
  const cx = focus.x + HALF_WORLD;
  const cy = focus.y + HALF_WORLD;
  const r = focus.r;

  // Sample a quadratic Bezier from the node's rim to a neighbor, emitting
  // colored segments (deck's ArcLayer bows along z, invisible top-down).
  const arc = (
    nx: number,
    ny: number,
    tr: number,
    colorAt: (ct: number) => [number, number, number, number],
    into: Seg[],
  ) => {
    const tx = nx + HALF_WORLD;
    const ty = ny + HALF_WORLD;
    // Build the curve between the two node *centers*, not from the source rim.
    // The rim hit lies on the straight center-line, but the curve bows away
    // from it immediately, so a rim-anchored edge looks like it leaves the node
    // off to one side. Anchoring at the centers and letting each opaque disc
    // mask its interior makes the visible arc cross both rims along its own
    // tangent — every edge reads as emanating (and arriving) head-on.
    const ex = tx;
    const ey = ty;
    const chord = Math.hypot(ex - cx, ey - cy) || 1;
    const px = -(ey - cy) / chord;
    const py = (ex - cx) / chord;
    const ctrlX = (cx + ex) / 2 + px * chord * ARC_CURVE;
    const ctrlY = (cy + ey) / 2 + py * chord * ARC_CURVE;
    const r2 = r * r;
    const tr2 = tr * tr;
    let prev: [number, number] = [cx, cy];
    for (let i = 1; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const mt = 1 - t;
      const bx = mt * mt * cx + 2 * mt * t * ctrlX + t * t * ex;
      const by = mt * mt * cy + 2 * mt * t * ctrlY + t * t * ey;
      // Skip the leading run buried under the source disc; resume once the
      // curve clears the rim so segments (and their gradient) aren't wasted
      // under the mask.
      if ((bx - cx) * (bx - cx) + (by - cy) * (by - cy) <= r2) {
        prev = [bx, by];
        continue;
      }
      into.push({
        source: prev,
        target: [bx, by],
        color: colorAt(t - 0.5 / ARC_SEGMENTS),
      });
      prev = [bx, by];
      // Once tucked under the destination disc, stop — the masked remainder
      // would only bleed through faintly on translucent nodes.
      if ((bx - tx) * (bx - tx) + (by - ty) * (by - ty) <= tr2) break;
    }
  };

  const src = colorOf(focus.cl);
  const outNb = topByRadius(neighbors.out, SAFETY_CAP);
  const inNb = topByRadius(neighbors.in, SAFETY_CAP);

  const outSegs: Seg[] = [];
  for (const n of outNb) {
    const dst = colorOf(n[3]);
    arc(
      n[0],
      n[1],
      n[2],
      (ct) => [
        Math.round(src[0] + (dst[0] - src[0]) * ct),
        Math.round(src[1] + (dst[1] - src[1]) * ct),
        Math.round(src[2] + (dst[2] - src[2]) * ct),
        200,
      ],
      outSegs,
    );
  }

  const inSegs: Seg[] = [];
  for (const n of inNb) {
    const c = colorOf(n[3]);
    arc(n[0], n[1], n[2], () => [c[0], c[1], c[2], 90], inSegs);
  }

  const dim = preview ? 0.15 : 1;
  const layers: Layer[] = [
    new LineLayer({
      id: "in-edges",
      data: inSegs,
      opacity: preview ? 0.08 : 0.55,
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getColor: (d) => d.color,
      getWidth: 1,
      widthUnits: "pixels",
    }),
    new LineLayer({
      id: "out-edges",
      data: outSegs,
      opacity: dim,
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getColor: (d) => d.color,
      getWidth: 1.5,
      widthUnits: "pixels",
    }),
  ];

  let previewTarget: Layer | null = null;
  if (preview) {
    const dst = colorOf(preview.cl);
    const segs: Seg[] = [];
    arc(
      preview.x,
      preview.y,
      preview.r,
      (ct) => [
        Math.round(src[0] + (dst[0] - src[0]) * ct),
        Math.round(src[1] + (dst[1] - src[1]) * ct),
        Math.round(src[2] + (dst[2] - src[2]) * ct),
        255,
      ],
      segs,
    );
    layers.push(
      new LineLayer({
        id: "preview-arc",
        data: segs,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: (d) => d.color,
        getWidth: 2.5,
        widthUnits: "pixels",
      }),
    );
    previewTarget = new ScatterplotLayer({
      id: "preview-target",
      data: [preview],
      getPosition: [preview.x + HALF_WORLD, preview.y + HALF_WORLD],
      getRadius: preview.r,
      radiusUnits: "common",
      filled: true,
      getFillColor: [255, 255, 255, 235],
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      lineWidthUnits: "pixels",
      getLineWidth: 1.5,
    });
  }

  layers.push(
    new ScatterplotLayer<Neighbor>({
      id: "nb-in",
      data: inNb,
      opacity: preview ? 0.3 : 1,
      getPosition: (d) => [d[0] + HALF_WORLD, d[1] + HALF_WORLD],
      getRadius: (d) => d[2],
      radiusUnits: "common",
      filled: true,
      getFillColor: (d) => [...colorOf(d[3]), 130],
    }),
    new ScatterplotLayer<Neighbor>({
      id: "nb-out",
      data: outNb,
      opacity: preview ? 0.3 : 1,
      getPosition: (d) => [d[0] + HALF_WORLD, d[1] + HALF_WORLD],
      getRadius: (d) => d[2],
      radiusUnits: "common",
      filled: true,
      getFillColor: (d) => [...colorOf(d[3]), 235],
    }),
    new ScatterplotLayer({
      id: "focus-outline",
      data: [focus],
      getPosition: [cx, cy],
      getRadius: focus.r,
      radiusUnits: "common",
      filled: true,
      getFillColor: [...colorOf(focus.cl), 255],
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      lineWidthUnits: "pixels",
      getLineWidth: 2,
    }),
  );

  if (previewTarget) layers.push(previewTarget);
  return layers;
}

export function buildHoverLayers(args: {
  hovered: NodeMeta | null;
  selectedId: number | undefined;
  pathMode: boolean;
  colorOf: (cl: number) => [number, number, number];
}): Layer[] {
  const { hovered, selectedId, pathMode, colorOf } = args;
  if (!hovered || (!pathMode && hovered.id === selectedId)) return [];
  const c = colorOf(hovered.cl);
  return [
    new ScatterplotLayer({
      id: "hover-halo",
      data: [hovered],
      getPosition: [hovered.x + HALF_WORLD, hovered.y + HALF_WORLD],
      getRadius: hovered.r * 1.5,
      radiusUnits: "common",
      filled: false,
      stroked: true,
      getLineColor: [c[0], c[1], c[2], 170],
      lineWidthUnits: "pixels",
      getLineWidth: 1.25,
    }),
  ];
}

export function buildPathSegments(
  pathResult: PathResult | null,
  colorOf: (cl: number) => [number, number, number],
): Seg[] {
  if (!pathResult || !pathResult.found || pathResult.path.length === 0)
    return [];
  const nodes = pathResult.path;
  const segs: Seg[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const ax = a.x + HALF_WORLD;
    const ay = a.y + HALF_WORLD;
    const bx = b.x + HALF_WORLD;
    const by = b.y + HALF_WORLD;
    const ca = colorOf(a.cl);
    const cb = colorOf(b.cl);
    let prev: [number, number] = [ax, ay];
    for (let j = 1; j <= PATH_SEGMENTS; j++) {
      const t = j / PATH_SEGMENTS;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const ct = t - 0.5 / PATH_SEGMENTS;
      segs.push({
        source: prev,
        target: [x, y],
        color: [
          Math.round(ca[0] + (cb[0] - ca[0]) * ct),
          Math.round(ca[1] + (cb[1] - ca[1]) * ct),
          Math.round(ca[2] + (cb[2] - ca[2]) * ct),
          235,
        ],
      });
      prev = [x, y];
    }
  }
  return segs;
}

export function buildPathLayers(args: {
  pathResult: PathResult | null;
  pathSegs: Seg[];
  pathOpacity: number;
  hoverId: number | undefined;
  activeId: number | undefined;
  colorOf: (cl: number) => [number, number, number];
}): Layer[] {
  const { pathResult, pathSegs, pathOpacity, hoverId, activeId, colorOf } =
    args;
  if (
    !pathResult ||
    !pathResult.found ||
    pathResult.path.length === 0 ||
    pathSegs.length === 0
  ) {
    return [];
  }
  const nodes = pathResult.path;
  const firstId = nodes[0].id;
  const lastId = nodes[nodes.length - 1].id;
  return [
    new LineLayer({
      id: "path-glow",
      data: pathSegs,
      opacity: pathOpacity * 0.55,
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getColor: (d) => [d.color[0], d.color[1], d.color[2], 70],
      getWidth: 9,
      widthUnits: "pixels",
    }),
    new LineLayer({
      id: "path-line",
      data: pathSegs,
      opacity: pathOpacity,
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getColor: (d) => d.color,
      getWidth: 2.5,
      widthUnits: "pixels",
    }),
    new ScatterplotLayer<PathNode>({
      id: "path-nodes",
      data: nodes,
      opacity: pathOpacity,
      getPosition: (d) => [d.x + HALF_WORLD, d.y + HALF_WORLD],
      getRadius: (d) => d.r,
      radiusUnits: "common",
      filled: true,
      getFillColor: (d) => [...colorOf(d.cl), 255],
      stroked: true,
      getLineColor: (d) =>
        d.id === activeId || d.id === hoverId
          ? [255, 255, 255, 255]
          : [255, 255, 255, 220],
      lineWidthUnits: "pixels",
      getLineWidth: (d) => {
        if (d.id === activeId) return 3.2;
        if (d.id === hoverId) return 2.8;
        return d.id === firstId || d.id === lastId ? 2.2 : 1.5;
      },
      updateTriggers: {
        getLineColor: [activeId, hoverId],
        getLineWidth: [activeId, hoverId],
      },
    }),
  ];
}
