import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerActions, useWindowManagerState } from '../WindowManagerContext';
import { PanelProvider, usePanelState, usePanelActions } from '../PanelProviderContext';
import { useFormContainer } from '../FormContainerContext';
import { globalPanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';
import ModalStackRenderer from '../ModalStackRenderer';
import SidePanelRenderer from '../SidePanelRenderer';
import ConfirmationForm from '../../forms/ConfirmationForm';
import AlertForm from '../../forms/AlertForm';
import { useModals, usePanelEvents, type ModalsApi } from '../../api';

// rdd 7.7.0: confirmation and alert dialogs settle exactly once on every exit, show a default
// icon that can be replaced or hidden, and the modals API resolves promises from them.

const DirtyChild: React.FC<{ panelId: string }> = ({ panelId }) => {
  const c = useFormContainer();
  return <button id={`dirty-${panelId}`} onClick={() => c.setDirty(true)}>dirty</button>;
};
globalPanelRegistry.register('dialogsDirty', DirtyChild);

let wm: any = null;
let wmState: any = null;
let panelState: any = null;
let panelActions: any = null;
let modals: ModalsApi = null as unknown as ModalsApi;

const Helper: React.FC = () => {
  wm = useWindowManagerActions();
  wmState = useWindowManagerState();
  panelState = usePanelState();
  panelActions = usePanelActions();
  modals = useModals();
  return null;
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Dialogs (7.7.0)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    root = null;
    document.body.removeChild(container);
  });

  // StrictMode on purpose: it runs every effect's cleanup once at mount, which is what makes a
  // naive "settle on unmount" fire early.
  const mount = () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <StrictMode>
          <WindowManagerProvider>
            <PanelProvider>
              <Helper />
              <WindowManager />
              <ModalStackRenderer />
            </PanelProvider>
          </WindowManagerProvider>
        </StrictMode>
      );
    });
  };

  const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
  const pressEscape = () => act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  const openConfirm = (props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) => {
    const onSettled = vi.fn(), onOK = vi.fn(), onCancel = vi.fn();
    act(() => { panelActions.openModal(ConfirmationForm, { message: 'Proceed?', onSettled, onOK, onCancel, ...props }, options); });
    return { onSettled, onOK, onCancel };
  };

  describe('RddConfirm settles exactly once', () => {
    const dismissals: [string, () => void][] = [
      ['Escape', () => pressEscape()],
      ['the backdrop', () => act(() => { q('.rdd-modal-curtain')!.click(); })],
      ['the ×', () => act(() => { q('.rdd-modal-close-button')!.click(); })],
      ['closeAll', () => act(() => { panelActions.closeAll(); })],
      ['closeAllModals', () => act(() => { panelActions.closeAllModals(); })],
      ['close(id)', () => act(() => { panelActions.close(panelState.modals[0].id); })],
    ];

    for (const [name, dismiss] of dismissals) {
      it(`settles false when dismissed with ${name}, without calling onOK or onCancel`, async () => {
        mount();
        const { onSettled, onOK, onCancel } = openConfirm();
        expect(onSettled).not.toHaveBeenCalled();
        dismiss();
        await act(flush);
        expect(q('.rdd-modal-overlay')).toBeNull();
        expect(onSettled).toHaveBeenCalledTimes(1);
        expect(onSettled).toHaveBeenCalledWith(false);
        expect(onOK).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
      });
    }

    it('settles true once on the confirm button, even though closing reports again', async () => {
      mount();
      const { onSettled, onOK } = openConfirm();
      await act(async () => { q('[data-rdd-confirm-ok]')!.click(); await flush(); });
      expect(onSettled.mock.calls).toEqual([[true]]);
      expect(onOK).toHaveBeenCalledTimes(1);
      expect(q('.rdd-modal-overlay')).toBeNull();
    });

    it('settles false once on the cancel button and calls onCancel', async () => {
      mount();
      const { onSettled, onCancel } = openConfirm();
      await act(async () => { q('[data-rdd-confirm-cancel]')!.click(); await flush(); });
      expect(onSettled.mock.calls).toEqual([[false]]);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it("the workspace's unsaved-changes prompt resolves from onSettled, so Escape answers it", async () => {
    mount();
    act(() => { wm.openPanel('p1', 'dialogsDirty', { title: 'Doc' }); });
    act(() => { q('#dirty-p1')!.click(); });
    await act(async () => { q('.rdd-close-tab-x')!.click(); await flush(); });

    const prompt = panelState.modals[0];
    expect(prompt.Component).toBe(ConfirmationForm);
    expect(typeof prompt.props.onSettled).toBe('function');

    pressEscape();
    await act(flush);
    expect(q('.rdd-modal-overlay')).toBeNull();
    expect(wmState.panels.p1).toBeDefined();

    // Yes still discards and closes.
    await act(async () => { q('.rdd-close-tab-x')!.click(); await flush(); });
    await act(async () => { q('[data-rdd-confirm-ok]')!.click(); await flush(); });
    expect(wmState.panels.p1).toBeUndefined();
  });

  describe('dialog icon', () => {
    it('RddConfirm draws the built-in question icon, coloured by alertType', () => {
      mount();
      openConfirm({ alertType: 'warning' });
      const icon = q('.rdd-dialog-icon');
      expect(icon).not.toBeNull();
      expect(icon!.classList.contains('rdd-dialog-icon-warning')).toBe(true);
      expect(icon!.getAttribute('data-rdd-dialog-icon')).toBe('default');
      expect(icon!.querySelector('svg')).not.toBeNull();
    });

    it('icon={null} draws no icon', () => {
      mount();
      openConfirm({ icon: null });
      expect(q('.rdd-dialog-icon')).toBeNull();
      expect(q('.rdd-confirmation-message')!.textContent).toBe('Proceed?');
    });

    it('a custom icon replaces the built-in one, in the same slot', () => {
      mount();
      openConfirm({ icon: <i id="my-icon" />, alertType: 'danger' });
      const icon = q('.rdd-dialog-icon');
      expect(icon!.querySelector('#my-icon')).not.toBeNull();
      expect(icon!.querySelector('svg')).toBeNull();
      expect(icon!.classList.contains('rdd-dialog-icon-danger')).toBe(true);
    });

    it('no longer overwrites ModalOptions.icon in the header', () => {
      mount();
      openConfirm({}, { icon: <b id="header-icon" /> });
      expect(q('.rdd-modal-icon #header-icon')).not.toBeNull();
    });

    it('RddAlert draws the icon of its type', () => {
      mount();
      openConfirm({ alertType: 'success' });
      const confirmIcon = q('.rdd-dialog-icon svg')!.innerHTML;
      act(() => { panelActions.closeAll(); });
      act(() => { panelActions.openModal(AlertForm, { message: 'Saved', alertType: 'success' }, {}); });
      const alertIcon = q('.rdd-dialog-icon');
      expect(alertIcon!.classList.contains('rdd-dialog-icon-success')).toBe(true);
      expect(alertIcon!.querySelector('svg')!.innerHTML).not.toBe(confirmIcon);
    });
  });

  describe('RddAlert', () => {
    const openAlert = (props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) => {
      const onSettled = vi.fn();
      act(() => { panelActions.openModal(AlertForm, { message: 'Done', onSettled, ...props }, options); });
      return onSettled;
    };

    it('shows one OK button, focused, with the data hook', () => {
      mount();
      openAlert();
      const buttons = container.querySelectorAll('.rdd-modal-body button');
      expect(buttons.length).toBe(1);
      expect(document.activeElement).toBe(q('[data-rdd-alert-ok]'));
      expect(q('[data-rdd-alert-ok]')!.textContent).toBe('OK');
    });

    it('okLabel replaces the button label', () => {
      mount();
      openAlert({ okLabel: 'Got it' });
      expect(q('[data-rdd-alert-ok]')!.textContent).toBe('Got it');
    });

    it('settles once on OK', async () => {
      mount();
      const onSettled = openAlert();
      await act(async () => { q('[data-rdd-alert-ok]')!.click(); await flush(); });
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(q('.rdd-modal-overlay')).toBeNull();
    });

    it('settles once on Escape', async () => {
      mount();
      const onSettled = openAlert();
      pressEscape();
      await act(flush);
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(q('.rdd-modal-overlay')).toBeNull();
    });

    it('with closable: false, Escape and the backdrop do not close it; OK does', async () => {
      mount();
      const onSettled = openAlert({}, { closable: false });
      pressEscape();
      act(() => { q('.rdd-modal-curtain')!.click(); });
      await act(flush);
      expect(q('.rdd-modal-overlay')).not.toBeNull();
      expect(onSettled).not.toHaveBeenCalled();
      await act(async () => { q('[data-rdd-alert-ok]')!.click(); await flush(); });
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(q('.rdd-modal-overlay')).toBeNull();
    });
  });

  describe('useModals().confirm / alert', () => {
    it('confirm resolves true on the confirm button', async () => {
      mount();
      let p!: Promise<boolean>;
      act(() => { p = modals.confirm({ message: 'Delete?', yesNo: true }); });
      expect(q('[data-rdd-confirm-ok]')!.textContent).toBe('Yes');
      expect(q('.rdd-modal-title')!.textContent).toBe('Confirmation');
      expect(q('.rdd-modal-size-small')).not.toBeNull();
      await act(async () => { q('[data-rdd-confirm-ok]')!.click(); await flush(); });
      await expect(p).resolves.toBe(true);
    });

    it('confirm resolves false on cancel and on dismissal', async () => {
      mount();
      let p1!: Promise<boolean>, p2!: Promise<boolean>;
      act(() => { p1 = modals.confirm({ message: 'Delete?' }); });
      await act(async () => { q('[data-rdd-confirm-cancel]')!.click(); await flush(); });
      await expect(p1).resolves.toBe(false);
      act(() => { p2 = modals.confirm({ message: 'Delete?', title: 'Sure?' }); });
      expect(q('.rdd-modal-title')!.textContent).toBe('Sure?');
      pressEscape();
      await act(flush);
      await expect(p2).resolves.toBe(false);
    });

    it('alert resolves on OK and on dismissal, titled "Information" by default', async () => {
      mount();
      let p1!: Promise<void>, p2!: Promise<void>;
      act(() => { p1 = modals.alert({ message: 'Saved', alertType: 'success' }); });
      expect(q('.rdd-modal-title')!.textContent).toBe('Information');
      expect(q('.rdd-modal-size-small')).not.toBeNull();
      expect(q('.rdd-dialog-icon-success')).not.toBeNull();
      await act(async () => { q('[data-rdd-alert-ok]')!.click(); await flush(); });
      await expect(p1).resolves.toBeUndefined();
      act(() => { p2 = modals.alert({ message: 'Saved', icon: null }); });
      expect(q('.rdd-dialog-icon')).toBeNull();
      act(() => { q('.rdd-modal-close-button')!.click(); });
      await act(flush);
      await expect(p2).resolves.toBeUndefined();
    });
  });
});

describe('usePanelEvents().onClose in overlays (7.7.0)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const log: string[] = [];

  const Logged: React.FC<{ panelId: string; name: string }> = ({ name }) => {
    usePanelEvents({ onClose: () => log.push(name) });
    return <div>{name}</div>;
  };

  beforeEach(() => {
    log.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(
        <StrictMode>
          <WindowManagerProvider>
            <PanelProvider>
              <Helper />
              <SidePanelRenderer />
              <ModalStackRenderer />
            </PanelProvider>
          </WindowManagerProvider>
        </StrictMode>
      );
    });
  });

  afterEach(() => {
    act(() => { root!.unmount(); });
    document.body.removeChild(container);
  });

  it('fires once when a side drawer closes, and when it is replaced', async () => {
    let first!: string;
    await act(async () => { first = (await panelActions.openLeftPanel(Logged, { name: 'a' }))!; });
    await act(async () => { await panelActions.openLeftPanel(Logged, { name: 'b' }); });
    expect(log).toEqual(['a']);
    act(() => { panelActions.close(panelState.leftPanel.id); });
    expect(log).toEqual(['a', 'b']);
    act(() => { panelActions.close(first); });
    expect(log).toEqual(['a', 'b']);
  });

  it('fires once when a modal closes', () => {
    act(() => { panelActions.openModal(Logged, { name: 'm' }); });
    act(() => { panelActions.closeAll(); });
    act(() => { panelActions.closeAll(); });
    expect(log).toEqual(['m']);
  });
});
