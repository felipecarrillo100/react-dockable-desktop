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
  DockableDesktopProvider, WindowManager, Sidebar, ToastContainer, Toolbar,
  SidePanelRenderer, ModalStackRenderer, WorkspaceClient, useColorScheme,
} from '../../index';

const Mock: React.FC = () => <div>mock</div>;

describe('server rendering (no DOM)', () => {
  it('runs without a DOM (sanity check for this suite)', () => {
    expect(typeof document).toBe('undefined');
  });

  it('DockableDesktopProvider + WindowManager', () => {
    const client = new WorkspaceClient({ panels: { m: { component: Mock } } });
    const html = renderToString(<DockableDesktopProvider client={client}><WindowManager /></DockableDesktopProvider>);
    expect(html).toContain('rdd-workspace');
  });

  it('WindowManager inside a Sidebar', () => {
    const html = renderToString(
      <DockableDesktopProvider>
        <Sidebar tabs={[{ id: 't', label: 'T', icon: <span />, renderContent: () => <div /> }]}><WindowManager /></Sidebar>
      </DockableDesktopProvider>,
    );
    expect(html).toContain('rdd-workspace');
  });

  it('ToastContainer renders nothing on the server (it portals once mounted)', () => {
    expect(renderToString(<ToastContainer />)).toBe('');
    expect(renderToString(<ToastContainer adapter={{ show: () => {}, update: () => {}, dismiss: () => {}, Container: () => <div /> }} />)).toBe('');
  });

  it('the overlay hosts and the toolbar', () => {
    const html = renderToString(
      <DockableDesktopProvider>
        <Toolbar items={[{ type: 'action', id: 'a', label: 'A', icon: <span />, onClick: () => {} }]} />
        <SidePanelRenderer />
        <ModalStackRenderer />
      </DockableDesktopProvider>,
    );
    expect(html).toContain('rdd-toolbar-strip');
  });

  it("useColorScheme reports 'dark' on the server", () => {
    const Probe = () => <span>{useColorScheme()}</span>;
    expect(renderToString(<Probe />)).toBe('<span>dark</span>');
  });
});
