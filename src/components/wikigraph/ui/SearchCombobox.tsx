import {
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { type SearchResult, useSearch } from "../search";
import type { Cluster } from "../data";
import { rgb } from "../data";
import { colorForCluster } from "../clusters";

type InputProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  "aria-label": string;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
};

type Props = {
  clusters: Map<number, Cluster> | null;
  placeholder: string;
  excludeId?: number;
  onPick: (r: SearchResult) => void;
  onFocusChange?: (focused: boolean) => void;
  className?: string | ((focused: boolean) => string);
  dropdownClassName: string;
  listClassName: string;
  itemClassName: string;
  swatchClassName: string;
  titleClassName: string;
  hintClassName: string;
  ariaLiveClassName?: string;
  renderInput: (args: {
    inputRef: (node: HTMLInputElement | null) => void;
    inputProps: InputProps;
    focused: boolean;
    query: string;
  }) => ReactNode;
};

const SearchCombobox = forwardRef<HTMLInputElement, Props>(
  function SearchCombobox(
    {
      clusters,
      placeholder,
      excludeId,
      onPick,
      onFocusChange,
      className,
      dropdownClassName,
      listClassName,
      itemClassName,
      swatchClassName,
      titleClassName,
      hintClassName,
      ariaLiveClassName,
      renderInput,
    },
    forwardedRef,
  ) {
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(false);
    const { results, loading, error } = useSearch(query);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const pick = (r: SearchResult) => {
      if (r.id === excludeId) return;
      setQuery("");
      inputRef.current?.blur();
      onPick(r);
    };

    const setFocusedState = (value: boolean) => {
      setFocused(value);
      onFocusChange?.(value);
    };

    const open = focused && query.trim().length > 0;

    return (
      <Command
        shouldFilter={false}
        loop
        className={
          typeof className === "function" ? className(focused) : className
        }
      >
        {renderInput({
          inputRef: setInputRef,
          focused,
          query,
          inputProps: {
            value: query,
            onValueChange: setQuery,
            placeholder,
            "aria-label": placeholder,
            onFocus: () => setFocusedState(true),
            onBlur: () => setFocusedState(false),
            onKeyDown: (e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                if (query) setQuery("");
                else inputRef.current?.blur();
              }
            },
          },
        })}

        {ariaLiveClassName && (
          <div className={ariaLiveClassName} aria-live="polite">
            {open && !loading
              ? error
                ? "Search failed"
                : `${results.length} result${results.length === 1 ? "" : "s"}`
              : ""}
          </div>
        )}

        <AnimatePresence>
          {open && (
            <motion.div
              className={dropdownClassName}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Command.List className={listClassName}>
                {results.length === 0 && (
                  <div className={hintClassName}>
                    {loading
                      ? "Searching..."
                      : error
                        ? "Search failed - try again"
                        : "No matches"}
                  </div>
                )}
                {results.map((r) => {
                  const same = r.id === excludeId;
                  return (
                    <Command.Item
                      key={r.id}
                      value={String(r.id)}
                      onSelect={() => pick(r)}
                      disabled={same}
                      className={itemClassName}
                      title={r.t}
                    >
                      <span
                        className={swatchClassName}
                        style={{
                          background: rgb(colorForCluster(clusters, r.cl)),
                        }}
                      />
                      <span className={titleClassName}>{r.t}</span>
                    </Command.Item>
                  );
                })}
              </Command.List>
            </motion.div>
          )}
        </AnimatePresence>
      </Command>
    );
  },
);

export default SearchCombobox;
