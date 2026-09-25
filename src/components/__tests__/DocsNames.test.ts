/**
 * The README and the guides must only show API that exists. This catches the two ways docs have
 * drifted before: a 6.x name surviving in a sample, and a prop documented on the wrong component
 * (`contextMenuAdapter` on RddDesktop). migration.md is exempt — it names the 6.x API on purpose —
 * and docs-site/api/ is generated from the source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

// The 6.x exports removed in 7.0 (the list ApiSurface.test.ts pins).
const REMOVED_COMPONENTS = ['WindowManager', 'WindowManagerProvider', 'SecondarySidebar', 'Sidebar', 'Toolbar',
  'ToolbarProvider', 'ModalStackRenderer', 'SidePanelRenderer', 'LeftPanelRenderer', 'RightPanelRenderer',
  'ToastContainer', 'ConfirmationForm', 'ContextMenu', 'ContextMenuProvider', 'PanelProvider',
  'PanelContributionProvider', 'FormContainerProvider', 'PanelOverlayRoot', 'PanelToolbar', 'PanelFloatingWindow',
  'ToolbarButton', 'ToolbarToggle', 'ToolbarSearchInput'];
const REMOVED_OTHER = ['WorkspaceClient', 'DefaultContextMenuAdapter', 'FormContainerContext', 'useWindowManagerState',
  'useWindowManagerActions', 'useRegistry', 'usePanelContext', 'useFormContainer', 'usePanelId', 'usePanelActions',
  'usePanelState', 'usePanelFloatingWindow', 'usePanelFloatingWindowManager', 'useShowContextMenu',
  'useActivePanelContribution', 'usePredefinedMessages', 'useStyleClasses', 'sidebarSectionToTab',
  'defaultPredefinedMessages', 'PanelRegistryClass'];

function docFiles(): string[] {
  const out = [join(ROOT, 'README.md')];
  const walk = (d: string) => readdirSync(d).forEach(n => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (!['api', 'node_modules', '.vitepress', 'public'].includes(n)) walk(p); }
    else if (n.endsWith('.md') && n !== 'migration.md') out.push(p);
  });
  walk(join(ROOT, 'docs-site'));
  return out;
}

/** Fenced blocks and inline code spans — where API is shown, as opposed to prose about it. */
function codeOf(md: string): string {
  const blocks = [...md.matchAll(/```[\s\S]*?```/g)].map(m => m[0]);
  const inline = [...md.replace(/```[\s\S]*?```/g, '').matchAll(/`[^`\n]+`/g)].map(m => m[0]);
  return [...blocks, ...inline].join('\n');
}

const rddDesktopProps = (): string[] => {
  const src = readFileSync(join(ROOT, 'src', 'components', 'WindowManager.tsx'), 'utf8');
  const body = src.slice(src.indexOf('export interface RddDesktopProps'), src.indexOf('}', src.indexOf('export interface RddDesktopProps')));
  return [...body.matchAll(/^\s+(\w+)\??:/gm)].map(m => m[1]);
};

describe('docs name only API that exists', () => {
  it('no sample uses a removed 6.x component, hook or export', () => {
    const hits: string[] = [];
    for (const f of docFiles()) {
      const code = codeOf(readFileSync(f, 'utf8'));
      for (const n of REMOVED_COMPONENTS) if (new RegExp(`<${n}[\\s/>]`).test(code)) hits.push(`${relative(ROOT, f)}: <${n}>`);
      for (const n of REMOVED_OTHER) if (new RegExp(`\\b${n}\\b`).test(code)) hits.push(`${relative(ROOT, f)}: ${n}`);
      for (const m of code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]react-dockable-desktop['"]/g)) {
        for (const name of m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '')).filter(Boolean)) {
          if (REMOVED_COMPONENTS.includes(name) || REMOVED_OTHER.includes(name)) hits.push(`${relative(ROOT, f)}: import ${name}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('every RddDesktop prop the docs show exists', () => {
    const real = new Set(rddDesktopProps());
    expect(real.size).toBeGreaterThan(2);
    const hits: string[] = [];
    for (const f of docFiles()) {
      const md = readFileSync(f, 'utf8');
      for (const m of codeOf(md).matchAll(/<RddDesktop\b([^>]*)>/g)) {
        for (const a of m[1].matchAll(/(\w+)=/g)) if (!real.has(a[1])) hits.push(`${relative(ROOT, f)}: <RddDesktop ${a[1]}=>`);
      }
      // Rows of a props table under a heading that names RddDesktop's props.
      for (const sec of md.split(/^#+ /m).filter(s => /^[^\n]*RddDesktop[^\n]*props/i.test(s))) {
        for (const row of sec.matchAll(/^\|\s*`(\w+)`\s*\|/gm)) if (!real.has(row[1])) hits.push(`${relative(ROOT, f)}: RddDesktop props table row ${row[1]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
