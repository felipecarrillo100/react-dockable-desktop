import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  WindowManagerProvider,
  useWindowManagerState,
  useWindowManagerActions,
  useFormatMessage,
  usePredefinedMessages,
  useStyleClasses,
  formatLabel,
  type ContextMenuPredefinedMessage,
  type MessageFormatter,
} from '../WindowManagerContext';

// ---- helpers ----------------------------------------------------------------

let lastState: any = null;
let lastActions: any = null;
let lastFormatter: MessageFormatter | null = null;
let lastPredefined: any = null;
let lastStyleClasses: any = null;

const AllExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  lastFormatter = useFormatMessage();
  lastPredefined = usePredefinedMessages();
  lastStyleClasses = useStyleClasses();
  return null;
};

describe('Internationalization & Localisation', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
    lastFormatter = null;
    lastPredefined = null;
    lastStyleClasses = null;
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
  });

  const mountWith = (props: Partial<React.ComponentProps<typeof WindowManagerProvider>> = {}) => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider {...props}>
          <AllExtractor />
        </WindowManagerProvider>
      );
    });
  };

  // ---- formatLabel utility --------------------------------------------------

  describe('formatLabel helper', () => {
    it('returns a plain string unchanged', () => {
      const fmt: MessageFormatter = vi.fn((msg) => msg.defaultMessage ?? msg.id);
      expect(formatLabel('Hello', fmt)).toBe('Hello');
      expect(fmt).not.toHaveBeenCalled();
    });

    it('resolves an i18n descriptor through the formatter', () => {
      const fmt: MessageFormatter = vi.fn(() => 'Translated');
      const descriptor: ContextMenuPredefinedMessage = { id: 'app.title', defaultMessage: 'Default' };
      expect(formatLabel(descriptor, fmt)).toBe('Translated');
      expect(fmt).toHaveBeenCalledWith(descriptor);
    });

    it('returns empty string for undefined label', () => {
      const fmt: MessageFormatter = vi.fn();
      expect(formatLabel(undefined, fmt)).toBe('');
      expect(fmt).not.toHaveBeenCalled();
    });
  });

  // ---- default direction ---------------------------------------------------

  describe('default direction', () => {
    it('should default to ltr direction', () => {
      mountWith();
      expect(lastState.dir).toBe('ltr');
      expect(lastState.isRtl).toBe(false);
    });

    it('should initialise with rtl when dir prop is rtl', () => {
      mountWith({ dir: 'rtl' });
      expect(lastState.dir).toBe('rtl');
      expect(lastState.isRtl).toBe(true);
    });
  });

  // ---- setDirection action --------------------------------------------------

  describe('setDirection action', () => {
    it('setDirection("rtl") switches state to RTL', () => {
      mountWith();
      act(() => { lastActions.setDirection('rtl'); });
      expect(lastState.dir).toBe('rtl');
      expect(lastState.isRtl).toBe(true);
    });

    it('setDirection("ltr") switches back from RTL', () => {
      mountWith({ dir: 'rtl' });
      act(() => { lastActions.setDirection('ltr'); });
      expect(lastState.dir).toBe('ltr');
      expect(lastState.isRtl).toBe(false);
    });

    it('setDirection is idempotent (no state churn when same value)', () => {
      mountWith();
      const stateBefore = lastState;
      act(() => { lastActions.setDirection('ltr'); });
      // same reference if reducer returns prev unchanged
      expect(lastState).toBe(stateBefore);
    });
  });

  // ---- default formatter ---------------------------------------------------

  describe('default formatter (fallback)', () => {
    it('useFormatMessage returns a callable function', () => {
      mountWith();
      expect(typeof lastFormatter).toBe('function');
    });

    it('default formatter returns defaultMessage when provided', () => {
      mountWith();
      const result = lastFormatter!({ id: 'any.key', defaultMessage: 'Fallback text' });
      expect(result).toBe('Fallback text');
    });

    it('default formatter returns id when no defaultMessage', () => {
      mountWith();
      const result = lastFormatter!({ id: 'raw.key' });
      expect(result).toBe('raw.key');
    });

    it('default formatter interpolates {placeholder} values', () => {
      mountWith();
      const result = lastFormatter!({
        id: 'with.placeholder',
        defaultMessage: 'Close {title}',
        values: { title: 'My Panel' },
      });
      expect(result).toBe('Close My Panel');
    });
  });

  // ---- custom formatMessage prop -------------------------------------------

  describe('custom formatMessage prop', () => {
    it('uses the provided formatMessage function instead of default', () => {
      const customFmt: MessageFormatter = vi.fn((msg) => `[${msg.id}]`);
      mountWith({ formatMessage: customFmt });
      const result = lastFormatter!({ id: 'app.close', defaultMessage: 'Close' });
      expect(result).toBe('[app.close]');
      expect(customFmt).toHaveBeenCalled();
    });
  });

  // ---- predefined messages -------------------------------------------------

  describe('predefined messages', () => {
    it('usePredefinedMessages returns a non-empty object', () => {
      mountWith();
      expect(lastPredefined).not.toBeNull();
      expect(typeof lastPredefined).toBe('object');
      expect(Object.keys(lastPredefined).length).toBeGreaterThan(0);
    });

    it('contains expected built-in keys', () => {
      mountWith();
      expect(lastPredefined).toHaveProperty('closeTab');
      expect(lastPredefined).toHaveProperty('minimizePanel');
      expect(lastPredefined).toHaveProperty('floatWindow');
      expect(lastPredefined).toHaveProperty('unsavedChangesMessage');
    });

    it('allows overriding a predefined message via predefinedMessages prop', () => {
      mountWith({
        predefinedMessages: {
          closeTab: { id: 'custom.closeTab', defaultMessage: 'Dismiss' },
        },
      });
      expect(lastPredefined.closeTab).toEqual({
        id: 'custom.closeTab',
        defaultMessage: 'Dismiss',
      });
    });

    it('partial override preserves non-overridden keys', () => {
      mountWith({
        predefinedMessages: {
          closeTab: { id: 'custom.closeTab', defaultMessage: 'Dismiss' },
        },
      });
      // minimizePanel was NOT overridden, should still have an id
      expect(lastPredefined.minimizePanel).toBeDefined();
      expect(typeof lastPredefined.minimizePanel.id).toBe('string');
    });

    it('unsavedChangesMessage descriptor contains {title} placeholder by default', () => {
      mountWith();
      // default message should reference {title}
      const msg = lastPredefined.unsavedChangesMessage as ContextMenuPredefinedMessage;
      expect(msg.defaultMessage ?? msg.id).toContain('{title}');
    });
  });

  // ---- useStyleClasses hook ------------------------------------------------

  describe('useStyleClasses hook', () => {
    it('returns empty object when no style class props provided', () => {
      mountWith();
      expect(lastStyleClasses).toEqual({});
    });

    it('returns configured modalClass', () => {
      mountWith({ modalClass: 'my-modal' });
      expect(lastStyleClasses.modalClass).toBe('my-modal');
    });

    it('returns all configured style classes', () => {
      mountWith({
        modalClass: 'modal-cls',
        modalBodyClass: 'modal-body-cls',
        sidePanelClass: 'sp-cls',
        sidePanelBodyClass: 'sp-body-cls',
        windowClass: 'win-cls',
        windowBodyClass: 'win-body-cls',
      });
      expect(lastStyleClasses).toEqual({
        modalClass: 'modal-cls',
        modalBodyClass: 'modal-body-cls',
        sidePanelClass: 'sp-cls',
        sidePanelBodyClass: 'sp-body-cls',
        windowClass: 'win-cls',
        windowBodyClass: 'win-body-cls',
      });
    });
  });
});
