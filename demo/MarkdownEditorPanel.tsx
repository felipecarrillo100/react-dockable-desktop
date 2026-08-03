import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css'; // rehype-katex does not import this for you
import { usePanelContribution, startPointerDrag, useColorScheme } from '../src/index';
import type { ToolbarItem, PanelSidebarSection } from '../src/index';

const DEFAULT_MARKDOWN = `# Getting Started

Welcome to the **Markdown Editor** panel. Edit the source on the left; the preview
renders live on the right — drag the divider between them to resize.

## Features

- Live preview via \`react-markdown\`
- GitHub-flavored tables and task lists (via \`remark-gfm\`)
- A Table of Contents, contributed to the app's Sidebar while this panel is active
- Formatting buttons, contributed to the app's Toolbar while this panel is active

## Example table

| Feature       | Status | Notes                    |
| ------------- | :----: | ------------------------- |
| Bold / Italic | ✅     | via toolbar or \`**\`/\`*\` |
| Headings      | ✅     | contributes to the ToC    |
| Tables        | ✅     | GFM, with alignment       |
| Code          | ✅     | syntax-highlighted below  |

## Example code

\`\`\`ts
function greet(name: string): string {
  // Scroll this editor — the preview follows along, and vice versa.
  return \`Hello, \${name}!\`;
}
\`\`\`

## Math

Inline: the lift coefficient $C_L$ is dimensionless, and $E = mc^2$.

Display:

$$
f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi)\\,e^{2\\pi i \\xi x}\\,d\\xi
$$

## Raw HTML

<details>
<summary>Click to expand</summary>

Raw HTML tags like this \`<details>\` accordion are supported too — press <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy this panel's content.

</details>

## Footnotes

Here's a statement backed by a reference.[^1]

[^1]: GFM footnotes work out of the box via \`remark-gfm\` — no extra plugin needed.

## Try it

Select some text below and click a formatting button in the toolbar above, then
open a second Markdown Editor panel and switch between them — each keeps its own
independent content and Table of Contents.

Some *sample* text to format.
`;

// ─── Monaco selection helpers ──────────────────────────────────────────────

function wrapSelection(editorInstance: any, before: string, after: string = before): void {
  const selection = editorInstance?.getSelection();
  const model = editorInstance?.getModel();
  if (!selection || !model) return;
  // Trim whitespace/newlines out of the wrap so a whole-line selection (e.g. from a
  // triple-click, which includes the trailing line break) doesn't push the closing
  // marker onto the next line and break heading syntax.
  const selected = (model.getValueInRange(selection) || '').trim() || 'text';
  editorInstance.executeEdits('markdown-toolbar', [
    { range: selection, text: `${before}${selected}${after}`, forceMoveMarkers: true },
  ]);
  editorInstance.focus();
}

function prefixLines(editorInstance: any, prefix: string): void {
  const selection = editorInstance?.getSelection();
  if (!selection) return;
  const edits = [];
  for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
    edits.push({ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, text: prefix });
  }
  editorInstance.executeEdits('markdown-toolbar', edits);
  editorInstance.focus();
}

// ─── Markdown rendering: tag every block with its source line ─────────────
// react-markdown always passes a `node` prop to component overrides (`passNode: true`
// internally) whose `position.start.line` is the markdown source line that produced it —
// this is the same `data-line` tagging VS Code's own markdown preview injects manually
// (see extensions/markdown-language-features/preview-src/scroll-sync.ts) to drive its
// dual-pane scroll sync. Tagging block-level elements here is what makes scroll sync
// below possible, without a dedicated position-tracking plugin.

function withSourceLine<Tag extends keyof JSX.IntrinsicElements>(tag: Tag): Components[Tag] {
  const Tagged = ({ node, ...props }: any) => {
    const line = node?.position?.start.line;
    const Element = tag as any;
    return <Element {...props} data-source-line={line} />;
  };
  return Tagged as Components[Tag];
}

const TableWithScroll: Components['table'] = ({ node, ...props }) => {
  const line = node?.position?.start.line;
  // Wraps rather than styling <table> directly with overflow-x, so a wide table scrolls
  // horizontally inside the preview instead of overflowing the panel.
  return (
    <div style={{ overflowX: 'auto' }} data-source-line={line}>
      <table {...props} />
    </div>
  );
};

const markdownComponents: Components = {
  h1: withSourceLine('h1'),
  h2: withSourceLine('h2'),
  h3: withSourceLine('h3'),
  h4: withSourceLine('h4'),
  h5: withSourceLine('h5'),
  h6: withSourceLine('h6'),
  p: withSourceLine('p'),
  li: withSourceLine('li'),
  blockquote: withSourceLine('blockquote'),
  pre: withSourceLine('pre'),
  // Tags any raw-HTML <div> that rehype-raw lets through, so it isn't an untagged gap in
  // the scroll-sync line map. Doesn't help block ($$...$$) math, though: rehype-katex
  // deletes its wrapping element entirely and splices in bare <span>s with no position
  // data, so that one stays a (disclosed, accepted) scroll-sync gap regardless of tag.
  div: withSourceLine('div'),
  table: TableWithScroll,
};

// ─── Scroll sync (Monaco ⇄ preview) ────────────────────────────────────────
// Same algorithm as VS Code's scroll-sync.ts: find the two source-line-tagged elements
// bracketing a target line and linearly interpolate a scroll position between them (and
// the inverse: bracket a scroll offset and interpolate back to a fractional source line).
//
// Both directions do this via binary search rather than a linear scan over every tagged
// element. `computePreviewScrollTopForLine` searches purely on `.line` numbers (cheap,
// no DOM access) before measuring just the one bracketing pair. `getLineForPreviewOffset`
// searches on measured position, so it can't avoid `getBoundingClientRect()` entirely, but
// still only measures the ~log2(N) elements it actually probes — not all N on every single
// scroll event, which forces a synchronous layout each time and compounds badly on a long
// document under a fast/continuous scroll gesture (each such reflow is a real cost, and a
// document with hundreds of tagged elements means hundreds of forced layouts per event).

interface TaggedElement { line: number; el: HTMLElement; }

function getTaggedElements(container: HTMLElement): TaggedElement[] {
  const out: TaggedElement[] = [];
  container.querySelectorAll<HTMLElement>('[data-source-line]').forEach((el) => {
    const line = Number(el.getAttribute('data-source-line'));
    if (!Number.isNaN(line)) out.push({ line, el });
  });
  out.sort((a, b) => a.line - b.line);
  return out;
}

// Position of a tagged element relative to previewEl's scrollable content origin
// (independent of the current scroll offset).
function contentTop(previewRect: DOMRect, previewScrollTop: number, target: HTMLElement): number {
  return target.getBoundingClientRect().top - previewRect.top + previewScrollTop;
}

// Largest index whose `.line` is <= targetLine (tagged is sorted ascending by line).
function findLineIndex(tagged: TaggedElement[], targetLine: number): number {
  let lo = 0;
  let hi = tagged.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tagged[mid].line <= targetLine) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function computePreviewScrollTopForLine(previewEl: HTMLElement, tagged: TaggedElement[], targetLine: number): number | null {
  if (tagged.length === 0) return null;
  if (targetLine <= tagged[0].line) return 0;
  const previewRect = previewEl.getBoundingClientRect();
  const scrollTop = previewEl.scrollTop;
  const idx = findLineIndex(tagged, targetLine);
  const prev = tagged[idx];
  const prevTop = contentTop(previewRect, scrollTop, prev.el);
  const next = tagged[idx + 1];
  if (!next) return prevTop;
  const nextTop = contentTop(previewRect, scrollTop, next.el);
  const progress = next.line === prev.line ? 0 : (targetLine - prev.line) / (next.line - prev.line);
  return prevTop + progress * (nextTop - prevTop);
}

// Largest index whose measured top is <= offset. Unlike findLineIndex, this must measure
// (not just compare numbers), so it costs one getBoundingClientRect() per probed candidate
// — O(log N) of them, not one per element in `tagged`.
function findOffsetIndex(previewRect: DOMRect, scrollTop: number, tagged: TaggedElement[], offset: number): number {
  let lo = 0;
  let hi = tagged.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (contentTop(previewRect, scrollTop, tagged[mid].el) <= offset) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function getLineForPreviewOffset(previewEl: HTMLElement, tagged: TaggedElement[], offset: number): number | null {
  if (tagged.length === 0) return null;
  const previewRect = previewEl.getBoundingClientRect();
  const scrollTop = previewEl.scrollTop;
  const firstTop = contentTop(previewRect, scrollTop, tagged[0].el);
  if (offset <= firstTop) return tagged[0].line;
  const idx = findOffsetIndex(previewRect, scrollTop, tagged, offset);
  const prev = tagged[idx];
  const prevTop = contentTop(previewRect, scrollTop, prev.el);
  const next = tagged[idx + 1];
  if (!next) return prev.line;
  const nextTop = contentTop(previewRect, scrollTop, next.el);
  const progress = nextTop === prevTop ? 0 : (offset - prevTop) / (nextTop - prevTop);
  return prev.line + progress * (next.line - prev.line);
}

// Fractional top-of-viewport line, using Monaco's own pixel/line APIs for the sub-line offset.
function getEditorTopFractionalLine(editorInstance: any): number {
  const visible = editorInstance.getVisibleRanges();
  if (!visible || visible.length === 0) return 1;
  const topLine = visible[0].startLineNumber;
  const scrollTop = editorInstance.getScrollTop();
  const lineTop = editorInstance.getTopForLineNumber(topLine);
  const nextLineTop = editorInstance.getTopForLineNumber(topLine + 1);
  const lineHeight = nextLineTop - lineTop || 1;
  return topLine + Math.max(0, (scrollTop - lineTop) / lineHeight);
}

function computeEditorScrollTopForLine(editorInstance: any, targetLine: number): number {
  const floorLine = Math.max(1, Math.floor(targetLine));
  const fraction = targetLine - floorLine;
  const lineTop = editorInstance.getTopForLineNumber(floorLine);
  const nextLineTop = editorInstance.getTopForLineNumber(floorLine + 1);
  return Math.max(0, lineTop + fraction * (nextLineTop - lineTop));
}

// ─── Icons (matching the demo's existing 16x16 stroke-icon convention) ─────

const BoldIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h5a2.5 2.5 0 0 1 0 5H4z" />
    <path d="M4 7h5.5a2.5 2.5 0 0 1 0 5H4z" />
  </svg>
);
const ItalicIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="10" y1="2" x2="6" y2="14" />
    <line x1="6" y1="2" x2="10" y2="2" />
    <line x1="4" y1="14" x2="8" y2="14" />
  </svg>
);
const CodeIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 4 2 8 6 12" />
    <polyline points="10 4 14 8 10 12" />
  </svg>
);
const H1Icon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3v10M2 8h5M7 3v10" />
    <path d="M11 6l2-1v7" />
  </svg>
);
const H2Icon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3v10M2 8h5M7 3v10" />
    <path d="M11 6.5a1.5 1.5 0 1 1 3 1c0 1-1.5 2-3 3.5h3" />
  </svg>
);
const ListIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="2.5" cy="4" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="2.5" cy="8" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="2.5" cy="12" r="0.75" fill="currentColor" stroke="none" />
    <line x1="5.5" y1="4" x2="14" y2="4" />
    <line x1="5.5" y1="8" x2="14" y2="8" />
    <line x1="5.5" y1="12" x2="14" y2="12" />
  </svg>
);
const TocIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="3" x2="14" y2="3" />
    <line x1="2" y1="8" x2="10" y2="8" />
    <line x1="2" y1="13" x2="12" y2="13" />
  </svg>
);

// ─── Table of Contents (Sidebar contribution content) ──────────────────────

interface HeadingInfo {
  level: number;
  text: string;
  id: string;
}

const TocList: React.FC<{ headings: HeadingInfo[]; onSelect: (id: string) => void }> = ({ headings, onSelect }) => {
  if (headings.length === 0) {
    return <div className="sb-empty-state">No headings yet — start writing!</div>;
  }
  return (
    <div className="sb-section">
      <div className="sb-section-title">Table of Contents</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {headings.map((h, i) => (
          <button
            key={`${h.id}-${i}`}
            type="button"
            onClick={() => onSelect(h.id)}
            style={{
              textAlign: 'start',
              background: 'transparent',
              border: 'none',
              color: 'var(--rdd-panel-text)',
              padding: '4px 6px',
              paddingInlineStart: `${6 + (h.level - 1) * 14}px`,
              fontSize: h.level === 1 ? '0.85rem' : '0.8rem',
              opacity: h.level === 1 ? 1 : 0.85,
              cursor: 'pointer',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rdd-panel-card-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {h.text}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Main panel ─────────────────────────────────────────────────────────────

export const MarkdownEditorPanel: React.FC = () => {
  const [value, setValue] = useState(DEFAULT_MARKDOWN);
  const colorScheme = useColorScheme();
  const editorTheme: 'vs-dark' | 'light' = colorScheme === 'light' ? 'light' : 'vs-dark';
  const [ratio, setRatio] = useState(0.5);
  const [headings, setHeadings] = useState<HeadingInfo[]>([]);

  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const taggedElementsRef = useRef<TaggedElement[]>([]);
  // The scrollTop each side most recently set on itself via the OTHER side's sync handler.
  // When that side's own scroll handler fires and observes (approximately) this value, it's
  // recognizing its own echo rather than a genuine independent scroll, and skips forwarding
  // it back — breaking the feedback loop bidirectional sync would otherwise create.
  //
  // Value comparison alone isn't quite enough, though: on a fast burst with direction
  // reversals (scroll down, then immediately up, repeatedly), a second round-trip can get
  // triggered before the first one's echo arrives. That overwrites the expected value, so
  // when the first (now stale) echo does show up, it no longer matches anything we're
  // expecting and gets misread as a genuine new scroll — snapping the other side back to a
  // stale position. The fix is to also make sure at most one round-trip per direction is
  // ever in flight, via requestAnimationFrame coalescing below (editorSyncFrameRef /
  // previewSyncFrameRef) — a burst of real scroll events collapses into one sync per frame,
  // using whatever the latest position is *when the frame fires*, so there's never a second,
  // still-pending expectation for a late echo to conflict with.
  const expectedEditorScrollTopRef = useRef<number | null>(null);
  const expectedPreviewScrollTopRef = useRef<number | null>(null);
  const previewSyncFrameRef = useRef<number | null>(null);
  const editorSyncFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (previewSyncFrameRef.current != null) cancelAnimationFrame(previewSyncFrameRef.current);
      if (editorSyncFrameRef.current != null) cancelAnimationFrame(editorSyncFrameRef.current);
    };
  }, []);

  // Re-scan the rendered preview for headings whenever the source changes — reading the
  // real DOM ids that rehype-slug already assigned, rather than re-deriving our own slugs,
  // so Table of Contents links always resolve to the right element in THIS instance.
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;
    const els = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    setHeadings(
      Array.from(els)
        // Excludes the visually-hidden "Footnotes" section label GFM footnotes inject
        // (<h2 class="sr-only" id="footnote-label">) — a real heading for screen readers,
        // but not something a sighted ToC click should be able to "jump" to.
        .filter(el => !el.classList.contains('sr-only'))
        .map(el => ({
          level: Number(el.tagName[1]),
          text: el.textContent || '',
          id: el.id,
        }))
    );
    taggedElementsRef.current = getTaggedElements(container);
  }, [value]);

  const scrollToHeading = (id: string) => {
    previewRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Draggable divider — mirrors the workspace grid resizer's interaction shape and look
  // (src/components/WindowManager.tsx's handleResizerPointerDown, src/index.css's .rdd-resizer-bar),
  // built on the library's own exported startPointerDrag() primitive.
  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const bar = e.currentTarget;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const startClientX = e.clientX;
    startPointerDrag({
      element: bar,
      pointerId: e.pointerId,
      startClientX,
      startClientY: e.clientY,
      captureStart: () => {},
      activeClasses: [{ el: bar, classes: ['active'] }],
      onMove: (dx) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        // This divider tracks an absolute ratio of the container, not a delta from
        // start — recover the live clientX from the reported delta (startClientX + dx).
        const next = (startClientX + dx - rect.left) / rect.width;
        setRatio(Math.min(0.85, Math.max(0.15, next)));
      },
      onEnd: () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      },
    });
  };

  // Toolbar contribution is stable — every action just reads editorRef.current at click
  // time, so this array never needs to change across renders.
  const toolbarItems = useMemo<ToolbarItem[]>(() => [
    { type: 'action', id: 'md-bold',   label: 'Bold',        icon: BoldIcon,   onClick: () => wrapSelection(editorRef.current, '**') },
    { type: 'action', id: 'md-italic', label: 'Italic',      icon: ItalicIcon, onClick: () => wrapSelection(editorRef.current, '*') },
    { type: 'action', id: 'md-code',   label: 'Inline code', icon: CodeIcon,   onClick: () => wrapSelection(editorRef.current, '`') },
    { type: 'separator' },
    { type: 'action', id: 'md-h1',     label: 'Heading 1',   icon: H1Icon,     onClick: () => prefixLines(editorRef.current, '# ') },
    { type: 'action', id: 'md-h2',     label: 'Heading 2',   icon: H2Icon,     onClick: () => prefixLines(editorRef.current, '## ') },
    { type: 'action', id: 'md-list',   label: 'Bullet list', icon: ListIcon,   onClick: () => prefixLines(editorRef.current, '- ') },
  ], []);

  const sidebarSections = useMemo<PanelSidebarSection[]>(() => [
    { id: 'toc', label: 'Table of Contents', icon: TocIcon, content: <TocList headings={headings} onSelect={scrollToHeading} /> },
  ], [headings]);

  usePanelContribution(useMemo(() => ({ toolbarItems, sidebarSections }), [toolbarItems, sidebarSections]));

  return (
    <div ref={containerRef} className="w-100 h-100 d-flex md-editor-panel" style={{ overflow: 'hidden', position: 'relative' }}>
      <style>{`
        .md-editor-divider:hover,
        .md-editor-divider.active {
          background-color: color-mix(in srgb, var(--rdd-accent-color) 35%, transparent) !important;
          transform: scaleX(2);
        }

        /* Isolates this panel's scroll boundaries from the browser's default overscroll
           chaining/rubber-band handling — without it, a trackpad momentum gesture that
           drives a scroll region into its boundary can "lock" there for the rest of that
           physical gesture, ignoring even reversed wheel input until the gesture ends. */
        .md-editor-panel .monaco-editor .overflow-guard {
          overscroll-behavior: contain;
        }

        /* WindowManager's root sets user-select:none on the whole workspace (to avoid
           accidental text selection while dragging tabs/resizing splits), which panel
           content inherits unless it opts back in — rendered prose should be selectable. */
        .md-preview {
          user-select: text;
        }

        .md-preview table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75em 0;
          font-size: 0.9rem;
        }
        .md-preview th,
        .md-preview td {
          border: 1px solid var(--rdd-panel-card-border);
          padding: 6px 10px;
          text-align: left;
        }
        .md-preview thead th {
          background: color-mix(in srgb, var(--rdd-accent-color) 12%, transparent);
          font-weight: 600;
        }
        .md-preview tbody tr:nth-child(even) {
          background: color-mix(in srgb, var(--rdd-panel-text) 4%, transparent);
        }
        .md-preview blockquote {
          margin: 0.75em 0;
          padding: 4px 12px;
          border-inline-start: 3px solid var(--rdd-accent-color);
          color: color-mix(in srgb, var(--rdd-panel-text) 75%, transparent);
          background: color-mix(in srgb, var(--rdd-panel-text) 4%, transparent);
        }
        .md-preview a {
          color: var(--rdd-accent-color);
          text-decoration: none;
        }
        .md-preview a:hover {
          text-decoration: underline;
        }
        .md-preview li.task-list-item {
          list-style: none;
          margin-inline-start: -1.4em;
        }
        .md-preview li.task-list-item input[type="checkbox"] {
          margin-inline-end: 6px;
        }
        .md-preview pre {
          background: color-mix(in srgb, var(--rdd-panel-text) 6%, transparent);
          border: 1px solid var(--rdd-panel-card-border);
          border-radius: 6px;
          padding: 10px 12px;
          overflow-x: auto;
        }
        .md-preview code {
          font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 0.85em;
        }
        .md-preview pre code {
          background: transparent;
        }
        .md-preview :not(pre) > code {
          background: color-mix(in srgb, var(--rdd-panel-text) 8%, transparent);
          padding: 2px 5px;
          border-radius: 4px;
        }

        /* GFM footnotes (remark-gfm) — structure per micromark-extension-gfm-footnote's
           own docs: <section data-footnotes class="footnotes"><h2 class="sr-only">...  */
        .md-preview .footnotes {
          margin-top: 1.5em;
          padding-top: 0.75em;
          border-top: 1px solid var(--rdd-panel-card-border);
          font-size: 0.85em;
          color: color-mix(in srgb, var(--rdd-panel-text) 75%, transparent);
        }
        .md-preview .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        .md-preview [data-footnote-ref] {
          text-decoration: none;
        }
        .md-preview .data-footnote-backref {
          margin-inline-start: 4px;
        }

        /* KaTeX ($...$ / $$...$$ via remark-math + rehype-katex) — inherit the preview's
           text color instead of KaTeX's own default black, so it matches both themes. */
        .md-preview .katex { color: inherit; }
        .md-preview .katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }

        /* Fenced code-block syntax highlighting (rehype-highlight token classes),
           themed off the panel's own CSS vars rather than a mismatched prebuilt theme. */
        .md-preview .hljs-keyword,
        .md-preview .hljs-selector-tag,
        .md-preview .hljs-literal { color: #c586c0; }
        .md-preview .hljs-string,
        .md-preview .hljs-attr { color: #ce9178; }
        .md-preview .hljs-comment {
          color: color-mix(in srgb, var(--rdd-panel-text) 55%, transparent);
          font-style: italic;
        }
        .md-preview .hljs-number { color: #b5cea8; }
        .md-preview .hljs-title,
        .md-preview .hljs-title.function_,
        .md-preview .hljs-section { color: #dcdcaa; }
        .md-preview .hljs-variable,
        .md-preview .hljs-name { color: var(--rdd-accent-color); }
        .md-preview .hljs-built_in,
        .md-preview .hljs-type { color: #4ec9b0; }

        [data-color-scheme="light"] .md-preview .hljs-keyword,
        [data-color-scheme="light"] .md-preview .hljs-selector-tag,
        [data-color-scheme="light"] .md-preview .hljs-literal { color: #af00db; }
        [data-color-scheme="light"] .md-preview .hljs-string,
        [data-color-scheme="light"] .md-preview .hljs-attr { color: #a31515; }
        [data-color-scheme="light"] .md-preview .hljs-comment {
          color: color-mix(in srgb, var(--rdd-panel-text) 55%, transparent);
        }
        [data-color-scheme="light"] .md-preview .hljs-number { color: #098658; }
        [data-color-scheme="light"] .md-preview .hljs-title,
        [data-color-scheme="light"] .md-preview .hljs-title.function_,
        [data-color-scheme="light"] .md-preview .hljs-section { color: #795e26; }
        [data-color-scheme="light"] .md-preview .hljs-built_in,
        [data-color-scheme="light"] .md-preview .hljs-type { color: #267f99; }
      `}</style>
      <div style={{ width: `${ratio * 100}%`, height: '100%', minWidth: 0 }}>
        <Editor
          height="100%"
          defaultLanguage="markdown"
          theme={editorTheme}
          value={value}
          onChange={(v) => setValue(v ?? '')}
          onMount={(editorInstance) => {
            editorRef.current = editorInstance;
            editorInstance.onDidScrollChange(() => {
              const current = editorInstance.getScrollTop();
              const expected = expectedEditorScrollTopRef.current;
              expectedEditorScrollTopRef.current = null;
              if (expected !== null && Math.abs(current - expected) < 2) return; // our own echo
              // This is a genuine scroll on the editor — cancel any stale pending sync that
              // would otherwise write BACK to the editor a moment from now (scheduled from a
              // previous, now-superseded preview-side burst). Without this, switching which
              // side you're actively scrolling (burst the preview, then immediately burst the
              // editor) can leave a leftover callback that fires just after your fresh input
              // and clobbers it with a stale, unrelated position.
              if (editorSyncFrameRef.current != null) {
                cancelAnimationFrame(editorSyncFrameRef.current);
                editorSyncFrameRef.current = null;
              }
              if (previewSyncFrameRef.current != null) return; // a sync is already queued for this frame
              previewSyncFrameRef.current = requestAnimationFrame(() => {
                previewSyncFrameRef.current = null;
                const previewEl = previewRef.current;
                if (!previewEl) return;
                // Re-read live state now rather than using values captured when this was
                // scheduled — any further scroll events between then and now (the rest of
                // a burst) are folded into this one sync instead of queuing their own.
                const targetLine = getEditorTopFractionalLine(editorInstance);
                const targetTop = computePreviewScrollTopForLine(previewEl, taggedElementsRef.current, targetLine);
                if (targetTop == null) return;
                expectedPreviewScrollTopRef.current = targetTop;
                previewEl.scrollTop = targetTop;
              });
            });
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
      <div
        className="md-editor-divider"
        onPointerDown={handleDividerPointerDown}
        style={{
          width: '1px',
          height: '100%',
          flexShrink: 0,
          cursor: 'col-resize',
          background: 'var(--rdd-panel-card-border)',
          position: 'relative',
          zIndex: 5,
          transition: 'background-color 0.15s ease, transform 0.15s ease',
        }}
      >
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '-3px', width: '8px' }} />
      </div>
      <div
        ref={previewRef}
        className="overflow-auto md-preview"
        style={{ flex: 1, minWidth: 0, height: '100%', padding: '16px', color: 'var(--rdd-panel-text)', backgroundColor: 'var(--rdd-panel-card-bg)', boxSizing: 'border-box', overscrollBehavior: 'contain' }}
        onScroll={() => {
          const previewEl = previewRef.current;
          if (!previewEl) return;
          const current = previewEl.scrollTop;
          const expected = expectedPreviewScrollTopRef.current;
          expectedPreviewScrollTopRef.current = null;
          if (expected !== null && Math.abs(current - expected) < 2) return; // our own echo
          // Genuine scroll on the preview — symmetric to the editor-side handler above:
          // cancel any stale pending sync about to write BACK to the preview from a
          // previous, now-superseded editor-side burst, so it can't clobber this.
          if (previewSyncFrameRef.current != null) {
            cancelAnimationFrame(previewSyncFrameRef.current);
            previewSyncFrameRef.current = null;
          }
          if (editorSyncFrameRef.current != null) return; // a sync is already queued for this frame
          editorSyncFrameRef.current = requestAnimationFrame(() => {
            editorSyncFrameRef.current = null;
            const previewElNow = previewRef.current;
            const editorInstance = editorRef.current;
            if (!previewElNow || !editorInstance) return;
            // Re-read live scrollTop now, not the value captured when this was scheduled —
            // same reasoning as the editor-side handler above.
            const targetLine = getLineForPreviewOffset(previewElNow, taggedElementsRef.current, previewElNow.scrollTop);
            const targetTop = targetLine == null ? null : computeEditorScrollTopForLine(editorInstance, targetLine);
            if (targetTop == null) return;
            expectedEditorScrollTopRef.current = targetTop;
            editorInstance.setScrollTop(targetTop);
          });
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, rehypeSlug, rehypeHighlight, rehypeKatex]}
          components={markdownComponents}
        >{value}</ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownEditorPanel;
