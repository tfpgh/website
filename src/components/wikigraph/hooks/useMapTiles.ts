import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TileLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import ExposureBitmapLayer from "../layers/ExposureBitmapLayer";
import type { NodeMeta } from "../data";
import {
  DECK_TILE_SIZE,
  HALF_WORLD,
  MAX_Z,
  META_MAX_Z,
  META_MIN_Z,
  MIN_Z,
  NODE_META_URL,
  NODE_TILE_URL,
  WORLD_SIZE,
  ZOOM_OFFSET,
} from "../config";
import { compactLayout } from "../layout";

const isAbortError = (error: unknown) => {
  if (typeof error === "string") return /aborted/i.test(error);
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: string; message?: string };
  return name === "AbortError" || /aborted/i.test(message ?? "");
};

export function useMapTiles(dimOpacity: number) {
  // The metadata layer fetches per-tile records, but a record lives only in the
  // tile holding the node's center. Loaded records are funneled into one global
  // invisible pick layer so large circles can be hit across tile boundaries.
  const metaTilesRef = useRef<Map<string, NodeMeta[]>>(new Map());
  const [metaVersion, setMetaVersion] = useState(0);
  const bumpFrameRef = useRef<number | null>(null);

  const bumpMeta = useCallback(() => {
    if (bumpFrameRef.current != null) return;
    bumpFrameRef.current = requestAnimationFrame(() => {
      bumpFrameRef.current = null;
      setMetaVersion((v) => v + 1);
    });
  }, []);

  useEffect(
    () => () => {
      if (bumpFrameRef.current != null)
        cancelAnimationFrame(bumpFrameRef.current);
    },
    [],
  );

  const registerTile = useCallback(
    (id: string, nodes: NodeMeta[]) => {
      metaTilesRef.current.set(id, nodes);
      bumpMeta();
    },
    [bumpMeta],
  );

  const unregisterTile = useCallback(
    (id: string) => {
      if (metaTilesRef.current.delete(id)) bumpMeta();
    },
    [bumpMeta],
  );

  const [firstLoad, setFirstLoad] = useState(false);
  const [rasterTileError, setRasterTileError] = useState(false);
  const [metaTileError, setMetaTileError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [rasterCacheSize] = useState(() => (compactLayout() ? 48 : 128));

  const retry = useCallback(() => {
    metaTilesRef.current.clear();
    setRasterTileError(false);
    setMetaTileError(false);
    setFirstLoad(false);
    setReloadKey((k) => k + 1);
    bumpMeta();
  }, [bumpMeta]);

  const nodeLayer = useMemo(
    () =>
      new TileLayer({
        id: `node-tiles-${reloadKey}`,
        data: NODE_TILE_URL,
        opacity: dimOpacity,
        maxRequests: -1,
        maxCacheSize: rasterCacheSize,
        refinementStrategy: "no-overlap",
        tileSize: DECK_TILE_SIZE,
        zoomOffset: ZOOM_OFFSET,
        minZoom: MIN_Z,
        maxZoom: MAX_Z,
        extent: [0, 0, WORLD_SIZE, WORLD_SIZE],
        loadOptions: { fetch: { mode: "cors" } },
        onViewportLoad: () => {
          setFirstLoad(true);
        },
        onTileError: (error: unknown) => {
          if (error != null && !isAbortError(error)) setRasterTileError(true);
        },
        renderSubLayers: (props) => {
          const { boundingBox } = props.tile;
          return new ExposureBitmapLayer(props, {
            data: undefined,
            image: props.data,
            bounds: [
              boundingBox[0][0],
              boundingBox[1][1],
              boundingBox[1][0],
              boundingBox[0][1],
            ],
            textureParameters: {
              minFilter: "linear",
              magFilter: "linear",
              mipmapFilter: "linear",
              maxAnisotropy: 16,
            },
          });
        },
      }),
    [dimOpacity, reloadKey, rasterCacheSize],
  );

  const metaLayer = useMemo(
    () =>
      new TileLayer<NodeMeta[]>({
        id: `node-meta-${reloadKey}`,
        data: NODE_META_URL,
        maxRequests: -1,
        maxCacheSize: 64,
        refinementStrategy: "no-overlap",
        tileSize: DECK_TILE_SIZE,
        zoomOffset: ZOOM_OFFSET,
        minZoom: META_MIN_Z,
        maxZoom: META_MAX_Z,
        extent: [0, 0, WORLD_SIZE, WORLD_SIZE],
        getTileData: (tile) =>
          fetch(tile.url!, { signal: tile.signal, mode: "cors" })
            .then((res) => {
              if (res.ok) return res.json() as Promise<NodeMeta[]>;
              setMetaTileError(true);
              return [];
            })
            .catch(() => {
              if (!tile.signal?.aborted) setMetaTileError(true);
              return [];
            }),
        onTileLoad: (tile) =>
          registerTile(tile.id, (tile.content as NodeMeta[] | null) ?? []),
        onTileUnload: (tile) => unregisterTile(tile.id),
        renderSubLayers: () => null,
      }),
    [registerTile, unregisterTile, reloadKey],
  );

  const hitNodes = useMemo<NodeMeta[]>(() => {
    const byId = new Map<number, NodeMeta>();
    for (const nodes of metaTilesRef.current.values()) {
      for (const n of nodes) byId.set(n.id, n);
    }
    return Array.from(byId.values()).sort((a, b) => b.r - a.r);
  }, [metaVersion]);

  const hitLayer = useMemo(
    () =>
      new ScatterplotLayer<NodeMeta>({
        id: "node-hit",
        data: hitNodes,
        pickable: true,
        filled: true,
        stroked: false,
        radiusUnits: "common",
        getPosition: (d) => [d.x + HALF_WORLD, d.y + HALF_WORLD],
        getRadius: (d) => d.r,
        getFillColor: [0, 0, 0, 0],
      }),
    [hitNodes],
  );

  return {
    nodeLayer,
    metaLayer,
    hitLayer,
    firstLoad,
    tileError: rasterTileError || metaTileError,
    retry,
  };
}
