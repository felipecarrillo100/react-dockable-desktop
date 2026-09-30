/**
 * Title thunks (7.4.0). A title may be a function returning the text: it is called each time the
 * title is rendered, so a title built with the app's own translation function follows a language
 * change. Before, `title: t('panel.layers')` type-checked and then froze in whatever language was
 * active when the panel opened (reported by a consumer). A function can't be saved: a restored
 * panel takes its registered default title.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerActions, useWindowManagerState, formatLabel } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import { globalPanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';

let lang: 'en' | 'de' = 'en';
const t = (key: string) => ({ en: { layers: 'Layers', notes: 'Notes' }, de: { layers: 'Ebenen', notes: 'Notizen' } })[lang][key as 'layers'];

const Empty: React.FC = () => <div />;
globalPanelRegistry.register('thunkTitled', Empty, { title: () => t('notes') });
globalPanelRegistry.register('thunkPlain', Empty);

let actions: ReturnType<typeof useWindowManagerActions>;
let state: ReturnType<typeof useWindowManagerState>;
const Grab: React.FC = () => { actions = useWindowManagerActions(); state = useWindowManagerState(); return null; };

describe('title thunks', () => {
  let container: HTMLDivElement;
  let root: Root;

  // A new formatter per language, as an app's i18n bridge hands the provider on a language switch.
  const render = () => root.render(
    <WindowManagerProvider formatMessage={(d) => `${lang}:${d.id}`}>
      <PanelProvider><Grab /><WindowManager /></PanelProvider>
    </WindowManagerProvider>,
  );

  beforeEach(() => {
    lang = 'en';
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { root = createRoot(container); render(); });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.getElementById('preserved-dom-container')?.remove();
  });

  const tabText = (id: string) => container.querySelector(`[data-rdd-tab="${id}"]`)?.textContent ?? '';

  it('formatLabel calls a function label', () => {
    expect(formatLabel(() => 'called', () => 'formatter')).toBe('called');
  });

  it('renders the thunk, and follows a language change', () => {
    act(() => { actions.openPanel('a', 'thunkPlain', { title: () => t('layers') }); });
    expect(tabText('a')).toContain('Layers');
    lang = 'de';
    act(() => render());
    expect(tabText('a')).toContain('Ebenen');
  });

  it('setTitle accepts a thunk', () => {
    act(() => { actions.openPanel('b', 'thunkPlain', { title: 'Static' }); });
    act(() => { actions.updatePanelTitle('b', () => t('notes')); });
    expect(tabText('b')).toContain('Notes');
  });

  it('a saved layout omits a function title; the restored panel takes its registered default', () => {
    act(() => { actions.openPanel('c', 'thunkTitled', { title: () => t('layers') }); });
    const json = actions.saveLayout();
    const saved = JSON.parse(json);
    expect('title' in saved.panels.c).toBe(false);
    act(() => { actions.loadLayout(json); });
    expect(typeof state.panels.c.title).toBe('function');
    expect(tabText('c')).toContain('Notes');
    lang = 'de';
    act(() => render());
    expect(tabText('c')).toContain('Notizen');
  });

  it('a panel type registered without a title restores with its id', () => {
    act(() => { actions.openPanel('d', 'thunkPlain', { title: () => t('layers') }); });
    const json = actions.saveLayout();
    act(() => { actions.loadLayout(json); });
    expect(state.panels.d.title).toBe('d');
  });
});
