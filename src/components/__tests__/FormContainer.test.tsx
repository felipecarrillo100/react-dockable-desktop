import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerActions, useWindowManagerState } from '../WindowManagerContext';
import { PanelProvider, usePanelState, usePanelActions } from '../PanelProviderContext';
import { useFormContainer } from '../FormContainerContext';
import { PanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';
import ModalStackRenderer from '../ModalStackRenderer';
import ConfirmationForm from '../../forms/ConfirmationForm';

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
