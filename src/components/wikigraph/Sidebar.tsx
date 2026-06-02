import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  type Cluster,
  type Meta,
  type NodeMeta,
  FALLBACK_COLOR,
  rgb,
  wikipediaURL,
} from "./data";
import { type PageDetail, type PageNeighbor } from "./pages";
import { type PathNode, type PathResult } from "./path";
import { colorForCluster, nameForCluster } from "./clusters";
import type { PreviewNode } from "./nodes";
import HomePane from "./ui/HomePane";
import LinkSection, { breakdownOf } from "./ui/LinkSection";
import {
  BackIcon,
  CheckIcon,
  CloseIcon,
  ExternalIcon,
  FitIcon,
  PathIcon,
  ShareIcon,
} from "./ui/SidebarIcons";
import styles from "./Sidebar.module.css";

// Path mode renders a breadcrumb above the reused detail view. `node` is the
// active stop, so the page view below the breadcrumb is the standard layout.
export type PathBreadcrumb = {
  from: NodeMeta;
  to: NodeMeta | null;
  result: PathResult | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  activeId: number | null;
  hoverId: number | null;
  onSelectStep: (s: PathNode) => void;
  onHoverStep: (s: PathNode | null) => void;
  onClearTo: () => void;
  onExit: () => void;
  onFit: () => void;
};

type Props = {
  node: NodeMeta | null;
  detail: PageDetail | null;
  loading: boolean;
  detailError: boolean;
  meta: Meta | null;
  clusters: Map<number, Cluster> | null;
  canBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onCollapse: () => void;
  onPreview: (n: PreviewNode | null) => void;
  onNavigate: (n: PageNeighbor) => void;
  path: PathBreadcrumb | null;
  onFindPath?: () => void;
  onTracePath: (fromId: number, toId: number) => void;
  onCopyArticleLink: (n: NodeMeta) => Promise<boolean>;
  onCopyPathLink: () => Promise<boolean>;
  onCopyViewLink: () => Promise<boolean>;
};

const LIST_CAP = 200;
const fmt = (n: number) => n.toLocaleString("en-US");

export default function Sidebar({
  node,
  detail,
  loading,
  detailError,
  meta,
  clusters,
  canBack,
  onBack,
  onClose,
  onCollapse,
  onPreview,
  onNavigate,
  path,
  onFindPath,
  onTracePath,
  onCopyArticleLink,
  onCopyPathLink,
  onCopyViewLink,
}: Props) {
  const [copied, setCopied] = useState<"article" | "path" | "view" | null>(
    null,
  );
  const colorOf = (cl: number): [number, number, number] =>
    colorForCluster(clusters, cl);
  const nameOf = (cl: number) => nameForCluster(clusters, cl);

  // The path chain, only when there's a real (≥2 node) route to show.
  const pathSteps =
    path?.result?.found && path.result.path.length >= 2
      ? path.result.path
      : null;
  // Clicks = edges between the endpoints (one fewer than the node count).
  const pathClicks = pathSteps ? pathSteps.length - 1 : 0;
  const outCount = node?.no ?? detail?.no ?? detail?.out.length ?? 0;
  const inCount = node?.ni ?? detail?.ni ?? detail?.in.length ?? 0;
  const pr = node?.pr || detail?.pr || 0;

  const outBd = useMemo(
    () =>
      breakdownOf(
        node?.ob ?? detail?.ob,
        detail?.out.map((n) => n[5]),
        outCount,
      ),
    [node, detail, outCount],
  );
  const inBd = useMemo(
    () =>
      breakdownOf(
        node?.ib ?? detail?.ib,
        detail?.in.map((n) => n[5]),
        inCount,
      ),
    [node, detail, inCount],
  );

  const outList = useMemo(
    () =>
      detail
        ? [...detail.out].sort((a, b) => b[4] - a[4]).slice(0, LIST_CAP)
        : [],
    [detail],
  );
  const inList = useMemo(
    () =>
      detail
        ? [...detail.in].sort((a, b) => b[4] - a[4]).slice(0, LIST_CAP)
        : [],
    [detail],
  );

  // Accent themes the top border and other accents — the focused node's cluster
  // color (in path mode that's the active stop, so the panel matches the page).
  const accent = node ? colorOf(node.cl) : FALLBACK_COLOR;

  const copy = async (
    kind: "article" | "path" | "view",
    fn: () => Promise<boolean>,
  ) => {
    if (!(await fn())) return;
    setCopied(kind);
    window.setTimeout(() => setCopied((v) => (v === kind ? null : v)), 1400);
  };

  return (
    <motion.aside
      className={styles.panel}
      data-mode={path ? "path" : node ? "detail" : "home"}
      style={{ ["--cl" as string]: accent.join(" ") }}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles.header}>
        {!path && canBack && node && (
          <button className={styles.iconBtn} onClick={onBack} aria-label="Back">
            <BackIcon />
          </button>
        )}
        <span className={styles.chip}>
          {node ? (
            <>
              <span className={styles.dot} />
              <span className={styles.chipName}>
                {path ? "Path" : nameOf(node.cl)}
              </span>
            </>
          ) : (
            <span className={styles.chipName} />
          )}
        </span>
        {/* The view link lives in the header only on the overview; the article
            and path views carry their own (more specific) share button. */}
        {!node && (
          <button
            className={styles.iconBtn}
            onClick={() => copy("view", onCopyViewLink)}
            aria-label={
              copied === "view" ? "View link copied" : "Copy link to this view"
            }
            data-tip={copied === "view" ? "Copied" : "Copy link to this view"}
          >
            {copied === "view" ? <CheckIcon /> : <ShareIcon />}
          </button>
        )}
        <button
          className={styles.iconBtn}
          onClick={path ? path.onExit : node ? onClose : onCollapse}
          aria-label={path ? "Exit path mode" : node ? "Close" : "Collapse"}
        >
          <CloseIcon />
        </button>
      </div>

      <div className={styles.body}>
        <AnimatePresence initial={false}>
          {node ? (
            <motion.div
              key={path ? "path" : "detail"}
              className={styles.pane}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {path && (
                <div className={styles.pathTop}>
                  <div className={styles.pathSummary}>
                    {pathSteps && path.to ? (
                      <>
                        <h2 className={styles.pathHeadline}>
                          {path.to.t} is{" "}
                          <span className={styles.pathClicks}>
                            {pathClicks}
                          </span>{" "}
                          {pathClicks === 1 ? "click" : "clicks"} from{" "}
                          {path.from.t}
                        </h2>
                        <div className={styles.pathActions}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            aria-label="Copy path link"
                            data-tip={
                              copied === "path" ? "Copied" : "Copy path link"
                            }
                            onClick={() => copy("path", onCopyPathLink)}
                          >
                            {copied === "path" ? <CheckIcon /> : <ShareIcon />}
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionBtn}`}
                            aria-label="Fit route"
                            data-tip="Fit route"
                            onClick={path.onFit}
                          >
                            <FitIcon />
                          </button>
                        </div>
                      </>
                    ) : path.loading && path.to ? (
                      <>
                        <h2 className={styles.pathTitle}>
                          <span>{path.from.t}</span>
                          <span className={styles.pathArrow}>→</span>
                          <span>{path.to.t}</span>
                        </h2>
                        <p className={styles.pathText}>
                          Finding the shortest route…
                        </p>
                      </>
                    ) : path.error && path.to ? (
                      <>
                        <h2 className={styles.pathTitle}>
                          <span>{path.from.t}</span>
                          <span className={styles.pathArrow}>→</span>
                          <span>{path.to.t}</span>
                        </h2>
                        <p className={styles.pathText}>
                          Couldn&apos;t reach the server.{" "}
                          <button
                            type="button"
                            className={styles.crumbAction}
                            onClick={path.onRetry}
                          >
                            Retry
                          </button>
                        </p>
                      </>
                    ) : path.result && !path.result.found && path.to ? (
                      <>
                        <h2 className={styles.pathTitle}>
                          <span>{path.from.t}</span>
                          <span className={styles.pathArrow}>→</span>
                          <span>{path.to.t}</span>
                        </h2>
                        <p className={styles.pathText}>
                          No path found. Try another destination.
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className={styles.pathTitle}>
                          Find a path from {path.from.t}
                        </h2>
                        <p className={styles.pathText}>
                          Search a destination above, or click another article
                          on the map.
                        </p>
                      </>
                    )}
                  </div>

                  <div className={styles.routeBox}>
                    {pathSteps ? (
                      <ol className={styles.routeList} aria-label="Path steps">
                        {pathSteps.map((step, i) => (
                          <li
                            className={styles.routeItem}
                            key={`${step.id}-${i}`}
                          >
                            <button
                              type="button"
                              className={`${styles.routeStep} ${
                                step.id === path.activeId
                                  ? styles.routeStepActive
                                  : ""
                              }`}
                              title={step.t}
                              aria-label={`Inspect step ${i + 1}: ${step.t}`}
                              onClick={() => path.onSelectStep(step)}
                              onMouseEnter={() => path.onHoverStep(step)}
                              onMouseLeave={() => path.onHoverStep(null)}
                              onFocus={() => path.onHoverStep(step)}
                              onBlur={() => path.onHoverStep(null)}
                            >
                              <span className={styles.routeIndex}>{i + 1}</span>
                              <span
                                className={styles.routeDot}
                                style={{ background: rgb(colorOf(step.cl)) }}
                              />
                              <span className={styles.routeText}>{step.t}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : path.loading ? (
                      <div className={styles.routeHint}>
                        <span className={styles.crumbShimmer} />
                        Finding path…
                      </div>
                    ) : path.error ? (
                      <div className={styles.routeHint}>
                        Path lookup failed ·{" "}
                        <button
                          type="button"
                          className={styles.crumbAction}
                          onClick={path.onRetry}
                        >
                          retry
                        </button>
                      </div>
                    ) : path.result?.found ? (
                      <div className={styles.routeHint}>
                        Same article — you&apos;re already here.
                      </div>
                    ) : path.result ? (
                      <div className={styles.routeHint}>
                        No path found ·{" "}
                        <button
                          type="button"
                          className={styles.crumbAction}
                          onClick={path.onClearTo}
                        >
                          choose another
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              {!path && (
                <>
                  <div className={styles.metaTop}>
                    <h1
                      className={styles.title}
                      title={node.t || detail?.t || ""}
                    >
                      {node.t || detail?.t || ""}
                    </h1>
                    <div className={styles.prLine}>
                      {pr ? `#${fmt(pr)} by Relevance` : ""}
                    </div>
                    <div className={styles.actions}>
                      {onFindPath && (
                        <button
                          type="button"
                          className={`${styles.actionBtn}`}
                          aria-label="Find path from this article"
                          data-tip="Find path"
                          onClick={onFindPath}
                        >
                          <PathIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.actionBtn}
                        aria-label="Copy article link"
                        data-tip={
                          copied === "article" ? "Copied" : "Copy article link"
                        }
                        onClick={() =>
                          copy("article", () => onCopyArticleLink(node))
                        }
                      >
                        {copied === "article" ? <CheckIcon /> : <ShareIcon />}
                      </button>
                      <a
                        className={styles.actionBtn}
                        href={wikipediaURL(node.t || detail?.t || "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open in Wikipedia"
                        data-tip="Open in Wikipedia"
                      >
                        <ExternalIcon />
                      </a>
                    </div>
                  </div>

                  <div className={styles.sections}>
                    <LinkSection
                      label="Links to"
                      count={outCount}
                      bd={outBd}
                      items={outList}
                      loading={loading}
                      error={detailError}
                      colorOf={colorOf}
                      nameOf={nameOf}
                      onPreview={onPreview}
                      onNavigate={onNavigate}
                    />
                    <LinkSection
                      label="Linked from"
                      count={inCount}
                      bd={inBd}
                      items={inList}
                      loading={loading}
                      error={detailError}
                      colorOf={colorOf}
                      nameOf={nameOf}
                      onPreview={onPreview}
                      onNavigate={onNavigate}
                    />
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="home"
              className={styles.pane}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <HomePane meta={meta} onTracePath={onTracePath} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
