import { OrthographicView, type OrthographicViewState } from "@deck.gl/core";
import { HALF_WORLD, MAX_Z, ZOOM_OFFSET } from "./config";
import type { UrlState } from "./url";

export const view = new OrthographicView({ id: "ortho" });

export const MIN_ZOOM = -ZOOM_OFFSET;
export const MAX_ZOOM = MAX_Z - ZOOM_OFFSET;

// The resting "home" zoom for a cold open (no deep link). Sits a touch above
// the floor so the whole field reads as a map rather than a wall of dots.
export const HOME_ZOOM = MIN_ZOOM + 1;

export const INITIAL_VIEW_STATE: OrthographicViewState = {
  target: [HALF_WORLD, HALF_WORLD, 0],
  zoom: HOME_ZOOM,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
};

export const SIDEBAR_WIDTH = 380;
export const UI_GUTTER = 18;
export const COMPACT_BREAKPOINT = 820;
// The mode toggle (~34px) sits above the search/path bar (42px), so the top
// chrome is taller than the bar alone; framed nodes stay clear of all of it.
export const TOP_BAR_HEIGHT = 88;
export const TOP_BAR_GAP = 12;
export const COMPACT_TOP_EXPLORE = 112;
export const COMPACT_TOP_PATH = 154;
export const COMPACT_SHEET_FRACTION = 0.44;
export const COMPACT_PATH_SHEET_FRACTION = 0.36;
export const NODE_FRAME_FRACTION = 0.085;
export const PATH_FIT_PADDING = 96;
export const PATH_OVERVIEW_MAX_ZOOM = 2.25;
export const MIN_FRAME_R = 2;

export type ViewportInsetOptions = {
  collapsed: boolean;
  pathMode?: boolean;
  compact?: boolean;
};

export type ViewportInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const viewportMin = () =>
  typeof window !== "undefined"
    ? Math.min(window.innerWidth, window.innerHeight)
    : 800;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const compactLayout = () =>
  typeof window !== "undefined" &&
  (window.innerWidth <= COMPACT_BREAKPOINT ||
    window.matchMedia("(pointer: coarse)").matches);

export const zoomForRadius = (r: number, frame = viewportMin()) =>
  clamp(
    Math.log2((frame * NODE_FRAME_FRACTION) / Math.max(r, MIN_FRAME_R)),
    MIN_ZOOM,
    MAX_ZOOM,
  );

export const effectiveZoom = (vs: OrthographicViewState) => {
  if (typeof vs.zoomX === "number" && typeof vs.zoomY === "number") {
    return Math.min(vs.zoomX, vs.zoomY);
  }
  if (typeof vs.zoomX === "number") return vs.zoomX;
  if (typeof vs.zoomY === "number") return vs.zoomY;
  if (Array.isArray(vs.zoom)) return Math.min(vs.zoom[0], vs.zoom[1]);
  return Number(vs.zoom ?? 0);
};

export const normalizeViewState = (
  vs: OrthographicViewState,
): OrthographicViewState => {
  const target = (vs.target ?? INITIAL_VIEW_STATE.target) as number[];
  return {
    target: [target[0] ?? HALF_WORLD, target[1] ?? HALF_WORLD, target[2] ?? 0],
    zoom: clamp(effectiveZoom(vs), MIN_ZOOM, MAX_ZOOM),
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  };
};

export const targetForCenteredWorld = (
  worldX: number,
  worldY: number,
  zoom: number,
  options: ViewportInsetOptions,
): [number, number, number] => {
  const insets = viewportInsets(options);
  const scale = Math.pow(2, zoom);
  return [
    worldX + (insets.right - insets.left) / 2 / scale,
    worldY + (insets.bottom - insets.top) / 2 / scale,
    0,
  ];
};

export function initialViewStateForUrl(
  initial: UrlState,
  options: ViewportInsetOptions = { collapsed: false },
): OrthographicViewState {
  const zoom = initial.kind === "none" ? HOME_ZOOM : MIN_ZOOM;
  return {
    target: targetForCenteredWorld(HALF_WORLD, HALF_WORLD, zoom, options),
    zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  };
}

export const viewportInsets = ({
  collapsed,
  pathMode = false,
  compact = compactLayout(),
}: ViewportInsetOptions) => {
  if (!compact) {
    return {
      left: 0,
      right: collapsed ? 0 : SIDEBAR_WIDTH + UI_GUTTER,
      top: collapsed ? 0 : UI_GUTTER + TOP_BAR_HEIGHT + TOP_BAR_GAP,
      bottom: 0,
    };
  }

  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const top = pathMode ? COMPACT_TOP_PATH : COMPACT_TOP_EXPLORE;
  const sheetFraction = pathMode
    ? COMPACT_PATH_SHEET_FRACTION
    : COMPACT_SHEET_FRACTION;
  const sheet = collapsed
    ? 0
    : Math.min(h * sheetFraction, Math.max(220, h - top - 28));

  return {
    left: 0,
    right: 0,
    top,
    bottom: collapsed ? 0 : sheet + 10,
  };
};

export const visibleFrameMin = (options: ViewportInsetOptions) => {
  if (typeof window === "undefined") return viewportMin();
  const insets = viewportInsets(options);
  return Math.min(
    Math.max(160, window.innerWidth - insets.left - insets.right),
    Math.max(160, window.innerHeight - insets.top - insets.bottom),
  );
};
