import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerActions, useWindowManagerState } from '../WindowManagerContext';
import { useFormContainer } from '../FormContainerContext';
import { PanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';

const TestFormChild: React.FC<{ panelId: string }> = ({ panelId }) => {
  const container = useFormContainer();
  
  return (
    <div id={`child-${panelId}`}>
      <button id={`dirty-btn-${panelId}`} onClick={() => container.setDirty(true)}>Set Dirty</button>
      <button id={`clean-btn-${panelId}`} onClick={() => container.setDirty(false)}>Set Clean</button>
      <button id={`close-btn-${panelId}`} onClick={() => container.requestClose()}>Request Close</button>
      <button id={`force-close-btn-${panelId}`} onClick={() => container.requestClose({ force: true })}>Force Close</button>
      <button id={`title-btn-${panelId}`} onClick={() => container.setTitle('Dynamic Title')}>Set Title</button>
      <button 
        id={`guard-btn-${panelId}`} 
        onClick={() => {
          container.onCloseRequested(() => {
            return false;
          });
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

const TestHelper: React.FC = () => {
  testActions = useWindowManagerActions();
  testState = useWindowManagerState();
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
          <TestHelper />
          <WindowManager />
        </WindowManagerProvider>
      );
    });
  };

  it('should render form container and show asterisk on dirty state', () => {
    mount();
    
    // Open our test panel
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Test Form' });
    });

    // Verify it is docked/open
    expect(testState.panels['test-panel']).toBeDefined();
    
    // Find tab header text
    let tabElement = container!.querySelector('.workspace-tab.active');
    expect(tabElement?.textContent).toContain('Test Form');
    expect(tabElement?.textContent).not.toContain('*');

    // Click the dirty button to mark dirty
    const dirtyBtn = container!.querySelector('#dirty-btn-test-panel');
    expect(dirtyBtn).toBeDefined();
    act(() => {
      (dirtyBtn as HTMLButtonElement).click();
    });

    // Check that panel is marked dirty in state
    expect(testState.panels['test-panel'].dirty).toBe(true);

    // Verify tab text now contains the asterisk indicator
    tabElement = container!.querySelector('.workspace-tab.active');
    expect(tabElement?.textContent).toContain('Test Form *');
  });

  it('should support dynamic title updates via context contract', () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Initial Title' });
    });

    // Click set title button
    const titleBtn = container!.querySelector('#title-btn-test-panel');
    act(() => {
      (titleBtn as HTMLButtonElement).click();
    });

    // Title should update
    expect(testState.panels['test-panel'].title).toBe('Dynamic Title');
    const tabElement = container!.querySelector('.workspace-tab.active');
    expect(tabElement?.textContent).toContain('Dynamic Title');
  });

  it('should block tab closure when onCloseRequested guard returns false', async () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Guard Test' });
    });

    // Register blocking guard
    const guardBtn = container!.querySelector('#guard-btn-test-panel');
    act(() => {
      (guardBtn as HTMLButtonElement).click();
    });

    // Request close - wrapped in await act because guard checks are async
    const closeBtn = container!.querySelector('#close-btn-test-panel');
    await act(async () => {
      (closeBtn as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Panel should NOT close because guard blocked it
    expect(testState.panels['test-panel']).toBeDefined();
  });

  it('should prompt dirty overlay modal and support Cancel or Discard choices', async () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Modal Test' });
    });

    // Set dirty
    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
    });

    // Click close - wrapped in await act because requestClose is async
    await act(async () => {
      (container!.querySelector('#close-btn-test-panel') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Overlay modal should appear
    expect(testState.pendingClose).not.toBeNull();
    expect(testState.pendingClose.id).toBe('test-panel');
    
    let modalElement = container!.querySelector('.close-warning-overlay');
    expect(modalElement).not.toBeNull();
    expect(modalElement!.querySelector('.close-warning-title')?.textContent).toBe('Unsaved Changes');

    // Click cancel in modal
    const cancelBtn = modalElement!.querySelector('.btn-warning-cancel');
    await act(async () => {
      (cancelBtn as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Overlay modal should be gone, and panel remains open
    expect(testState.pendingClose).toBeNull();
    expect(testState.panels['test-panel']).toBeDefined();
    expect(container!.querySelector('.close-warning-overlay')).toBeNull();

    // Request close again to re-trigger modal
    await act(async () => {
      (container!.querySelector('#close-btn-test-panel') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    modalElement = container!.querySelector('.close-warning-overlay');
    expect(modalElement).not.toBeNull();

    // Click discard changes
    const discardBtn = modalElement!.querySelector('.btn-warning-discard');
    await act(async () => {
      (discardBtn as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Modal should be gone, and panel closed
    expect(testState.pendingClose).toBeNull();
    expect(testState.panels['test-panel']).toBeUndefined();
  });

  it('should bypass guards and dirty check if requested with force option', async () => {
    mount();
    act(() => {
      testActions.openPanel('test-panel', 'testForm', { title: 'Force Close Test' });
    });

    // Make dirty and register block guard
    act(() => {
      (container!.querySelector('#dirty-btn-test-panel') as HTMLButtonElement).click();
      (container!.querySelector('#guard-btn-test-panel') as HTMLButtonElement).click();
    });

    // Trigger force close
    await act(async () => {
      (container!.querySelector('#force-close-btn-test-panel') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Panel should be closed directly without blocking or triggering pendingClose modal
    expect(testState.panels['test-panel']).toBeUndefined();
    expect(testState.pendingClose).toBeNull();
  });
});
