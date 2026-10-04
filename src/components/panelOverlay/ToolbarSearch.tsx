/**
 * @file ToolbarSearch.tsx
 * @description The search field of a panel toolbar, with its results dropdown.
 */
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatLabel, useFormatMessage, usePredefinedMessages } from '../WindowManagerContext';

// ─── ToolbarSearchInput ───────────────────────────────────────────────────────

/** A single result item returned by `RddToolbarSearchProps.onSearch`. */
export interface SearchResult {
  /** Unique identifier for this result — passed to `onSelect`. */
  id: string;
  /** Primary display text. */
  label: string;
  /** Optional secondary text shown below the label in the dropdown. */
  description?: string;
  /** Optional group header used to bucket results visually. */
  group?: string;
  /** Optional icon shown to the left of the label. */
  icon?: React.ReactNode;
}

/** Props for `<RddToolbarSearch>`. */
export interface RddToolbarSearchProps {
  /** Placeholder text shown in the expanded input field. @default the `searchPlaceholder` message ('Search…') */
  placeholder?: string;
  /**
   * Called with the current query and an `AbortSignal` each time the input changes (debounced).
   * Return `SearchResult[]` directly for synchronous sources, or `Promise<SearchResult[]>` for async.
   * Abort in-flight requests when the signal fires to prevent stale result races.
   */
  onSearch(query: string, signal: AbortSignal): Promise<SearchResult[]> | SearchResult[];
  /** Called when the user selects a result from the dropdown. */
  onSelect(result: SearchResult): void;
}

/**
 * Debounced async search field for use inside a `PanelToolbar`.
 * Renders as a compact icon button that expands into a text input on activation.
 * Results appear in a portal-rendered dropdown below the input.
 * @example
 * <ToolbarSearchInput
 *   placeholder="Find layer…"
 *   onSearch={(q, signal) => fetchLayers(q, { signal })}
 *   onSelect={result => workspace.focusLayer(result.id)}
 * />
 */
export function ToolbarSearchInput({ placeholder, onSearch, onSelect }: RddToolbarSearchProps): React.ReactElement {
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const searchLabel = formatLabel(messages.search, formatMessage);
  const closeSearchLabel = formatLabel(messages.closeSearch, formatMessage);
  const placeholderText = placeholder ?? formatLabel(messages.searchPlaceholder, formatMessage);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unmounting stops the search (7.4.1): a pending debounce would still call onSearch for a
  // toolbar that has gone, and a search in flight would never see its signal abort.
  useEffect(() => () => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const openSearch = (): void => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  };

  const closeSearch = (): void => {
    setExpanded(false);
    setQuery('');
    setResults([]);
    setDropdownPos(null);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const q = e.target.value;
    setQuery(q);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setDropdownPos(null); return; }

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await onSearch(q, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setResults(res);
          const el = containerRef.current;
          if (el && res.length > 0) {
            const r = el.getBoundingClientRect();
            const dropW = Math.max(r.width, 240);
            let left = r.left;
            if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
            setDropdownPos({ top: r.bottom + 4, left, width: dropW });
          } else {
            setDropdownPos(null);
          }
        }
      } catch {
        // AbortError or user-thrown — ignore
      }
    }, 300);
  };

  const handleSelect = (result: SearchResult): void => {
    onSelect(result);
    closeSearch();
  };

  const handleBlur = (e: React.FocusEvent): void => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      closeSearch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // Claim the key so the drawer or modal holding this panel stays open (see escapeStack).
      e.preventDefault();
      closeSearch();
    }
  };

  const grouped = useMemo((): Record<string, SearchResult[]> => {
    const map: Record<string, SearchResult[]> = {};
    for (const r of results) {
      const g = r.group ?? '';
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }
    return map;
  }, [results]);

  const SearchIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="4.5" />
      <line x1="10" y1="10" x2="14" y2="14" />
    </svg>
  );

  if (!expanded) {
    return (
      <div ref={containerRef} className="rdd-panel-toolbar-search">
        <button type="button" className="rdd-panel-toolbar-btn" onClick={openSearch} title={searchLabel} aria-label={searchLabel}>
          {SearchIcon}
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rdd-panel-toolbar-search rdd-panel-toolbar-search--open" onBlur={handleBlur}>
      <button type="button" className="rdd-panel-toolbar-btn" onClick={closeSearch} aria-label={closeSearchLabel} title={closeSearchLabel}>
        {SearchIcon}
      </button>
      <input
        ref={inputRef}
        className="rdd-panel-toolbar-search__input"
        type="text"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholderText}
        aria-label={searchLabel}
        autoComplete="off"
      />
      {dropdownPos && results.length > 0 && createPortal(
        <div
          className="rdd-panel-toolbar-search__dropdown"
          // z-index from .rdd-panel-toolbar-search__dropdown (+8502), not inline, so
          // zIndexBase shifts it too. Resolves to the same 9502 by default.
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
          onMouseDown={e => e.preventDefault()}
        >
          {Object.entries(grouped).map(([group, items]) => (
            <React.Fragment key={group || '__default__'}>
              {group && <div className="rdd-panel-toolbar-search__group">{group}</div>}
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="rdd-panel-toolbar-search__item"
                  onClick={() => handleSelect(item)}
                >
                  {item.icon && <span className="rdd-panel-toolbar-search__item-icon">{item.icon}</span>}
                  <span className="rdd-panel-toolbar-search__item-label">{item.label}</span>
                  {item.description && <span className="rdd-panel-toolbar-search__item-desc">{item.description}</span>}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
