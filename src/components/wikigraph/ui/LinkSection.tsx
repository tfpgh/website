import { useState } from "react";
import type { PageNeighbor } from "../pages";
import { rgb } from "../data";
import type { PreviewNode } from "../nodes";
import styles from "../Sidebar.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");

type Segment = { cl: number; count: number };
export type Breakdown = { segs: Segment[]; denom: number };

export function breakdownOf(
  provided: [number, number][] | undefined,
  sampleCls: number[] | undefined,
  total: number,
): Breakdown {
  if (provided && provided.length) {
    const segs = provided.map(([cl, count]) => ({ cl, count }));
    const shown = segs.reduce((s, x) => s + x.count, 0);
    return { segs, denom: total || shown || 1 };
  }
  if (sampleCls && sampleCls.length) {
    const m = new Map<number, number>();
    for (const cl of sampleCls) m.set(cl, (m.get(cl) ?? 0) + 1);
    const segs = [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cl, count]) => ({ cl, count }));
    return { segs, denom: sampleCls.length };
  }
  return { segs: [], denom: 1 };
}

export default function LinkSection({
  label,
  count,
  bd,
  items,
  loading,
  error,
  colorOf,
  nameOf,
  onPreview,
  onNavigate,
}: {
  label: string;
  count: number;
  bd: Breakdown;
  items: PageNeighbor[];
  loading: boolean;
  error: boolean;
  colorOf: (cl: number) => [number, number, number];
  nameOf: (cl: number) => string;
  onPreview: (n: PreviewNode | null) => void;
  onNavigate: (n: PageNeighbor) => void;
}) {
  const [hv, setHv] = useState<Segment | null>(null);
  const pct = (c: number) => Math.round((c / bd.denom) * 100);
  const right = hv ? `${nameOf(hv.cl)} · ${pct(hv.count)}%` : fmt(count);

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <span>{label}</span>
        <span className={styles.sectionCount}>{right}</span>
      </div>
      {bd.segs.length > 0 && (
        <div className={styles.bar} onMouseLeave={() => setHv(null)}>
          {bd.segs.map((s) => (
            <div
              key={s.cl}
              className={styles.seg}
              title={`${nameOf(s.cl)} · ${pct(s.count)}%`}
              aria-label={`${nameOf(s.cl)} ${pct(s.count)}%`}
              style={{
                width: `${(s.count / bd.denom) * 100}%`,
                background: rgb(colorOf(s.cl)),
              }}
              onMouseEnter={() => setHv(s)}
            />
          ))}
        </div>
      )}
      <div className={styles.linksScroll}>
        {items.length === 0 ? (
          <div className={styles.more}>
            {loading ? "Loading..." : error ? "Couldn't load links" : "None"}
          </div>
        ) : (
          <>
            {items.map((n) => (
              <button
                type="button"
                key={n[0]}
                className={styles.linkRow}
                title={n[1]}
                aria-label={`Open ${n[1]}`}
                onMouseEnter={() =>
                  onPreview({ x: n[2], y: n[3], r: n[4], cl: n[5] })
                }
                onMouseLeave={() => onPreview(null)}
                onFocus={() =>
                  onPreview({ x: n[2], y: n[3], r: n[4], cl: n[5] })
                }
                onBlur={() => onPreview(null)}
                onClick={() => onNavigate(n)}
              >
                <span
                  className={styles.swatch}
                  style={{ background: rgb(colorOf(n[5])) }}
                />
                <span className={styles.linkTitle}>{n[1]}</span>
              </button>
            ))}
            {count > items.length && (
              <div className={styles.more}>
                Showing top {fmt(items.length)} of {fmt(count)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
