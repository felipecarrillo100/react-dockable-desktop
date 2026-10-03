import React, { useEffect, useState } from 'react';
import {
  RddPanelOverlay,
  RddPanelToolbar,
  RddToolbarButton,
  RddToolbarToggle,
  RddToolbarSeparator,
} from '../src/index';
import type { ButtonVariant, ToolbarVariant } from '../src/index';

/*
 * Review page for the toolbar button spec (7.5.0): every buttonVariant in every state, over light,
 * dark and busy content, with live controls for the icon size tokens. The icons below deliberately
 * keep width="16" height="16" attributes — the library's tokens must override them.
 */

const svg = (d: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const SaveIcon = svg(<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>);
const GridIcon = svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>);
const LayersIcon = svg(<><path d="m12 2 10 5-10 5L2 7l10-5z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>);
const RulerIcon = svg(<><path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z" /><path d="m7.5 10.5 2 2M10.5 7.5l2 2M13.5 13.5l2 2M16.5 10.5l2 2" /></>);
const ClockIcon = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>);
const TrashIcon = svg(<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>);
/** Stands in for an icon-font glyph (Bootstrap Icons, Font Awesome webfont, Material Symbols): sized by font-size. */
const FontGlyph = <i aria-hidden="true" style={{ fontStyle: 'normal' }}>★</i>;

const VARIANTS: ButtonVariant[] = ['ghost', 'soft', 'outlined', 'filled'];

const BACKGROUNDS: Record<string, string> = {
  light: '#eef1f4',
  dark: '#101217',
  busy:
    'radial-gradient(circle at 15% 30%, #f6d365 0 12%, transparent 13%),' +
    'radial-gradient(circle at 70% 60%, #3a6073 0 18%, transparent 19%),' +
    'repeating-linear-gradient(45deg, #fafafa 0 14px, #1d2b3a 14px 28px, #7fb069 28px 42px)',
};

/** Sets a token on every element that declares skin tokens, so the value wins over the skin's own. */
function setToken(name: string, value: string | null) {
  const targets = [document.documentElement, ...Array.from(document.querySelectorAll<HTMLElement>('[data-rdd-skin]'))];
  for (const el of targets) {
    if (value === null) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
  }
}

function Strip({ variant, buttonVariant }: { variant: ToolbarVariant; buttonVariant: ButtonVariant }) {
  const [grid, setGrid] = useState(true);
  const [layers, setLayers] = useState(false);
  const [ruler, setRuler] = useState(true);
  const [clock, setClock] = useState(false);
  const [star, setStar] = useState(true);
  return (
    <RddPanelToolbar position="top" variant={variant} buttonVariant={buttonVariant}>
      <RddToolbarButton icon={SaveIcon} title="Save (action)" onClick={() => {}} />
      <RddToolbarToggle icon={GridIcon} title={`Grid (toggle, ${grid ? 'on' : 'off'})`} active={grid} onToggle={() => setGrid(v => !v)} />
      <RddToolbarToggle icon={LayersIcon} title={`Layers (toggle, ${layers ? 'on' : 'off'})`} active={layers} onToggle={() => setLayers(v => !v)} />
      <RddToolbarToggle icon={RulerIcon} title={`Ruler (toggle, ${ruler ? 'on' : 'off'})`} active={ruler} onToggle={() => setRuler(v => !v)} />
      <RddToolbarToggle icon={ClockIcon} title={`Time (toggle, ${clock ? 'on' : 'off'})`} active={clock} onToggle={() => setClock(v => !v)} />
      <RddToolbarSeparator />
      <RddToolbarToggle icon={FontGlyph} title={`Font glyph (toggle, ${star ? 'on' : 'off'})`} active={star} onToggle={() => setStar(v => !v)} />
      <RddToolbarButton icon={TrashIcon} title="Delete (disabled)" disabled onClick={() => {}} />
      <RddToolbarToggle icon={GridIcon} title="Toggle on, disabled" active disabled onToggle={() => {}} />
    </RddPanelToolbar>
  );
}

export function ToolbarButtonsPanel() {
  const [variant, setVariant] = useState<ToolbarVariant>('transparent');
  const [bg, setBg] = useState<keyof typeof BACKGROUNDS>('busy');
  const [panelIcon, setPanelIcon] = useState(20);
  const [chromeIcon, setChromeIcon] = useState(22);
  const [solidToggle, setSolidToggle] = useState(false);

  useEffect(() => { setToken('--rdd-panel-toolbar-icon-size', `${panelIcon}px`); }, [panelIcon]);
  useEffect(() => { setToken('--rdd-chrome-icon-size', `${chromeIcon}px`); }, [chromeIcon]);
  useEffect(() => {
    // Alternative workspace-toggle "on" look, for comparison: the same solid chip the panel toolbar uses.
    setToken('--rdd-toolbar-btn-toggle-active-bg', solidToggle ? 'var(--rdd-accent-color)' : null);
    setToken('--rdd-toolbar-btn-toggle-active-color', solidToggle ? 'var(--rdd-panel-toolbar-btn-active-color)' : null);
    setToken('--rdd-toolbar-btn-toggle-active-border', solidToggle ? 'transparent' : null);
  }, [solidToggle]);
  // Leave the workspace as we found it when the panel closes.
  useEffect(() => () => {
    for (const t of ['--rdd-panel-toolbar-icon-size', '--rdd-chrome-icon-size', '--rdd-toolbar-btn-toggle-active-bg',
      '--rdd-toolbar-btn-toggle-active-color', '--rdd-toolbar-btn-toggle-active-border']) setToken(t, null);
  }, []);

  const label: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '8px 12px', alignItems: 'center' }}>
        <label style={label}>Strip
          <select value={variant} onChange={e => setVariant(e.target.value as ToolbarVariant)}>
            <option value="transparent">transparent</option>
            <option value="frosted">frosted</option>
            <option value="solid">solid</option>
          </select>
        </label>
        <label style={label}>Content
          <select value={bg} onChange={e => setBg(e.target.value)}>
            {Object.keys(BACKGROUNDS).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label style={label}>Panel icon {panelIcon}px
          <input type="range" min={14} max={24} value={panelIcon} onChange={e => setPanelIcon(+e.target.value)} />
        </label>
        <label style={label}>Chrome icon {chromeIcon}px
          <input type="range" min={14} max={26} value={chromeIcon} onChange={e => setChromeIcon(+e.target.value)} />
        </label>
        <label style={label}>
          <input type="checkbox" checked={solidToggle} onChange={e => setSolidToggle(e.target.checked)} />
          Workspace toggle "on": solid (instead of tint + edge)
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12, padding: 12 }}>
        {VARIANTS.map(v => (
          <div key={v}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>buttonVariant="{v}"</div>
            <div style={{ position: 'relative', height: 120, borderRadius: 6, overflow: 'hidden', background: BACKGROUNDS[bg] }}>
              <RddPanelOverlay style={{ width: '100%', height: '100%', position: 'relative' }}>
                <Strip variant={variant} buttonVariant={v} />
              </RddPanelOverlay>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
