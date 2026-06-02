import type { Meta } from "../data";
import { rgb } from "../data";
import styles from "../Sidebar.module.css";

// Hide degenerate communities (a handful of pages each) from the legend.
const MIN_CLUSTER_COUNT = 100;
const PATH_EXAMPLES: {
  from: number;
  fromT: string;
  to: number;
  toT: string;
}[] = [
  { from: 1150847, fromT: "Bitcoin", to: 3490661, toT: "Julius Caesar" },
  { from: 6292306, fromT: "Taylor Swift", to: 5362896, toT: "Quantum mechanics" },
  { from: 4495202, fromT: "Minecraft", to: 2302155, toT: "Existentialism" },
];
const fmt = (n: number) => n.toLocaleString("en-US");

export default function HomePane({
  meta,
  onTracePath,
}: {
  meta: Meta | null;
  onTracePath: (fromId: number, toId: number) => void;
}) {
  return (
    <div className={styles.homeScroll}>
      <h1 className={styles.introTitle}>Wikigraph</h1>
      <p className={styles.introCopy}>
        An interactive visualization of all of English Wikipedia. Each article
        is a dot; larger articles are more relevant; communities are separated
        by color.
      </p>
      <div className={styles.howTo}>
        <div>
          <span className={styles.step}>1</span>
          Search or click an article.
        </div>
        <div>
          <span className={styles.step}>2</span>
          See what it links to and what links back.
        </div>
        <div>
          <span className={styles.step}>3</span>
          Or find the shortest path between two articles:
        </div>
        <div className={styles.exampleChips}>
          {PATH_EXAMPLES.map((ex) => (
            <button
              type="button"
              key={`${ex.from}-${ex.to}`}
              className={styles.exampleChip}
              aria-label={`Trace a path from ${ex.fromT} to ${ex.toT}`}
              onClick={() => onTracePath(ex.from, ex.to)}
            >
              <span className={styles.exampleName}>{ex.fromT}</span>
              <span className={styles.exampleArrow}>→</span>
              <span className={styles.exampleName}>{ex.toT}</span>
            </button>
          ))}
        </div>
      </div>
      {meta && (
        <div className={styles.introStats}>
          <div>
            <div className={styles.bigNum}>{fmt(meta.total_pages)}</div>
            <div className={styles.statLabel}>Articles</div>
          </div>
          <div>
            <div className={styles.bigNum}>{fmt(meta.total_links)}</div>
            <div className={styles.statLabel}>Links</div>
          </div>
        </div>
      )}
      {meta && (
        <div className={styles.homeSection}>
          <div className={styles.sectionHead}>
            <span>Communities</span>
          </div>
          <div className={styles.legend}>
            {meta.clusters
              .filter((c) => c.count > MIN_CLUSTER_COUNT)
              .map((c) => (
                <div
                  key={c.id}
                  className={styles.legendRow}
                  title={`${c.name} · ${fmt(c.count)} articles`}
                >
                  <span
                    className={styles.swatch}
                    style={{ background: rgb(c.color) }}
                  />
                  <span className={styles.legendName}>{c.name}</span>
                  <span className={styles.legendCount}>{fmt(c.count)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
