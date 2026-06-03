import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { type OrthographicViewState, type PickingInfo } from "@deck.gl/core";
import { animate, useMotionValueEvent, useMotionValue } from "motion/react";
import Sidebar from "./Sidebar";
import SearchBar from "./SearchBar";
import PathBar from "./PathBar";
import tooltipStyles from "./HoverTooltip.module.css";
import { type SearchResult } from "./search";
import { type PathNode, useFindPath } from "./path";
import {
  type Cluster,
  type Meta,
  type Neighbor,
  type NodeMeta,
  buildClusterMap,
  fetchMeta,
} from "./data";
import { type PageNeighbor, fetchPage, usePageDetail } from "./pages";
import { useMapTiles } from "./hooks/useMapTiles";
import {
  buildHighlightLayers,
  buildHoverLayers,
  buildPathLayers,
  buildPathSegments,
} from "./layers/builders";
import { colorForCluster } from "./clusters";
import {
  makeNodeStub,
  neighborFromPageNeighbor,
  nodeFromPageNeighbor,
  nodeFromPathNode,
  nodeFromSearch,
  type PreviewNode,
} from "./nodes";
import { HALF_WORLD } from "./config";
import {
  MAX_ZOOM,
  MIN_FRAME_R,
  MIN_ZOOM,
  PATH_FIT_PADDING,
  PATH_OVERVIEW_MAX_ZOOM,
  clamp,
  compactLayout,
  initialViewStateForUrl,
  normalizeViewState,
  prefersReducedMotion,
  targetForCenteredWorld,
  view,
  viewportInsets,
  visibleFrameMin,
  zoomForRadius,
} from "./layout";
import { parseUrl } from "./url";
import statusStyles from "./MapStatus.module.css";
import toggleStyles from "./ModeToggle.module.css";
import sidebarStyles from "./Sidebar.module.css";
const MAP_DIM = 0.2;

const fmt = (n: number) => n.toLocaleString("en-US");

export default function WikiGraph() {
  const [initial] = useState(() =>
    parseUrl(typeof window !== "undefined" ? window.location.search : ""),
  );
  const initialCompact = compactLayout();
  const initialCollapsed = initialCompact && initial.kind === "none";
  const [compact, setCompact] = useState(initialCompact);
  const compactRef = useRef(compact);
  const [collapsed, rawSetCollapsed] = useState(initialCollapsed);
  const collapsedRef = useRef(collapsed);
  // A deep link opens fully zoomed out and flies in to its target (node frame /
  // path fit / restored camera). Snapping straight to a deep zoom would pop the
  // instant its tiles finally rasterize; the flight crosses zoom levels so deck
  // refines tiles coarse→fine on the way and the arrival is already sharp.
  const [viewState, setViewState] = useState<OrthographicViewState>(() =>
    initialViewStateForUrl(initial, {
      collapsed: initialCollapsed,
      pathMode: initial.kind === "path",
      compact: initialCompact,
    }),
  );
  const viewStateRef = useRef(viewState);
  const [hovered, setHovered] = useState<NodeMeta | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<NodeMeta | null>(null);
  const [history, setHistory] = useState<NodeMeta[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  // A neighbor hovered in the sidebar — blooms its edge, dims the rest.
  const [preview, setPreview] = useState<PreviewNode | null>(null);
  // Path-finding mode. Entered from the top-bar segmented control (cold, both
  // ends empty), the sidebar's "find path" button (origin prefilled), an example
  // chip, or a ?from=&to= deep link. The search bar morphs into a from→to
  // selector, the sidebar shows the step list, and the map draws the route.
  const [pathOpen, setPathOpen] = useState(initial.kind === "path");
  const [pathFrom, setPathFrom] = useState<NodeMeta | null>(null);
  const [pathTo, setPathTo] = useState<NodeMeta | null>(null);
  const [pathHoverStep, setPathHoverStep] = useState<PathNode | null>(null);
  // Which stop on the path is being inspected (drives the sidebar + map ring).
  const [pathActiveId, setPathActiveId] = useState<number | null>(null);
  const framedPathKeyRef = useRef<string | null>(null);
  const flyRef = useRef<{ stop: () => void } | null>(null);
  // Deep-link plumbing: gate URL writes until the incoming params are consumed,
  // and only serialize the bare camera once the user has actually positioned it
  // (a camera deep link counts as already positioned).
  const hydratedRef = useRef(false);
  const movedRef = useRef(initial.kind === "camera");
  const pathMode = pathOpen;

  compactRef.current = compact;
  collapsedRef.current = collapsed;

  const setPanelCollapsed = (next: boolean) => {
    collapsedRef.current = next;
    rawSetCollapsed(next);
  };

  useEffect(() => {
    const update = () => {
      const next = compactLayout();
      compactRef.current = next;
      setCompact(next);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Map load / connectivity status ──────────────────────────────────────────
  const [metaError, setMetaError] = useState(false);
  const [metaReloadKey, setMetaReloadKey] = useState(0);

  const setCamera = (
    next:
      | OrthographicViewState
      | ((current: OrthographicViewState) => OrthographicViewState),
  ) => {
    setViewState((current) => {
      const raw = typeof next === "function" ? next(current) : next;
      const normalized = normalizeViewState(raw);
      viewStateRef.current = normalized;
      return normalized;
    });
  };

  useEffect(() => {
    if (movedRef.current || initial.kind !== "none" || selected || pathMode)
      return;
    setCamera(
      initialViewStateForUrl(initial, {
        collapsed,
        pathMode,
        compact,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, collapsed, pathMode, selected]);

  useEffect(() => {
    let cancelled = false;
    setMetaError(false);
    fetchMeta()
      .then((m) => !cancelled && setMeta(m))
      .catch(() => !cancelled && setMetaError(true));
    return () => {
      cancelled = true;
    };
  }, [metaReloadKey]);

  // Eagerly warm the page cache on hover so a click opens instantly — the
  // sidebar detail and edge fan are usually already in hand by select time.
  // A tiny debounce keeps a fast sweep from fetching every node it crosses;
  // fetchPage de-dupes against the click's own request.
  useEffect(() => {
    const id = hovered?.id;
    if (id == null || !meta) return;
    const t = window.setTimeout(() => {
      fetchPage(id, meta.total_pages).catch(() => {});
    }, 60);
    return () => window.clearTimeout(t);
  }, [hovered?.id, meta]);

  const clusters = useMemo<Map<number, Cluster> | null>(
    () => (meta ? buildClusterMap(meta) : null),
    [meta],
  );
  const colorOf = useCallback(
    (cl: number): [number, number, number] => colorForCluster(clusters, cl),
    [clusters],
  );

  const {
    result: pathResult,
    loading: pathLoading,
    error: pathError,
    reload: pathReload,
  } = useFindPath(pathFrom?.id ?? null, pathTo?.id ?? null);

  // The active stop on the path. Falls back to the destination so a freshly
  // found path opens on its endpoint.
  const pathActiveStep = useMemo<PathNode | null>(() => {
    if (!pathResult?.found || pathResult.path.length === 0) return null;
    const p = pathResult.path;
    return p.find((s) => s.id === pathActiveId) ?? p[p.length - 1];
  }, [pathResult, pathActiveId]);

  // Click/search/path state is committed and owns the sidebar. Hover stays a
  // lightweight map preview so the panel does not jump while exploring.
  // In path mode the focus is the active stop (or the from-node before a path
  // exists), so the sidebar shows that page's normal detail view.
  const focus = useMemo<NodeMeta | null>(() => {
    if (!pathMode) return selected;
    if (pathActiveStep) {
      if (pathFrom && pathActiveStep.id === pathFrom.id) return pathFrom;
      return nodeFromPathNode(pathActiveStep);
    }
    return pathFrom;
  }, [pathMode, pathActiveStep, pathFrom, selected]);

  // Detail powers both the article view and the edge fan. Skip it only once a
  // route is drawn (the fan is hidden then); we still want it for the normal
  // article view and for the origin's fan while picking a path destination.
  const {
    detail,
    loading,
    error: detailError,
  } = usePageDetail(
    pathMode && pathResult?.found && pathResult.path.length > 0
      ? undefined
      : focus?.id,
    meta?.total_pages,
  );

  // Eased map dim, mirrored into state for the bitmap layer's opacity. Dim
  // also when path mode is active so the path stands out the same way a
  // selected node's edges do.
  const shouldDim = focus !== null || pathMode;
  const dimMv = useMotionValue(1);
  const [dimOpacity, setDimOpacity] = useState(1);
  useEffect(() => {
    const controls = animate(dimMv, shouldDim ? MAP_DIM : 1, {
      duration: 0.35,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [shouldDim, dimMv]);
  useMotionValueEvent(dimMv, "change", (v) => setDimOpacity(v));

  const {
    nodeLayer,
    metaLayer,
    hitLayer,
    firstLoad,
    tileError,
    retry: retryTiles,
  } = useMapTiles(dimOpacity);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  // Hold the loading card back briefly so a fast load doesn't flash it.
  const [loadingCardDue, setLoadingCardDue] = useState(false);

  useEffect(() => {
    if (firstLoad) return;
    setLoadTimedOut(false);
    setLoadingCardDue(false);
    const reveal = window.setTimeout(() => setLoadingCardDue(true), 2000);
    const timeout = window.setTimeout(() => setLoadTimedOut(true), 5500);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(timeout);
    };
  }, [firstLoad, metaReloadKey]);

  // Nothing painted yet and the server still isn't answering after a grace
  // period -> a blocking error card. Early tile aborts/refinements are normal.
  const fatal = loadTimedOut && (metaError || tileError) && !firstLoad;
  const initialLoading = !firstLoad && !fatal && loadingCardDue;

  const retry = useCallback(() => {
    setMetaError(false);
    setLoadTimedOut(false);
    setMetaReloadKey((k) => k + 1);
    retryTiles();
  }, [retryTiles]);

  // Path layers fade in once a result is in hand.
  const pathMv = useMotionValue(0);
  const [pathOp, setPathOp] = useState(0);
  useEffect(() => {
    const target = pathResult?.found && pathResult.path.length > 0 ? 1 : 0;
    const controls = animate(pathMv, target, {
      duration: 0.4,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [pathResult, pathMv]);
  useMotionValueEvent(pathMv, "change", (v) => setPathOp(v));

  // Neighbor geometry for the edge fan. Tiles no longer carry adjacency, so this
  // comes entirely from the fetched page detail (warmed on hover, so it's
  // usually already cached by the time a node is selected).
  const neighbors = useMemo<{ out: Neighbor[]; in: Neighbor[] }>(() => {
    if (!focus || !detail || detail.id !== focus.id) return { out: [], in: [] };
    return {
      out: detail.out.map(neighborFromPageNeighbor),
      in: detail.in.map(neighborFromPageNeighbor),
    };
  }, [focus, detail]);

  const routeShown =
    pathMode && !!pathResult?.found && pathResult.path.length > 0;
  const highlightLayers = useMemo(
    () =>
      buildHighlightLayers({
        focus,
        neighbors,
        preview,
        routeShown,
        colorOf,
      }),
    [focus, neighbors, preview, routeShown, colorOf],
  );

  const hoverLayers = useMemo(
    () =>
      buildHoverLayers({
        hovered,
        selectedId: selected?.id,
        pathMode,
        colorOf,
      }),
    [hovered, selected?.id, pathMode, colorOf],
  );

  const pathSegs = useMemo(
    () => buildPathSegments(pathResult, colorOf),
    [pathResult, colorOf],
  );

  const pathLayers = useMemo(
    () =>
      buildPathLayers({
        pathResult,
        pathSegs,
        pathOpacity: pathOp,
        hoverId: pathHoverStep?.id,
        activeId: pathActiveStep?.id,
        colorOf,
      }),
    [
      pathResult,
      pathSegs,
      pathOp,
      pathHoverStep?.id,
      pathActiveStep?.id,
      colorOf,
    ],
  );

  const getViewportInsets = () =>
    viewportInsets({
      collapsed: collapsedRef.current,
      pathMode,
      compact: compactRef.current,
    });
  const getVisibleFrameMin = () =>
    visibleFrameMin({
      collapsed: collapsedRef.current,
      pathMode,
      compact: compactRef.current,
    });

  // Van Wijk & Nuij smooth zooming. The earlier bug was stale zoomX/zoomY in
  // Deck's orthographic state, not the camera path itself; this version starts
  // from normalized state and writes normalized state on every frame.
  const flyToView = (toX: number, toY: number, toZoomRaw: number) => {
    const toZoom = clamp(toZoomRaw, MIN_ZOOM, MAX_ZOOM);
    flyRef.current?.stop();
    const from = normalizeViewState(viewStateRef.current);
    const fromTarget = from.target as number[];
    const fromX = fromTarget[0];
    const fromY = fromTarget[1];
    const fromZoom = Number(from.zoom ?? MIN_ZOOM);
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const zoomDelta = Math.abs(toZoom - fromZoom);

    if (distance < 0.5 && zoomDelta < 0.01) return;
    if (prefersReducedMotion()) {
      setCamera({
        target: [toX, toY, 0],
        zoom: toZoom,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
      flyRef.current = null;
      return;
    }

    const RHO = Math.SQRT2;
    const RHO2 = RHO * RHO;
    const RHO4 = RHO2 * RHO2;
    const vp = getVisibleFrameMin();
    const w0 = vp / Math.pow(2, fromZoom);
    const w1 = vp / Math.pow(2, toZoom);
    let S: number;
    let interpolate: (t: number) => {
      x: number;
      y: number;
      zoom: number;
    };

    if (distance < 1e-6) {
      S = Math.log(w1 / w0) / RHO;
      interpolate = (t) => {
        const w = w0 * Math.exp(RHO * S * t);
        return {
          x: fromX + (toX - fromX) * t,
          y: fromY + (toY - fromY) * t,
          zoom: Math.log2(vp / w),
        };
      };
    } else {
      const b0 =
        (w1 * w1 - w0 * w0 + RHO4 * distance * distance) /
        (2 * w0 * RHO2 * distance);
      const b1 =
        (w1 * w1 - w0 * w0 - RHO4 * distance * distance) /
        (2 * w1 * RHO2 * distance);
      const r0 = Math.asinh(-b0);
      const r1 = Math.asinh(-b1);
      S = (r1 - r0) / RHO;
      const coshR0 = Math.cosh(r0);
      const sinhR0 = Math.sinh(r0);

      interpolate = (t) => {
        const s = t * S;
        const arg = RHO * s + r0;
        const u = (w0 / (RHO2 * distance)) * (coshR0 * Math.tanh(arg) - sinhR0);
        const w = (w0 * coshR0) / Math.cosh(arg);
        return {
          x: fromX + (toX - fromX) * u,
          y: fromY + (toY - fromY) * u,
          zoom: Math.log2(vp / w),
        };
      };
    }

    const duration = clamp(0.85 + Math.abs(S) * 0.32, 0.9, 2.6);

    flyRef.current = animate(0, 1, {
      duration,
      ease: "linear",
      onUpdate: (t) => {
        const p = interpolate(t);
        setCamera({
          target: [p.x, p.y, 0],
          zoom: clamp(p.zoom, MIN_ZOOM, MAX_ZOOM),
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
        });
      },
      onComplete: () => {
        setCamera({
          target: [toX, toY, 0],
          zoom: toZoom,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
        });
        flyRef.current = null;
      },
    });
  };

  const flyToPoint = (x: number, y: number, zoom: number) => {
    const target = targetForCenteredWorld(
      x + HALF_WORLD,
      y + HALF_WORLD,
      zoom,
      {
        collapsed: collapsedRef.current,
        pathMode,
        compact: compactRef.current,
      },
    );
    flyToView(target[0], target[1], zoom);
  };

  const flyTo = (x: number, y: number, r: number) =>
    flyToPoint(x, y, zoomForRadius(r, getVisibleFrameMin()));

  // Fit graph-centered bounds into the currently visible map content rect.
  // UI insets and target shifts are derived from the same numbers so zoom and
  // centering cannot drift apart.
  const flyToBounds = (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    options: { padding?: number; maxZoom?: number } = {},
  ) => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const insets = getViewportInsets();
    const margin = options.padding ?? 64;
    const usableW = Math.max(160, w - insets.left - insets.right - margin * 2);
    const usableH = Math.max(160, h - insets.top - insets.bottom - margin * 2);
    const spanX = Math.max(maxX - minX, MIN_FRAME_R * 2);
    const spanY = Math.max(maxY - minY, MIN_FRAME_R * 2);
    const zoom = clamp(
      Math.log2(Math.min(usableW / spanX, usableH / spanY)),
      MIN_ZOOM,
      options.maxZoom ?? MAX_ZOOM,
    );
    const target = targetForCenteredWorld(
      (minX + maxX) / 2 + HALF_WORLD,
      (minY + maxY) / 2 + HALF_WORLD,
      zoom,
      {
        collapsed: collapsedRef.current,
        pathMode,
        compact: compactRef.current,
      },
    );
    flyToView(target[0], target[1], zoom);
  };

  const framePath = (nodes: PathNode[]) => {
    let minX = nodes[0].x;
    let maxX = nodes[0].x;
    let minY = nodes[0].y;
    let maxY = nodes[0].y;
    let maxR = 0;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
      if (n.r > maxR) maxR = n.r;
    }
    const span = Math.max(maxX - minX, maxY - minY);
    const pad = Math.max(maxR * 2, span * 0.06, MIN_FRAME_R * 8);
    flyToBounds(minX - pad, minY - pad, maxX + pad, maxY + pad, {
      padding: PATH_FIT_PADDING,
      maxZoom: PATH_OVERVIEW_MAX_ZOOM,
    });
  };

  // When a path arrives, open on its destination and frame the whole journey.
  useEffect(() => {
    if (!pathResult || !pathResult.found || pathResult.path.length < 2) return;
    const nodes = pathResult.path;
    const key = nodes.map((n) => n.id).join(",");
    if (framedPathKeyRef.current !== key) {
      framedPathKeyRef.current = key;
      setPathActiveId(nodes[nodes.length - 1].id);
      framePath(nodes);
      // On mobile the panel may still be collapsed (we keep it hidden until
      // there's something useful to show). Open it now for the route list.
      setPanelCollapsed(false);
    }
    // Backfill id-only stubs from deep-link hydration with the real title and
    // geometry now in hand (a stub is identifiable by its empty title).
    const a = nodes[0];
    const b = nodes[nodes.length - 1];
    setPathFrom((f) =>
      f && f.t === "" ? { ...f, t: a.t, x: a.x, y: a.y, r: a.r, cl: a.cl } : f,
    );
    setPathTo((t) =>
      t && t.t === "" ? { ...t, t: b.t, x: b.x, y: b.y, r: b.r, cl: b.cl } : t,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathResult]);

  // ── Deep linking ──────────────────────────────────────────────────────────
  // Synchronous hydration: path stubs (geometry/titles backfill once /path
  // returns), or nothing. The camera case is already seeded into viewState; the
  // node case waits for meta and is handled separately below.
  useEffect(() => {
    if (initial.kind === "camera") {
      // Fly in from the zoomed-out start to the exact shared camera.
      flyToView(initial.x + HALF_WORLD, initial.y + HALF_WORLD, initial.z);
    } else if (initial.kind === "path") {
      setPathFrom(makeNodeStub(initial.from));
      setPathTo(makeNodeStub(initial.to));
      // The path framing (framePath, once /path returns) flies from here.
    }
    if (initial.kind !== "node") hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Node hydration: ?n=<id> → fetch the page (needs meta for its tile address),
  // select it, and snap to its framed view.
  useEffect(() => {
    if (initial.kind !== "node" || hydratedRef.current || !meta) return;
    let cancelled = false;
    fetchPage(initial.id, meta.total_pages)
      .then((d) => {
        if (cancelled) return;
        setSelected({
          id: d.id,
          t: d.t,
          x: d.x,
          y: d.y,
          r: d.r,
          cl: d.cl,
          pr: d.pr,
        });
        flyTo(d.x, d.y, d.r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const clearSharedUrl = () => {
    if (initial.kind === "none" || typeof window === "undefined") return;
    if (!window.location.search) return;
    window.history.replaceState(null, "", window.location.pathname);
  };

  const absoluteUrl = (search: string) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${window.location.pathname}${search}`;
  };

  const copyText = async (text: string) => {
    if (!text || typeof window === "undefined") return false;
    if (!navigator.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  // On touch / compact devices, hand the link to the native share sheet;
  // otherwise (and as a fallback if sharing genuinely fails) copy to clipboard.
  // A dismissed share sheet is a no-op, not a failure.
  const shareOrCopy = async (search: string, title: string) => {
    const url = absoluteUrl(search);
    if (!url || typeof window === "undefined") return false;
    if (compactRef.current && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return true;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return false;
        return copyText(url);
      }
    }
    return copyText(url);
  };

  const copyArticleLink = (node: NodeMeta) =>
    shareOrCopy(`?n=${node.id}`, node.t || "Wikigraph");

  const copyPathLink = () => {
    if (!pathFrom || !pathTo) return Promise.resolve(false);
    return shareOrCopy(
      `?from=${pathFrom.id}&to=${pathTo.id}`,
      `${pathFrom.t} → ${pathTo.t} · Wikigraph`,
    );
  };

  // Serialize the live camera back into a ?x=&y=&z= deep link (graph-centered,
  // matching parseUrl). viewStateRef is always normalized, so zoom is a plain
  // number and the target round-trips straight back through flyToView.
  const copyViewLink = () => {
    const vs = viewStateRef.current;
    const target = (vs.target ?? [HALF_WORLD, HALF_WORLD, 0]) as number[];
    const x = Math.round((target[0] ?? HALF_WORLD) - HALF_WORLD);
    const y = Math.round((target[1] ?? HALF_WORLD) - HALF_WORLD);
    const z = Math.round(Number(vs.zoom ?? MIN_ZOOM) * 100) / 100;
    return shareOrCopy(`?x=${x}&y=${y}&z=${z}`, "Wikigraph");
  };

  const selectPathStep = (s: PathNode) => {
    setPathActiveId(s.id);
    flyTo(s.x, s.y, s.r);
  };

  const fitPath = () => {
    if (pathResult?.found && pathResult.path.length >= 2)
      framePath(pathResult.path);
  };

  const clearPathInspection = () => {
    setPathHoverStep(null);
    setPathActiveId(null);
    framedPathKeyRef.current = null;
  };

  const selectNode = (node: NodeMeta) => {
    if (initial.kind !== "node" || initial.id !== node.id) clearSharedUrl();
    if (selected && selected.id !== node.id)
      setHistory((h) => [...h, selected]);
    setHovered(null);
    setHoverPoint(null);
    setSelected(node);
    setPanelCollapsed(false);
  };

  const navigateTo = (n: PageNeighbor) => {
    const node = nodeFromPageNeighbor(n);
    setPreview(null);
    if (pathMode) {
      setPathOpen(false);
      setPathFrom(null);
      setPathTo(null);
      clearPathInspection();
    }
    selectNode(node);
    flyTo(n[2], n[3], n[4]);
  };

  const selectSearch = (r: SearchResult) => {
    const node = nodeFromSearch(r);
    setPreview(null);
    selectNode(node);
    flyTo(r.x, r.y, r.r);
  };

  const back = () =>
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      clearSharedUrl();
      setHovered(null);
      setHoverPoint(null);
      setSelected(prev);
      flyTo(prev.x, prev.y, prev.r);
      return h.slice(0, -1);
    });

  // Esc / sidebar-close: exit path mode first (it's the overlay state), then
  // fall through to clearing the selection on a second press.
  const close = () => {
    clearSharedUrl();
    if (pathMode) {
      setPathOpen(false);
      setPathFrom(null);
      setPathTo(null);
      clearPathInspection();
      setHovered(null);
      setHoverPoint(null);
      if (compactRef.current && !selected) setPanelCollapsed(true);
      return;
    }
    setHovered(null);
    setHoverPoint(null);
    setSelected(null);
    setHistory([]);
    if (compactRef.current) setPanelCollapsed(true);
  };

  const startPath = () => {
    if (!selected) return;
    clearSharedUrl();
    setPathOpen(true);
    setPathFrom(selected);
    setPathTo(null);
    clearPathInspection();
    setHovered(null);
    setHoverPoint(null);
    setPreview(null);
    // On mobile, keep the panel hidden so the PathBar destination search
    // isn't blocked by the sidebar.
    if (!compactRef.current) setPanelCollapsed(false);
  };

  // Top-bar toggle. Switching modes carries the current node across so you
  // don't lose context. Crucially, the in-progress path is *preserved* while
  // you dip into explore to inspect a stop in full — flipping back to Path
  // resumes the same route instead of starting a fresh one from that node.
  const setMode = (m: "explore" | "path") => {
    if (m === "path" && !pathMode) {
      clearSharedUrl();
      setPathOpen(true);
      // Resume a path that's still loaded; only seed a new one (from the
      // selected article) when there's nothing to resume.
      const resuming = pathFrom !== null;
      if (!resuming) {
        setPathFrom(selected ?? null);
        setPathTo(null);
        clearPathInspection();
      }
      setPreview(null);
      setHovered(null);
      setHoverPoint(null);
      // On mobile, only open the panel if we already have a start node.
      // Otherwise collapse so the PathBar dropdown isn't covered.
      if (resuming || selected) {
        setPanelCollapsed(false);
      } else if (compactRef.current) {
        setPanelCollapsed(true);
      } else {
        setPanelCollapsed(false);
      }
    } else if (m === "explore" && pathMode) {
      // Carry the active path node (or the start) back into explore, but keep
      // pathFrom/pathTo and the inspected step so returning to Path resumes it.
      const carry = pathActiveStep
        ? nodeFromPathNode(pathActiveStep)
        : pathFrom;
      clearSharedUrl();
      setPathOpen(false);
      setHovered(null);
      setHoverPoint(null);
      if (carry) {
        setSelected(carry);
        setHistory([]);
        setPanelCollapsed(false);
      } else {
        if (compactRef.current) setPanelCollapsed(true);
      }
    }
  };

  // Clearing an endpoint pill drops just that end (stays in path mode); the
  // field reverts to a search box. Exiting the mode is the toggle's job.
  const clearPathFrom = () => {
    clearSharedUrl();
    setPathFrom(null);
    clearPathInspection();
  };

  const clearPathTo = () => {
    clearSharedUrl();
    setPathTo(null);
    clearPathInspection();
  };

  // Trace a curated example: seed id-only stubs (titles/geometry backfill from
  // /path, exactly like a deep link) and let the route framing fly us in.
  const tracePath = (fromId: number, toId: number) => {
    clearSharedUrl();
    setSelected(null);
    setPreview(null);
    setHovered(null);
    setHoverPoint(null);
    setPathOpen(true);
    setPathFrom(makeNodeStub(fromId));
    setPathTo(makeNodeStub(toId));
    clearPathInspection();
    setPanelCollapsed(false);
  };

  const flipPath = () => {
    if (!pathFrom || !pathTo) return;
    clearSharedUrl();
    setPathFrom(pathTo);
    setPathTo(pathFrom);
    setSelected(pathTo);
    clearPathInspection();
    setHovered(null);
    setHoverPoint(null);
    setPreview(null);
  };

  const pickPathFrom = (r: SearchResult) => {
    if (pathTo && r.id === pathTo.id) return;
    clearSharedUrl();
    setPathFrom(nodeFromSearch(r));
    clearPathInspection();
    // Re-open the panel so the user sees the path info.
    setPanelCollapsed(false);
  };

  const pickPathTo = (r: SearchResult) => {
    if (pathFrom && r.id === pathFrom.id) return;
    clearSharedUrl();
    setPathTo(nodeFromSearch(r));
    clearPathInspection();
  };

  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const controlsVisible = compact || !collapsed;

  return (
    <>
      <DeckGL
        views={view}
        viewState={viewState}
        controller={{ inertia: 300 }}
        onViewStateChange={({ viewState, interactionState }) => {
          const userInteracted =
            interactionState?.isDragging ||
            interactionState?.isPanning ||
            interactionState?.isZooming;
          if (userInteracted) {
            flyRef.current?.stop();
            flyRef.current = null;
            movedRef.current = true;
            if (initial.kind === "camera") clearSharedUrl();
          }
          setCamera(viewState as OrthographicViewState);
        }}
        layers={[
          nodeLayer,
          metaLayer,
          hitLayer,
          ...hoverLayers,
          ...highlightLayers,
          // A path can be preserved in state while explore is showing; only
          // draw it when path mode is actually active.
          ...(pathMode ? pathLayers : []),
        ]}
        onHover={(info: PickingInfo) => {
          if (compactRef.current) {
            setHovered(null);
            setHoverPoint(null);
            setPathHoverStep(null);
            return;
          }
          const node = info.object as NodeMeta | undefined;
          setHovered(node ?? null);
          setHoverPoint(node ? { x: info.x, y: info.y } : null);
          if (pathMode) {
            // Cheap: only sync the breadcrumb when over a stop on the route.
            // Off-route nodes just get the pointer cursor (they're clickable).
            if (!node) {
              setPathHoverStep(null);
              return;
            }
            setPathHoverStep(
              pathResult?.found
                ? (pathResult.path.find((s) => s.id === node.id) ?? null)
                : null,
            );
            return;
          }
        }}
        onClick={(info: PickingInfo) => {
          const node = info.object as NodeMeta | undefined;
          if (pathMode) {
            if (!node) return;
            // Fill the first empty endpoint, so clicking two articles traces a
            // path with no typing.
            if (!pathFrom) {
              if (!pathTo || node.id !== pathTo.id) {
                clearSharedUrl();
                setPathFrom(node);
                clearPathInspection();
                // Re-open the panel so the user sees the path info.
                setPanelCollapsed(false);
              }
              return;
            }
            if (!pathTo) {
              if (node.id !== pathFrom.id) {
                clearSharedUrl();
                setPathTo(node);
                clearPathInspection();
              }
              return;
            }
            const onPath =
              pathResult?.found &&
              pathResult.path.some((s) => s.id === node.id);
            if (onPath) {
              // A stop already on the route — inspect it, like its breadcrumb.
              setPathActiveId(node.id);
              flyTo(node.x, node.y, node.r);
            } else if (node.id !== pathFrom.id) {
              // Off the route — re-route the destination here.
              clearSharedUrl();
              setPathTo(node);
              clearPathInspection();
            }
            return;
          }
          if (node) selectNode(node);
          else close();
        }}
        getCursor={({ isDragging, isHovering }) =>
          isDragging ? "grabbing" : isHovering ? "pointer" : "default"
        }
        style={{ position: "fixed", inset: "0" }}
      />
      {fatal ? (
        <div className={statusStyles.overlay}>
          <div className={statusStyles.card} role="alert">
            <div className={statusStyles.errTitle}>
              Can&apos;t reach the map
            </div>
            <div className={statusStyles.errText}>
              The map server didn&apos;t respond. Check your connection and try
              again.
            </div>
            <button
              type="button"
              className={statusStyles.retry}
              onClick={retry}
            >
              Retry
            </button>
          </div>
        </div>
      ) : initialLoading ? (
        <div className={statusStyles.overlay} role="status" aria-live="polite">
          <div className={statusStyles.card}>
            <span className={statusStyles.spinner} />
            <div className={statusStyles.label}>Loading the map…</div>
          </div>
        </div>
      ) : null}
      {!compact &&
        hovered &&
        hoverPoint &&
        (() => {
          const left =
            typeof window === "undefined"
              ? hoverPoint.x + 14
              : clamp(hoverPoint.x + 14, 12, window.innerWidth - 332);
          const top =
            typeof window === "undefined"
              ? hoverPoint.y + 14
              : clamp(hoverPoint.y + 14, 12, window.innerHeight - 142);
          const c = colorOf(hovered.cl);
          const outCount = hovered.no ?? 0;
          const inCount = hovered.ni ?? 0;
          return (
            <div
              className={tooltipStyles.tooltip}
              style={{ left, top, ["--cl" as string]: c.join(" ") }}
              aria-hidden="true"
            >
              <div className={tooltipStyles.title}>{hovered.t}</div>
              <div className={tooltipStyles.meta}>
                <span className={tooltipStyles.swatch} />
                {clusters?.get(hovered.cl)?.name ?? `Cluster ${hovered.cl}`}
              </div>
              <div className={tooltipStyles.stats}>
                {hovered.pr ? (
                  <span>#{fmt(hovered.pr)} by Relevance</span>
                ) : null}
              </div>
              <div className={tooltipStyles.stats}>
                <span>Links to {fmt(outCount)}</span>
              </div>
              <div className={tooltipStyles.stats}>
                <span>Linked from {fmt(inCount)}</span>
              </div>
              <div className={tooltipStyles.hint}>
                {pathMode ? "Click to use in this path" : "Click to inspect"}
              </div>
            </div>
          );
        })()}
      {collapsed && (
        <button
          aria-label="Open panel"
          onClick={() => setPanelCollapsed(false)}
          className={sidebarStyles.reopen}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      )}
      {controlsVisible && (
        <>
          <div
            className={toggleStyles.toggle}
            role="radiogroup"
            aria-label="Mode"
          >
            <span
              className={toggleStyles.thumb}
              data-mode={pathMode ? "path" : "explore"}
              aria-hidden="true"
            />
            <button
              type="button"
              role="radio"
              aria-checked={!pathMode}
              className={toggleStyles.segment}
              onClick={() => setMode("explore")}
            >
              Explore
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={pathMode}
              className={toggleStyles.segment}
              onClick={() => setMode("path")}
            >
              Path
            </button>
          </div>
          {pathMode ? (
            <PathBar
              from={pathFrom}
              to={pathTo}
              clusters={clusters}
              onPickFrom={pickPathFrom}
              onPickTo={pickPathTo}
              onClearFrom={clearPathFrom}
              onClearTo={clearPathTo}
              onFlip={flipPath}
            />
          ) : (
            <SearchBar clusters={clusters} onSelect={selectSearch} />
          )}
        </>
      )}
      {!collapsed && (
        <Sidebar
          node={focus}
          detail={detail && detail.id === focus?.id ? detail : null}
          loading={loading}
          detailError={detailError}
          meta={meta}
          clusters={clusters}
          canBack={history.length > 0}
          onBack={back}
          onClose={close}
          onCollapse={() => setPanelCollapsed(true)}
          onPreview={setPreview}
          onNavigate={navigateTo}
          onFindPath={selected ? startPath : undefined}
          onTracePath={tracePath}
          onCopyArticleLink={copyArticleLink}
          onCopyPathLink={copyPathLink}
          onCopyViewLink={copyViewLink}
          path={
            pathMode && pathFrom
              ? {
                  from: pathFrom,
                  to: pathTo,
                  result: pathResult,
                  loading: pathLoading,
                  error: pathError,
                  onRetry: pathReload,
                  activeId: pathActiveStep?.id ?? null,
                  hoverId: pathHoverStep?.id ?? null,
                  onSelectStep: selectPathStep,
                  onHoverStep: setPathHoverStep,
                  onClearTo: clearPathTo,
                  onExit: close,
                  onFit: fitPath,
                }
              : null
          }
        />
      )}
    </>
  );
}
