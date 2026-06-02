import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { type SearchResult } from "./search";
import { type Cluster } from "./data";
import SearchCombobox from "./ui/SearchCombobox";
import styles from "./SearchBar.module.css";

type Props = {
  clusters: Map<number, Cluster> | null;
  onSelect: (r: SearchResult) => void;
};

const SearchIcon = () => (
  <svg
    className={styles.searchIcon}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export default function SearchBar({ clusters, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the input from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SearchCombobox
      ref={inputRef}
      clusters={clusters}
      placeholder="Search articles"
      onPick={onSelect}
      className={(focused) =>
        `${styles.command} ${focused ? styles.focused : ""}`
      }
      dropdownClassName={styles.dropdown}
      listClassName={styles.list}
      itemClassName={styles.item}
      swatchClassName={styles.swatch}
      titleClassName={styles.itemTitle}
      hintClassName={styles.hint}
      ariaLiveClassName={styles.srOnly}
      renderInput={({ inputRef, inputProps, focused }) => (
        <div className={styles.inputRow}>
          <SearchIcon />
          <Command.Input
            ref={inputRef}
            {...inputProps}
            className={styles.input}
          />
          {!focused && <kbd className={styles.kbd}>⌘K</kbd>}
        </div>
      )}
    />
  );
}
