import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider } from '../WindowManagerContext';
import { PanelProvider, usePanelState, usePanelActions } from '../PanelProviderContext';
import ModalStackRenderer from '../ModalStackRenderer';
import SidePanelRenderer from '../SidePanelRenderer';
import ConfirmationForm from '../../forms/ConfirmationForm';

const TestComponent: React.FC<{ panelId: string; message?: string }> = ({ panelId, message }) => {
  return (
    <div id={`panel-content-${panelId}`}>
      <span className="msg-span">{message || 'Default'}</span>
    </div>
  );
};

let testActions: any = null;
let testState: any = null;

const StateHelper: React.FC = () => {
  testState = usePanelState();
  testActions = usePanelActions();
  return null;
};

describe('Panel System (Side Panels & Nested Modals)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    testActions = null;
    testState = null;
  });

  afterEach(() => {
    if (root) {
      act(() => { root!.unmount(); });
    }
    if (container) {
      document.body.removeChild(container);
    }
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelProvider>
            <StateHelper />
            <SidePanelRenderer />
            <ModalStackRenderer />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
  };

  it('should support opening left and right side panels with dynamic props', async () => {
    mount();

    let leftId: string | null = null;
    await act(async () => {
      leftId = await testActions.openLeftPanel(TestComponent, { message: 'Hello Left' }, { title: 'Left Drawer' });
    });

    expect(leftId).not.toBeNull();
    expect(testState.leftPanel).not.toBeNull();
    expect(testState.leftPanel.id).toBe(leftId);
    expect(testState.leftPanel.props.message).toBe('Hello Left');

    const leftTitle = container!.querySelector('.rdd-side-panel-left .rdd-side-panel-title');
    expect(leftTitle?.textContent).toBe('Left Drawer');
    const leftMsg = container!.querySelector('.rdd-side-panel-left .msg-span');
    expect(leftMsg?.textContent).toBe('Hello Left');
    
    // Assert left panel width defaults to 400px
    const leftPanelEl = container!.querySelector('.rdd-side-panel-left') as HTMLElement;
    expect(leftPanelEl.style.width).toBe('400px');

    // Open right panel with custom width 550px
    let rightId: string | null = null;
    await act(async () => {
      rightId = await testActions.openRightPanel(TestComponent, { message: 'Hello Right' }, { title: 'Right Drawer', width: 550 });
    });

    expect(rightId).not.toBeNull();
    expect(testState.rightPanel).not.toBeNull();
    expect(testState.rightPanel.id).toBe(rightId);
    expect(testState.rightPanel.props.message).toBe('Hello Right');

    // Assert right panel width respects custom override
    const rightPanelEl = container!.querySelector('.rdd-side-panel-right') as HTMLElement;
    expect(rightPanelEl.style.width).toBe('550px');
  });

  it('should support nested stacked modals and track their sizes and headers', () => {
    mount();

    act(() => {
      testActions.openModal(TestComponent, { message: 'Modal 1' }, { title: 'First Modal', size: 'small' });
    });
    expect(testState.modals.length).toBe(1);
    expect(testState.modals[0].options.title).toBe('First Modal');

    // Add nested second modal
    act(() => {
      testActions.openModal(TestComponent, { message: 'Modal 2' }, { title: 'Second Modal', size: 'large' });
    });
    expect(testState.modals.length).toBe(2);

    const overlays = container!.querySelectorAll('.rdd-modal-overlay');
    expect(overlays.length).toBe(2);
    expect(overlays[0].querySelector('.rdd-modal-title')?.textContent).toBe('First Modal');
    expect(overlays[1].querySelector('.rdd-modal-title')?.textContent).toBe('Second Modal');
  });

  it('should route Escape key closes to topmost modal, and to side drawers only if modals stack is empty', async () => {
    mount();

    // 1. Open a left side panel
    let leftId: string | null = null;
    await act(async () => {
      leftId = await testActions.openLeftPanel(TestComponent, { message: 'Left' }, { title: 'Left Drawer' });
    });

    // 2. Open two stacked modals
    act(() => {
      testActions.openModal(TestComponent, { message: 'Modal 1' }, { title: 'Modal 1' });
      testActions.openModal(TestComponent, { message: 'Modal 2' }, { title: 'Modal 2' });
    });

    expect(testState.leftPanel).not.toBeNull();
    expect(testState.modals.length).toBe(2);

    // 3. Dispatch Escape keydown - should close only Modal 2 (topmost active)
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    await act(async () => {
      document.dispatchEvent(escEvent);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(testState.modals.length).toBe(1);
    expect(testState.modals[0].options.title).toBe('Modal 1');
    expect(testState.leftPanel).not.toBeNull(); // Drawer still open

    // 4. Dispatch Escape keydown again - should close Modal 1 (now topmost active)
    await act(async () => {
      document.dispatchEvent(escEvent);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(testState.modals.length).toBe(0);
    expect(testState.leftPanel).not.toBeNull(); // Drawer still open

    // 5. Dispatch Escape keydown again - now that modals are empty, drawer should close
    await act(async () => {
      document.dispatchEvent(escEvent);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(testState.leftPanel).toBeNull(); // Drawer closed
  });

  it('should support ConfirmationForm rendering, resolving onOK and onCancel handlers', async () => {
    mount();

    const okSpy = vi.fn();
    const cancelSpy = vi.fn();

    act(() => {
      testActions.openModal(ConfirmationForm, {
        message: 'Critical Action Prompt',
        alert: 'System Alert Notice',
        alertType: 'danger',
        useYesNoTitles: true,
        onOK: okSpy,
        onCancel: cancelSpy
      }, { title: 'Confirmation Dialog' });
    });

    expect(testState.modals.length).toBe(1);
    expect(testState.modals[0].options.title).toBe('Confirmation Dialog');

    const modalBody = container!.querySelector('.rdd-modal-body');
    expect(modalBody?.textContent).toContain('Critical Action Prompt');
    expect(modalBody?.textContent).toContain('System Alert Notice');

    const yesBtn = modalBody!.querySelector('button[type="submit"]');
    expect(yesBtn?.textContent).toBe('Yes');

    // Submit form (clicks Yes)
    await act(async () => {
      (yesBtn as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(okSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(testState.modals.length).toBe(0); // modal closed
  });
});
