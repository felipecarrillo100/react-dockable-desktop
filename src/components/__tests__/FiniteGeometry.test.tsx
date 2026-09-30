/**
 * A saved window's geometry is made finite on load (7.4.0). JSON has no NaN — a NaN is saved as
 * `null` — and `1e999` parses as Infinity, so a saved layout can carry numbers a window can't be
 * drawn at. They reached the window's style: React logged "`NaN` is an invalid value for the
 * `left` css style property" at every start-up (a consumer's field report). Each is now replaced
 * by the default a new floating window gets, with a development warning naming the window.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerActions, useWindowManagerState } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import { globalPanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';

globalPanelRegistry.register('finiteProbe', () => <div />);

const LAYOUT = `{
  "version": 2,
  "gridRoot": { "type": "leaf", "id": "g", "panels": ["a"], "activePanelId": "a" },
  "floating": [
    { "id": "w1", "x": null, "y": 1e999, "height": 200, "z": 101 },
    { "id": "w2", "x": 40, "y": 60, "width": 320, "height": 240, "z": 102 }
  ],
  "minimized": [],
  "panels": {
    "a":  { "id": "a",  "title": "A",  "component": "finiteProbe", "state": "docked" },
    "w1": { "id": "w1", "title": "W1", "component": "finiteProbe", "state": "floating" },
    "w2": { "id": "w2", "title": "W2", "component": "finiteProbe", "state": "floating" }
  }
}`;

let actions: ReturnType<typeof useWindowManagerActions>;
let state: ReturnType<typeof useWindowManagerState>;
const Grab: React.FC = () => { actions = useWindowManagerActions(); state = useWindowManagerState(); return null; };

describe('finite window geometry on load', () => {
  let container: HTMLDivElement;
  let root: Root;
  const env = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { root = createRoot(container); root.render(<WindowManagerProvider><PanelProvider><Grab /><WindowManager /></PanelProvider></WindowManagerProvider>); });
  });
  afterEach(() => {
    process.env.NODE_ENV = env;
    act(() => root.unmount());
    container.remove();
    document.getElementById('preserved-dom-container')?.remove();
    vi.restoreAllMocks();
  });

  it('replaces null, Infinity and missing numbers with the default a new window gets, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => { expect(actions.loadLayout(LAYOUT)).toBe(true); });
    const w1 = state.floating.find(w => w.id === 'w1')!;
    const w2 = state.floating.find(w => w.id === 'w2')!;
    expect([w1.x, w1.y, w1.width, w1.height]).toEqual([300, 150, 450, 200]);
    expect([w2.x, w2.y, w2.width, w2.height]).toEqual([40, 60, 320, 240]); // a valid window is untouched
    const messages = warn.mock.calls.map(c => String(c[0])).join('\n');
    expect(messages).toMatch(/floating window "w1" had x = null/);
    expect(messages).toMatch(/floating window "w1" had y = Infinity/);
    expect(messages).toMatch(/floating window "w1" had width = undefined/);
    expect(messages).not.toMatch(/"w2"/);
    // Nothing non-finite reaches a style: React reports that with console.error.
    expect(error.mock.calls.map(c => String(c[0])).filter(m => /NaN|Infinity|invalid value/.test(m))).toEqual([]);
    const style = (container.querySelector('[data-rdd-window="w1"]') as HTMLElement | null)?.getAttribute('style') ?? '';
    expect(style).not.toMatch(/NaN|Infinity/);
  });
});
