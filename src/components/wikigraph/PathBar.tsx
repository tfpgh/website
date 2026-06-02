import { forwardRef, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { type SearchResult } from "./search";
import { type Cluster, type NodeMeta, rgb } from "./data";
import { colorForCluster } from "./clusters";
import SearchCombobox from "./ui/SearchCombobox";
import styles from "./PathBar.module.css";

type Props = {
  from: NodeMeta | null;
  to: NodeMeta | null;
  clusters: Map<number, Cluster> | null;
  onPickFrom: (r: SearchResult) => void;
  onPickTo: (r: SearchResult) => void;
  onClearFrom: () => void;
  onClearTo: () => void;
  onFlip: () => void;
};

const ClearIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const ArrowIcon = () => (
  <svg
    className={styles.arrow}
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
);

const FlipIcon = () => (
  <svg
    className={styles.arrow}
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 7h18l-4-4M21 7l-4 4" />
    <path d="M21 17H3l4-4M3 17l4 4" />
  </svg>
);

function Pill({
  node,
  color,
  onClear,
  ariaLabel,
}: {
  node: NodeMeta;
  color: [number, number, number];
  onClear: () => void;
  ariaLabel: string;
}) {
  return (
    <div className={styles.pill} title={node.t} aria-label={node.t}>
      <span className={styles.pillSwatch} style={{ background: rgb(color) }} />
      <span className={styles.pillTitle}>{node.t}</span>
      <button
        type="button"
        className={styles.pillClear}
        onClick={onClear}
        aria-label={ariaLabel}
      >
        <ClearIcon />
      </button>
    </div>
  );
}

// One endpoint's search box (used for both the from and to slots when that end
// hasn't been chosen yet). `excludeId` disables picking the other endpoint.
const EndpointSearch = forwardRef<
  HTMLInputElement,
  {
    placeholder: string;
    clusters: Map<number, Cluster> | null;
    excludeId?: number;
    onPick: (r: SearchResult) => void;
    onFocusChange: (focused: boolean) => void;
  }
>(function EndpointSearch(
  { placeholder, clusters, excludeId, onPick, onFocusChange },
  ref,
) {
  return (
    <SearchCombobox
      ref={ref}
      clusters={clusters}
      placeholder={placeholder}
      excludeId={excludeId}
      onPick={onPick}
      onFocusChange={onFocusChange}
      className={styles.commandHost}
      dropdownClassName={styles.dropdown}
      listClassName={styles.list}
      itemClassName={styles.item}
      swatchClassName={styles.itemSwatch}
      titleClassName={styles.itemTitle}
      hintClassName={styles.hint}
      renderInput={({ inputRef, inputProps }) => (
        <Command.Input
          ref={inputRef}
          {...inputProps}
          className={styles.input}
        />
      )}
    />
  );
});

export default function PathBar({
  from,
  to,
  clusters,
  onPickFrom,
  onPickTo,
  onClearFrom,
  onClearTo,
  onFlip,
}: Props) {
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  const colorOf = (cl: number): [number, number, number] =>
    colorForCluster(clusters, cl);

  // Keep the next empty slot focused: the from-search on a cold open, the
  // to-search once a start is chosen, and again whenever an end is cleared.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!from) fromRef.current?.focus();
      else if (!to) toRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [from, to]);

  // ⌘K focuses the first empty endpoint from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!from) fromRef.current?.focus();
        else if (!to) toRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [from, to]);

  const [activeFocus, setActiveFocus] = useState(false);

  return (
    <div className={`${styles.command} ${activeFocus ? styles.focused : ""}`}>
      <div className={styles.bar}>
        {from ? (
          <Pill
            node={from}
            color={colorOf(from.cl)}
            onClear={onClearFrom}
            ariaLabel="Clear start"
          />
        ) : (
          <EndpointSearch
            ref={fromRef}
            placeholder="Start article"
            clusters={clusters}
            excludeId={to?.id}
            onPick={onPickFrom}
            onFocusChange={setActiveFocus}
          />
        )}

        {from && to ? (
          <button
            type="button"
            className={styles.flipBtn}
            onClick={onFlip}
            aria-label="Flip path direction"
            title="Flip path"
          >
            <FlipIcon />
          </button>
        ) : (
          <ArrowIcon />
        )}

        {to ? (
          <Pill
            node={to}
            color={colorOf(to.cl)}
            onClear={onClearTo}
            ariaLabel="Clear destination"
          />
        ) : (
          <EndpointSearch
            ref={toRef}
            placeholder="Destination article"
            clusters={clusters}
            excludeId={from?.id}
            onPick={onPickTo}
            onFocusChange={setActiveFocus}
          />
        )}
      </div>
    </div>
  );
}
