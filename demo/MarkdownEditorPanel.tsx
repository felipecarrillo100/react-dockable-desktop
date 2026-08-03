import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import { usePanelContribution } from '../src/index';
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
  table: TableWithScroll,
};

// ─── Scroll sync (Monaco ⇄ preview) ────────────────────────────────────────
// Same algorithm as VS Code's scroll-sync.ts: find the two source-line-tagged elements
// bracketing a target line and linearly interpolate a scroll position between them (and
// the inverse: bracket a scroll offset and interpolate back to a fractional source line).

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
function contentTop(previewEl: HTMLElement, target: HTMLElement): number {
  const previewRect = previewEl.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return targetRect.top - previewRect.top + previewEl.scrollTop;
}

function scrollPreviewToLine(previewEl: HTMLElement, tagged: TaggedElement[], targetLine: number): void {
  if (tagged.length === 0) return;
  if (targetLine <= tagged[0].line) {
    previewEl.scrollTop = 0;
    return;
  }
  let prev = tagged[0];
  let next: TaggedElement | undefined;
  for (const entry of tagged) {
    if (entry.line <= targetLine) prev = entry;
    else { next = entry; break; }
  }
  const prevTop = contentTop(previewEl, prev.el);
  if (!next) {
    previewEl.scrollTop = prevTop;
    return;
  }
  const nextTop = contentTop(previewEl, next.el);
  const progress = next.line === prev.line ? 0 : (targetLine - prev.line) / (next.line - prev.line);
  previewEl.scrollTop = prevTop + progress * (nextTop - prevTop);
}

function getLineForPreviewOffset(previewEl: HTMLElement, tagged: TaggedElement[], offset: number): number | null {
  if (tagged.length === 0) return null;
  const positions = tagged.map((t) => ({ line: t.line, top: contentTop(previewEl, t.el) }));
  if (offset <= positions[0].top) return positions[0].line;
  for (let i = 0; i < positions.length - 1; i++) {
    const cur = positions[i];
    const next = positions[i + 1];
    if (offset >= cur.top && offset <= next.top) {
      const progress = next.top === cur.top ? 0 : (offset - cur.top) / (next.top - cur.top);
      return cur.line + progress * (next.line - cur.line);
    }
  }
  return positions[positions.length - 1].line;
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

function setEditorScrollForLine(editorInstance: any, targetLine: number): void {
  const floorLine = Math.max(1, Math.floor(targetLine));
  const fraction = targetLine - floorLine;
  const lineTop = editorInstance.getTopForLineNumber(floorLine);
  const nextLineTop = editorInstance.getTopForLineNumber(floorLine + 1);
  editorInstance.setScrollTop(Math.max(0, lineTop + fraction * (nextLineTop - lineTop)));
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
              color: 'var(--panel-text)',
              padding: '4px 6px',
              paddingInlineStart: `${6 + (h.level - 1) * 14}px`,
              fontSize: h.level === 1 ? '0.85rem' : '0.8rem',
              opacity: h.level === 1 ? 1 : 0.85,
              cursor: 'pointer',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-card-bg)'; }}
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
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [ratio, setRatio] = useState(0.5);
  const [headings, setHeadings] = useState<HeadingInfo[]>([]);

  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const taggedElementsRef = useRef<TaggedElement[]>([]);
  // Which side is the active driver of an in-flight programmatic scroll — the other
  // side's handler consumes it (once) and skips forwarding, breaking the feedback loop
  // that bidirectional sync would otherwise create.
  const syncSourceRef = useRef<'editor' | 'preview' | null>(null);

  useEffect(() => {
    const updateTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-color-scheme');
      setEditorTheme(currentTheme === 'light' ? 'light' : 'vs-dark');
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });
    return () => observer.disconnect();
  }, []);

  // Re-scan the rendered preview for headings whenever the source changes — reading the
  // real DOM ids that rehype-slug already assigned, rather than re-deriving our own slugs,
  // so Table of Contents links always resolve to the right element in THIS instance.
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;
    const els = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    setHeadings(Array.from(els).map(el => ({
      level: Number(el.tagName[1]),
      text: el.textContent || '',
      id: el.id,
    })));
    taggedElementsRef.current = getTaggedElements(container);
  }, [value]);

  const scrollToHeading = (id: string) => {
    previewRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Draggable divider — mirrors the workspace grid resizer's interaction shape and look
  // (src/components/WindowManager.tsx's handleResizerPointerDown, src/index.css's .resizer-bar),
  // hand-rolled here rather than imported since it's internal, unexported library code.
  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (me: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = (me.clientX - rect.left) / rect.width;
      setRatio(Math.min(0.85, Math.max(0.15, next)));
    };
    const onUp = () => {
      bar.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', onUp);
      bar.removeEventListener('pointercancel', onUp);
    };
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', onUp);
    bar.addEventListener('pointercancel', onUp);
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
    <div ref={containerRef} className="w-100 h-100 d-flex" style={{ overflow: 'hidden', position: 'relative' }}>
      <style>{`
        .md-editor-divider:hover,
        .md-editor-divider.active {
          background-color: color-mix(in srgb, var(--accent-color) 35%, transparent) !important;
          transform: scaleX(2);
        }

        .md-preview table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75em 0;
          font-size: 0.9rem;
        }
        .md-preview th,
        .md-preview td {
          border: 1px solid var(--panel-card-border);
          padding: 6px 10px;
          text-align: left;
        }
        .md-preview thead th {
          background: color-mix(in srgb, var(--accent-color) 12%, transparent);
          font-weight: 600;
        }
        .md-preview tbody tr:nth-child(even) {
          background: color-mix(in srgb, var(--panel-text) 4%, transparent);
        }
        .md-preview blockquote {
          margin: 0.75em 0;
          padding: 4px 12px;
          border-inline-start: 3px solid var(--accent-color);
          color: color-mix(in srgb, var(--panel-text) 75%, transparent);
          background: color-mix(in srgb, var(--panel-text) 4%, transparent);
        }
        .md-preview a {
          color: var(--accent-color);
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
          background: color-mix(in srgb, var(--panel-text) 6%, transparent);
          border: 1px solid var(--panel-card-border);
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
          background: color-mix(in srgb, var(--panel-text) 8%, transparent);
          padding: 2px 5px;
          border-radius: 4px;
        }

        /* Fenced code-block syntax highlighting (rehype-highlight token classes),
           themed off the panel's own CSS vars rather than a mismatched prebuilt theme. */
        .md-preview .hljs-keyword,
        .md-preview .hljs-selector-tag,
        .md-preview .hljs-literal { color: #c586c0; }
        .md-preview .hljs-string,
        .md-preview .hljs-attr { color: #ce9178; }
        .md-preview .hljs-comment {
          color: color-mix(in srgb, var(--panel-text) 55%, transparent);
          font-style: italic;
        }
        .md-preview .hljs-number { color: #b5cea8; }
        .md-preview .hljs-title,
        .md-preview .hljs-title.function_,
        .md-preview .hljs-section { color: #dcdcaa; }
        .md-preview .hljs-variable,
        .md-preview .hljs-name { color: var(--accent-color); }
        .md-preview .hljs-built_in,
        .md-preview .hljs-type { color: #4ec9b0; }

        [data-color-scheme="light"] .md-preview .hljs-keyword,
        [data-color-scheme="light"] .md-preview .hljs-selector-tag,
        [data-color-scheme="light"] .md-preview .hljs-literal { color: #af00db; }
        [data-color-scheme="light"] .md-preview .hljs-string,
        [data-color-scheme="light"] .md-preview .hljs-attr { color: #a31515; }
        [data-color-scheme="light"] .md-preview .hljs-comment {
          color: color-mix(in srgb, var(--panel-text) 55%, transparent);
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
              if (syncSourceRef.current === 'preview') {
                syncSourceRef.current = null;
                return;
              }
              const previewEl = previewRef.current;
              if (!previewEl) return;
              const targetLine = getEditorTopFractionalLine(editorInstance);
              syncSourceRef.current = 'editor';
              scrollPreviewToLine(previewEl, taggedElementsRef.current, targetLine);
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
          background: 'var(--panel-card-border)',
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
        style={{ flex: 1, minWidth: 0, height: '100%', padding: '16px', color: 'var(--panel-text)', backgroundColor: 'var(--panel-card-bg)', boxSizing: 'border-box' }}
        onScroll={() => {
          if (syncSourceRef.current === 'editor') {
            syncSourceRef.current = null;
            return;
          }
          const editorInstance = editorRef.current;
          const previewEl = previewRef.current;
          if (!editorInstance || !previewEl) return;
          const targetLine = getLineForPreviewOffset(previewEl, taggedElementsRef.current, previewEl.scrollTop);
          if (targetLine == null) return;
          syncSourceRef.current = 'preview';
          setEditorScrollForLine(editorInstance, targetLine);
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug, rehypeHighlight]} components={markdownComponents}>{value}</ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownEditorPanel;
