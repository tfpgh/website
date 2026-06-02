export const WORLD_SIZE = 2 ** 16;
export const HALF_WORLD = WORLD_SIZE / 2;

export const TILE_PIXELS = 1024;

export const MIN_Z = 0;
export const MAX_Z = 12;

export const META_MIN_Z = 3;
export const META_MAX_Z = 11;

export const DECK_TILE_SIZE = WORLD_SIZE;

export const ZOOM_OFFSET = Math.log2(WORLD_SIZE / TILE_PIXELS) + 0.25;

export const TILE_BASE_URL = "https://wikigraph.tobypenner.com";
export const NODE_TILE_URL = `${TILE_BASE_URL}/node_tiles/{z}/{x}/{y}.webp`;
export const NODE_META_URL = `${TILE_BASE_URL}/node_meta/{z}/{x}/{y}.json`;
export const PAGES_URL = `${TILE_BASE_URL}/pages/{z}/{x}/{y}.json`;
export const META_JSON_URL = `${TILE_BASE_URL}/meta.json`;
export const SEARCH_URL = `${TILE_BASE_URL}/search?q=`;
export const PATH_URL = `${TILE_BASE_URL}/path`;
