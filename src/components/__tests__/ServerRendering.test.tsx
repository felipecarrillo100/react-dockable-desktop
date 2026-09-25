// @vitest-environment node
/**
 * Server rendering (Next.js pre-renders even 'use client' components, Remix, plain renderToString).
 * With no DOM, rendering used to throw `document is not defined` from two places: the colour
 * scheme reader behind <WindowManager>, and <ToastContainer>'s portal. The chrome must render on
 * the server; panels mount on the client.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  DockableDesktopProvider, RddDesktop, RddSidebar, RddToasts, RddToolbar,
  RddSidePanels, RddModals, createWorkspace, useColorScheme,
} from '../../index';

const Mock: React.FC = () => <div>mock</div>;

describe('server rendering (no DOM)', () => {
  it('runs without a DOM (sanity check for this suite)', () => {
    expect(typeof document).toBe('undefined');
  });

  it('DockableDesktopProvider + RddDesktop', () => {
    const workspace = createWorkspace({ panels: { m: { component: Mock } } });
    const html = renderToString(<DockableDesktopProvider workspace={workspace}><RddDesktop /></DockableDesktopProvider>);
    expect(html).toContain('rdd-workspace');
  });

  it('RddDesktop with open panels — docked, floating and minimized — renders its chrome', () => {
    const workspace = createWorkspace({ panels: { m: { component: Mock } } });
    workspace.openPanel('docked', 'm', { title: 'Docked One' });
    workspace.openPanel('float', 'm', { title: 'Float Two', initialTarget: 'floating' });
    workspace.openPanel('mini', 'm', { title: 'Mini Three' });
    workspace.minimizePanel('mini');
    const html = renderToString(<DockableDesktopProvider workspace={workspace}><RddDesktop /></DockableDesktopProvider>);
    expect(html).toContain('Docked One');
    expect(html).toContain('Float Two');
  });

  it('RddDesktop inside an RddSidebar', () => {
    const html = renderToString(
      <DockableDesktopProvider>
        <RddSidebar tabs={[{ id: 't', label: 'T', icon: <span />, renderContent: () => <div /> }]}><RddDesktop /></RddSidebar>
      </DockableDesktopProvider>,
    );
    expect(html).toContain('rdd-workspace');
  });

  it('RddToasts renders nothing on the server (it portals once mounted)', () => {
    expect(renderToString(<RddToasts />)).toBe('');
    expect(renderToString(<RddToasts adapter={{ show: () => {}, update: () => {}, dismiss: () => {}, Container: () => <div /> }} />)).toBe('');
  });

  it('the overlay hosts and the toolbar', () => {
    const html = renderToString(
      <DockableDesktopProvider>
        <RddToolbar items={[{ type: 'action', id: 'a', label: 'A', icon: <span />, onClick: () => {} }]} />
        <RddSidePanels />
        <RddModals />
      </DockableDesktopProvider>,
    );
    expect(html).toContain('rdd-toolbar-strip');
  });

  it("useColorScheme reports 'dark' on the server", () => {
    const Probe = () => <span>{useColorScheme()}</span>;
    expect(renderToString(<Probe />)).toBe('<span>dark</span>');
  });
});
