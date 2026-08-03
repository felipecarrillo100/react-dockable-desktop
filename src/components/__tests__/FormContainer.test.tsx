import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerActions, useWindowManagerState } from '../WindowManagerContext';
import { PanelProvider, usePanelState, usePanelActions } from '../PanelProviderContext';
import { useFormContainer, usePanelSize } from '../FormContainerContext';
import { PanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';
import ModalStackRenderer from '../ModalStackRenderer';
import ConfirmationForm from '../../forms/ConfirmationForm';

// Shared log for lifecycle event assertions — cleared in beforeEach of each describe
const lifeCycleLog: string[] = [];

// Panel that exposes new lifecycle contract members via buttons and data attributes
const TestLifecycleChild: React.FC<{ panelId: string }> = ({ panelId }) => {
  const contract = useFormContainer();
  const panelSize = usePanelSize();
  return (
    <div
      id={`lc-${panelId}`}
      data-container-type={contract.containerType}
      data-panel-size={panelSize ? `${panelSize.width}x${panelSize.height}` : 'null'}
    >
      <button id={`minimize-btn-${panelId}`} onClick={() => contract.requestMinimize?.()}>Minimize</button>
      <button id={`get-dims-btn-${panelId}`} onClick={() => {
        const d = contract.getDimensions?.();
        lifeCycleLog.push(d ? `${d.width}x${d.height}` : 'null');
      }}>Get Dims</button>
      <button id={`sub-lifecycle-${panelId}`} onClick={() => {
        contract.onActivate?.(() => lifeCycleLog.push(`activate:${panelId}`));
        contract.onDeactivate?.(() => lifeCycleLog.push(`deactivate:${panelId}`));
        contract.onContainerTypeChange?.((t) => lifeCycleLog.push(`containerType:${t}`));
        contract.onClose?.(() => lifeCycleLog.push(`close:${panelId}`));
      }}>Subscribe</button>
    </div>
  );
};

PanelRegistry.register('testLifecycle', TestLifecycleChild);

// Panel that exposes FormContainerContract via buttons so tests can drive it
const TestFormChild: React.FC<{ panelId: string }> = ({ panelId }) => {
  const container = useFormContainer();

  return (
    <div id={`child-${panelId}`}>
      <button id={`dirty-btn-${panelId}`}    onClick={() => container.setDirty(true)}>Set Dirty</button>
      <button id={`clean-btn-${panelId}`}    onClick={() => container.setDirty(false)}>Set Clean</button>
      <button id={`close-btn-${panelId}`}    onClick={() => container.requestClose()}>Request Close</button>
      <button id={`force-close-btn-${panelId}`} onClick={() => container.requestClose({ force: true })}>Force Close</button>
      <button id={`title-btn-${panelId}`}    onClick={() => container.setTitle('Dynamic Title')}>Set Title</button>
      <button
        id={`guard-btn-${panelId}`}
        onClick={() => {
          container.onCloseRequested(() => false);
        }}
      >
        Register Block Guard
      </button>
    </div>
  );
};

PanelRegistry.register('testForm', TestFormChild);

let testActions: any = null;
let testState: any = null;
let panelState: any = null;
let panelActions: any = null;

const TestHelper: React.FC = () => {
  testActions = useWindowManagerActions();
  testState = useWindowManagerState();
  panelState = usePanelState();
  panelActions = usePanelActions();
  return null;
};

describe('FormContainer Integration', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    testActions = null;
    testState = null;
    panelState = null;
    panelActions = null;
  });

  afterEach(() => {
    if (root) {
      act(() => { root!.unmount(); });
    }
    if (container) {
      document.body.removeChild(container);
    }
    const preserved = document.getElementById('preserved-dom-container');
    if (preserved?.parentNode) {
      preserved.parentNode.removeChild(preserved);
    }
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelProvider>
            <TestHelper />
            <WindowManager />
            <ModalStackRenderer />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
  };

  it('should render form container and show asterisk on dirty state', () => {
    mount();

    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Test Form' });
    });

    expect(testState.panels['test-panel']).toBeDefined();

    let tab = container!.querySelector('.workspace-tab.active');
    expect(tab?.textContent).toContain('Test Form');
    expect(tab?.textContent).not.toContain('*');

    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
    });

    expect(testState.panels['test-panel'].dirty).toBe(true);

    tab = container!.querySelector('.workspace-tab.active');
    expect(tab?.textContent).toContain('Test Form *');
  });

  it('should clear dirty flag and asterisk when setDirty(false) is called', () => {
    mount();

    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Test Form' });
    });

    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
    });
    expect(testState.panels['test-panel'].dirty).toBe(true);

    act(() => {
      (container!.querySelector('#clean-btn-test-panel') as HTMLButtonElement).click();
    });
    expect(testState.panels['test-panel'].dirty).toBe(false);

    const tab = container!.querySelector('.workspace-tab.active');
    expect(tab?.textContent).not.toContain('*');
  });

  it('should support dynamic title updates via context contract', () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Initial Title' });
    });

    act(() => {
      (container!.querySelector('#title-btn-test-panel') as HTMLButtonElement).click();
    });

    expect(testState.panels['test-panel'].title).toBe('Dynamic Title');
    const tab = container!.querySelector('.workspace-tab.active');
    expect(tab?.textContent).toContain('Dynamic Title');
  });

  it('should block panel closure when onCloseRequested guard returns false', async () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Guard Test' });
    });

    // Register a blocking guard via the panel's own button
    act(() => {
      (container!.querySelector('#guard-btn-test-panel') as HTMLButtonElement).click();
    });

    // requestClose() goes through the guard — should be blocked
    await act(async () => {
      (container!.querySelector('#close-btn-test-panel') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(testState.panels['test-panel']).toBeDefined();
  });

  it('should bypass guard and dirty check on force close', async () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Force Close Test' });
    });

    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
      (container!.querySelector('#guard-btn-test-panel') as HTMLButtonElement).click();
    });

    await act(async () => {
      (container!.querySelector('#force-close-btn-test-panel') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(testState.panels['test-panel']).toBeUndefined();
  });

  it('should show dirty confirmation modal when openModal is triggered for a dirty panel', () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Modal Test' });
    });

    // Mark dirty
    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
    });
    expect(testState.panels['test-panel'].dirty).toBe(true);

    // The tab X button must be present (UI structural assertion)
    expect(container!.querySelector('.close-tab-x')).not.toBeNull();

    // Open the ConfirmationForm modal directly (simulates what handleRequestClose does)
    act(() => {
      panelActions.openModal(
        ConfirmationForm,
        { message: 'You have unsaved changes. Discard?', useYesNoTitles: true, onOK: () => {}, onCancel: () => {} },
        { size: 'small', title: 'Unsaved Changes' }
      );
    });

    expect(panelState.modals.length).toBeGreaterThan(0);
    const modal = container!.querySelector('.v2-modal-overlay');
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain('Unsaved Changes');
  });

  it('should keep panel open when No is clicked in dirty confirmation modal', () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Modal Test' });
    });

    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
    });

    // Open the confirmation modal
    act(() => {
      panelActions.openModal(
        ConfirmationForm,
        { message: 'Discard unsaved changes?', useYesNoTitles: true, onOK: () => testActions.closePanel('test-panel'), onCancel: () => {} },
        { size: 'small', title: 'Unsaved Changes' }
      );
    });

    const modal = container!.querySelector('.v2-modal-overlay');
    expect(modal).not.toBeNull();

    // The first type="button" is the modal close X; the second is the ConfirmationForm cancel/No
    const allTypeBtns = Array.from(modal!.querySelectorAll('button[type="button"]'));
    const noBtn = allTypeBtns.find(b => b.textContent?.trim() === 'No') as HTMLButtonElement;
    expect(noBtn).not.toBeNull();
    act(() => { noBtn.click(); });

    // Modal dismissed, panel still open
    expect(container!.querySelector('.v2-modal-overlay')).toBeNull();
    expect(testState.panels['test-panel']).toBeDefined();
  });

  it('should close panel when Yes is clicked in dirty confirmation modal', () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Modal Test' });
    });

    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
    });

    // Open the confirmation modal with onOK that closes the panel
    act(() => {
      panelActions.openModal(
        ConfirmationForm,
        { message: 'Discard unsaved changes?', useYesNoTitles: true, onOK: () => testActions.closePanel('test-panel'), onCancel: () => {} },
        { size: 'small', title: 'Unsaved Changes' }
      );
    });

    const modal = container!.querySelector('.v2-modal-overlay');
    expect(modal).not.toBeNull();

    // Click "Yes" (confirm/submit) button — type="submit"
    const yesBtn = modal!.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(yesBtn?.textContent).toContain('Yes');
    act(() => { yesBtn.click(); });

    // Modal dismissed, panel closed
    expect(container!.querySelector('.v2-modal-overlay')).toBeNull();
    expect(testState.panels['test-panel']).toBeUndefined();
  });

  it('requestClose on a dirty panel without onConfirm should silently abort (no modal, no close)', async () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Silent Abort Test' });
    });

    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
    });

    // container.requestClose() has no onConfirm — per architecture it silently returns
    await act(async () => {
      (container!.querySelector('#close-btn-test-panel') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(container!.querySelector('.v2-modal-overlay')).toBeNull();
    expect(testState.panels['test-panel']).toBeDefined();
  });
});

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('FormContainer Lifecycle Extensions', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let lcTestActions: any = null;
  let lcTestState: any = null;

  const LcTestHelper: React.FC = () => {
    lcTestActions = useWindowManagerActions();
    lcTestState = useWindowManagerState();
    return null;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lcTestActions = null;
    lcTestState = null;
    lifeCycleLog.length = 0;
  });

  afterEach(() => {
    if (root) {
      act(() => { root!.unmount(); });
    }
    if (container) {
      document.body.removeChild(container);
    }
    const preserved = document.getElementById('preserved-dom-container');
    if (preserved?.parentNode) {
      preserved.parentNode.removeChild(preserved);
    }
    root = null;
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelProvider>
            <LcTestHelper />
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
  };

  const click = (id: string) => {
    act(() => {
      (container!.querySelector(`#${id}`) as HTMLButtonElement).click();
    });
  };

  it('requestMinimize moves panel to minimized taskbar', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    click('minimize-btn-lc-panel');

    expect(lcTestState.panels['lc-panel'].state).toBe('minimized');
    expect(lcTestState.minimized.some((m: any) => m.id === 'lc-panel')).toBe(true);
  });

  it('getDimensions returns null before ResizeObserver fires', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    click('get-dims-btn-lc-panel');

    expect(lifeCycleLog).toContain('null');
  });

  it('usePanelSize() returns null before layout and updates reactively when the panel resizes', () => {
    let roCallbacks: ResizeObserverCallback[] = [];
    const OriginalRO = globalThis.ResizeObserver;
    // @ts-ignore
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) { roCallbacks.push(cb); }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    try {
      mount();
      act(() => { lcTestActions.openPanel('sz-panel', 'testLifecycle', { title: 'Size Panel' }); });

      const el = container!.querySelector('#lc-sz-panel') as HTMLElement;
      expect(el.getAttribute('data-panel-size')).toBe('null');

      act(() => {
        roCallbacks.forEach(cb => cb(
          [{ contentRect: { width: 320, height: 240 } } as ResizeObserverEntry],
          {} as ResizeObserver
        ));
      });

      expect(el.getAttribute('data-panel-size')).toBe('320x240');
    } finally {
      globalThis.ResizeObserver = OriginalRO;
    }
  });

  it('onActivate fires when panel gains focus', () => {
    mount();
    act(() => {
      lcTestActions.openPanel('lc-panel-1', 'testLifecycle', { title: 'Panel 1' });
      lcTestActions.openPanel('lc-panel-2', 'testLifecycle', { title: 'Panel 2' });
    });

    // Focus panel-1 so its PreservedDOMWrapper mounts and puts its DOM in container
    act(() => { lcTestActions.focusPanel('lc-panel-1'); });
    // prevActiveRef is now true for panel-1; subscribe so the next focus change fires activate
    click('sub-lifecycle-lc-panel-1');

    // Focus panel-2 then back to panel-1 — panel-1 should fire activate on the return
    act(() => { lcTestActions.focusPanel('lc-panel-2'); });
    act(() => { lcTestActions.focusPanel('lc-panel-1'); });

    expect(lifeCycleLog).toContain('activate:lc-panel-1');
  });

  it('onDeactivate fires when panel loses focus', () => {
    mount();
    act(() => {
      lcTestActions.openPanel('lc-panel-1', 'testLifecycle', { title: 'Panel 1' });
      lcTestActions.openPanel('lc-panel-2', 'testLifecycle', { title: 'Panel 2' });
    });

    // Focus panel-1 first so state.activePanelId = 'lc-panel-1'
    act(() => { lcTestActions.focusPanel('lc-panel-1'); });

    // Subscribe on both panels (panel-1 may be inactive tab — use document)
    act(() => { document.getElementById('sub-lifecycle-lc-panel-1')?.click(); });
    act(() => { document.getElementById('sub-lifecycle-lc-panel-2')?.click(); });

    // Switch focus to panel-2 — panel-1 deactivates, panel-2 activates
    act(() => { lcTestActions.focusPanel('lc-panel-2'); });

    expect(lifeCycleLog).toContain('deactivate:lc-panel-1');
    expect(lifeCycleLog).toContain('activate:lc-panel-2');
    // deactivate must come before activate
    expect(lifeCycleLog.indexOf('deactivate:lc-panel-1')).toBeLessThan(
      lifeCycleLog.indexOf('activate:lc-panel-2')
    );
  });

  it('onDeactivate fires when active panel is closed', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    // focusPanel sets state.activePanelId; without it prevActiveRef.current stays false
    act(() => { lcTestActions.focusPanel('lc-panel'); });
    click('sub-lifecycle-lc-panel');

    act(() => { lcTestActions.closePanel('lc-panel'); });

    expect(lifeCycleLog.some(e => e.startsWith('deactivate:'))).toBe(true);
  });

  it('onDeactivate fires before onClose when active panel is destroyed', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    act(() => { lcTestActions.focusPanel('lc-panel'); });
    click('sub-lifecycle-lc-panel');

    act(() => { lcTestActions.closePanel('lc-panel'); });

    const deactivateIdx = lifeCycleLog.findIndex(e => e === 'deactivate:lc-panel');
    const closeIdx = lifeCycleLog.findIndex(e => e === 'close:lc-panel');
    expect(deactivateIdx).toBeGreaterThanOrEqual(0);
    expect(closeIdx).toBeGreaterThanOrEqual(0);
    expect(deactivateIdx).toBeLessThan(closeIdx);
  });

  it('onContainerTypeChange fires with floating-window when panel is floated', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    click('sub-lifecycle-lc-panel');

    act(() => { lcTestActions.floatPanel('lc-panel'); });

    expect(lifeCycleLog).toContain('containerType:floating-window');
  });

  it('onContainerTypeChange fires with dockable-panel when floating panel is docked back', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    // Subscribe while docked (panel is visible in container) then float then dock back
    click('sub-lifecycle-lc-panel');
    act(() => { lcTestActions.floatPanel('lc-panel'); });
    act(() => { lcTestActions.dockPanel('lc-panel'); });

    expect(lifeCycleLog).toContain('containerType:dockable-panel');
  });

  it('onContainerTypeChange does NOT fire during minimize and restore', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    click('sub-lifecycle-lc-panel');

    act(() => { lcTestActions.minimizePanel('lc-panel'); });
    act(() => { lcTestActions.restorePanel('lc-panel'); });

    expect(lifeCycleLog.some(e => e.startsWith('containerType:'))).toBe(false);
  });

  it('containerType field is dockable-panel at mount for a docked panel', () => {
    mount();
    act(() => { lcTestActions.openPanel('lc-panel', 'testLifecycle', { title: 'LC Panel' }); });

    const el = container!.querySelector('#lc-lc-panel');
    expect(el?.getAttribute('data-container-type')).toBe('dockable-panel');
  });

  it('onActivate and onDeactivate are not fired when an unrelated panel gains focus', () => {
    mount();
    act(() => {
      lcTestActions.openPanel('lc-panel-1', 'testLifecycle', { title: 'Panel 1' });
      lcTestActions.openPanel('lc-panel-2', 'testLifecycle', { title: 'Panel 2' });
      lcTestActions.openPanel('lc-panel-3', 'testLifecycle', { title: 'Panel 3' });
    });

    // Focus panel-1 so it is active, then subscribe (panel-1 may not be in container — use document)
    act(() => { lcTestActions.focusPanel('lc-panel-1'); });
    act(() => { document.getElementById('sub-lifecycle-lc-panel-1')?.click(); });

    // Switch focus to panel-2 — panel-1 deactivates, panel-2 activates (panel-3 untouched)
    act(() => { lcTestActions.focusPanel('lc-panel-2'); });

    // Switch focus to panel-3 — panel-2 transitions, panel-1 gets no new events
    const logAfterFirstSwitch = [...lifeCycleLog];
    act(() => { lcTestActions.focusPanel('lc-panel-3'); });

    // panel-1's deactivate should appear exactly once (from the first switch)
    const deactivateCount = lifeCycleLog.filter(e => e === 'deactivate:lc-panel-1').length;
    expect(deactivateCount).toBe(1);
    // panel-1's activate should not have fired at all
    expect(lifeCycleLog).not.toContain('activate:lc-panel-1');
    expect(logAfterFirstSwitch).toEqual(lifeCycleLog.slice(0, logAfterFirstSwitch.length));
  });
});
