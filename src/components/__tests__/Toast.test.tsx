/**
 * Tests for the Toast notification system: toast singleton API and ToastContainer.
 *
 * T1:  toast.* methods fire without a mounted ToastContainer (no throws)
 * T2:  ToastContainer renders; toast.info() adds .rdd-toast--info to document.body
 * T3:  Each toast type gets its correct modifier class
 * T4:  Toast renders the supplied message text
 * T5:  closable=true renders a close button; clicking it removes the toast
 * T6:  toast.dismiss(id) removes only the targeted toast
 * T7:  toast.dismiss() with no argument removes all active toasts
 * T8:  duration=0 creates a sticky toast that does not auto-dismiss (fake timers)
 * T9:  Auto-dismiss: toast disappears after defaultDuration ms (fake timers)
 * T10: maxVisible queue — 3rd toast is held in queue and promoted when one exits (fake timers)
 * T11: toast.promise() shows pending text immediately; updates to success on resolve
 * T12: Dedup by id — re-calling toast.info with the same id replaces the existing toast
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { toast, ToastContainer } from '../Toast';

let container: HTMLDivElement;
let root: Root | null = null;

const mountContainer = (props: React.ComponentProps<typeof ToastContainer> = {}) => {
  root = createRoot(container);
  root.render(<ToastContainer {...props} />);
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  // Dismiss all toasts before unmounting to prevent pending timers leaking
  act(() => { toast.dismiss(); });
  if (root) act(() => { root!.unmount(); root = null; });
  // Clean up any portal content left in document.body
  document.body.querySelectorAll('.rdd-toast-container').forEach(el => el.remove());
  if (document.body.contains(container)) document.body.removeChild(container);
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ─── T1 ───────────────────────────────────────────────────────────────────────

describe('T1: toast.* without mounted container', () => {
  it('does not throw when no ToastContainer is mounted', () => {
    expect(() => {
      act(() => {
        toast.info('no container');
        toast.success('ok');
        toast.warning('warn');
        toast.error('err');
        toast.dismiss();
      });
    }).not.toThrow();
  });
});

// ─── T2 ───────────────────────────────────────────────────────────────────────

describe('T2: ToastContainer renders; toast.info adds a toast', () => {
  it('adds .rdd-toast--info to document.body', () => {
    act(() => { mountContainer(); });
    act(() => { toast.info('hello info'); });
    expect(document.body.querySelector('.rdd-toast--info')).not.toBeNull();
  });
});

// ─── T3 ───────────────────────────────────────────────────────────────────────

describe('T3: Toast type modifier classes', () => {
  beforeEach(() => { act(() => { mountContainer(); }); });

  it('toast.success adds .rdd-toast--success', () => {
    act(() => { toast.success('ok'); });
    expect(document.body.querySelector('.rdd-toast--success')).not.toBeNull();
  });

  it('toast.warning adds .rdd-toast--warning', () => {
    act(() => { toast.warning('warn'); });
    expect(document.body.querySelector('.rdd-toast--warning')).not.toBeNull();
  });

  it('toast.error adds .rdd-toast--error', () => {
    act(() => { toast.error('err'); });
    expect(document.body.querySelector('.rdd-toast--error')).not.toBeNull();
  });
});

// ─── T4 ───────────────────────────────────────────────────────────────────────

describe('T4: Toast message text', () => {
  it('renders the supplied message string inside .rdd-toast__body', () => {
    act(() => { mountContainer(); });
    act(() => { toast.info('Hello world'); });
    const body = document.body.querySelector('.rdd-toast__body');
    expect(body?.textContent).toContain('Hello world');
  });
});

// ─── T5 ───────────────────────────────────────────────────────────────────────

describe('T5: Close button dismisses toast', () => {
  it('clicking .rdd-toast__close removes the toast (starts exit)', () => {
    vi.useFakeTimers();
    act(() => { mountContainer({ defaultClosable: true }); });
    act(() => { toast.info('closeable'); });
    expect(document.body.querySelector('.rdd-toast')).not.toBeNull();

    const btn = document.body.querySelector<HTMLButtonElement>('.rdd-toast__close');
    expect(btn).not.toBeNull();
    act(() => { btn!.click(); });

    // After click, toast is in exiting state; run fallback timer to fully remove
    act(() => { vi.runAllTimers(); });
    act(() => { vi.runAllTimers(); });
    expect(document.body.querySelector('.rdd-toast')).toBeNull();
  });
});

// ─── T6 ───────────────────────────────────────────────────────────────────────

describe('T6: toast.dismiss(id) — targeted removal', () => {
  it('removes only the toast with the specified id', () => {
    vi.useFakeTimers();
    act(() => { mountContainer({ defaultDuration: 0 }); }); // sticky so none auto-dismiss
    let idA!: string;
    act(() => {
      idA = toast.info('toast-A');
      toast.info('toast-B');
    });
    expect(document.body.querySelectorAll('.rdd-toast')).toHaveLength(2);

    act(() => { toast.dismiss(idA); });
    act(() => { vi.runAllTimers(); }); // fire fallback exit timer
    act(() => { vi.runAllTimers(); });

    const remaining = document.body.querySelectorAll('.rdd-toast');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].textContent).toContain('toast-B');
  });
});

// ─── T7 ───────────────────────────────────────────────────────────────────────

describe('T7: toast.dismiss() — dismiss all', () => {
  it('removes all active toasts', () => {
    vi.useFakeTimers();
    act(() => { mountContainer({ defaultDuration: 0 }); }); // sticky
    act(() => {
      toast.info('one');
      toast.success('two');
      toast.error('three');
    });
    expect(document.body.querySelectorAll('.rdd-toast')).toHaveLength(3);

    act(() => { toast.dismiss(); });
    act(() => { vi.runAllTimers(); });
    act(() => { vi.runAllTimers(); });
    expect(document.body.querySelectorAll('.rdd-toast')).toHaveLength(0);
  });
});

// ─── T8 ───────────────────────────────────────────────────────────────────────

describe('T8: Sticky toast (duration=0)', () => {
  it('does not auto-dismiss after time passes', () => {
    vi.useFakeTimers();
    act(() => { mountContainer(); });
    act(() => { toast.error('Sticky error', { duration: 0 }); });

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(document.body.querySelector('.rdd-toast')).not.toBeNull();
  });
});

// ─── T9 ───────────────────────────────────────────────────────────────────────

describe('T9: Auto-dismiss after defaultDuration', () => {
  it('removes toast from DOM after the configured duration + exit animation', () => {
    vi.useFakeTimers();
    act(() => { mountContainer({ defaultDuration: 50 }); });
    act(() => { toast.info('auto'); });
    expect(document.body.querySelector('.rdd-toast')).not.toBeNull();

    // Step 1: fire the auto-dismiss timer (50ms)
    act(() => { vi.advanceTimersByTime(51); });
    // Step 2: fire the fallback exit timer (520ms) registered by the exit effect
    act(() => { vi.advanceTimersByTime(521); });

    expect(document.body.querySelector('.rdd-toast')).toBeNull();
  });
});

// ─── T10 ──────────────────────────────────────────────────────────────────────

describe('T10: maxVisible queue', () => {
  it('queues the 3rd toast and promotes it when the 1st exits', () => {
    // animation='none' makes the exit synchronous — no fake timers needed for exit animation
    act(() => { mountContainer({ maxVisible: 2, defaultClosable: true, defaultDuration: 0, animation: 'none' }); });

    act(() => {
      toast.info('first');
      toast.info('second');
      toast.info('third'); // queued — exceeds maxVisible=2
    });
    expect(document.body.querySelectorAll('.rdd-toast')).toHaveLength(2);

    // Dismiss the first toast via close button; with animation='none' the exit is
    // synchronous inside this act() — onExited fires immediately, removing 'first'
    // and promoting 'third' from the queue in the same flush.
    const firstClose = document.body.querySelector<HTMLButtonElement>('.rdd-toast__close');
    act(() => { firstClose!.click(); });

    expect(document.body.querySelectorAll('.rdd-toast')).toHaveLength(2);
    expect(document.body.querySelector('.rdd-toast-container')!.textContent).toContain('third');
  });
});

// ─── T11 ──────────────────────────────────────────────────────────────────────

describe('T11: toast.promise()', () => {
  it('shows pending text immediately, then updates to success on resolve', async () => {
    act(() => { mountContainer(); });

    let resolve!: (v: string) => void;
    const p = new Promise<string>(res => { resolve = res; });

    act(() => {
      toast.promise(p, { pending: 'Saving…', success: r => `Saved: ${r}`, error: 'Failed' });
    });

    expect(document.body.querySelector('.rdd-toast')?.textContent).toContain('Saving…');
    expect(document.body.querySelector('.rdd-toast--info')).not.toBeNull();

    await act(async () => {
      resolve('file.txt');
      await p;
    });

    expect(document.body.querySelector('.rdd-toast--success')).not.toBeNull();
    expect(document.body.querySelector('.rdd-toast')?.textContent).toContain('Saved: file.txt');
  });

  it('shows error message when the promise rejects', async () => {
    act(() => { mountContainer(); });

    const p = Promise.reject(new Error('network error'));
    p.catch(() => {}); // prevent unhandled rejection warning

    act(() => {
      toast.promise(p, { pending: 'Loading…', success: 'Done', error: e => `Error: ${(e as Error).message}` });
    });

    await act(async () => {
      try { await p; } catch { /* expected */ }
    });

    expect(document.body.querySelector('.rdd-toast--error')).not.toBeNull();
    expect(document.body.querySelector('.rdd-toast')?.textContent).toContain('Error: network error');
  });
});

// ─── T12 ──────────────────────────────────────────────────────────────────────

describe('T12: Dedup by id', () => {
  it('re-calling toast.info with the same id updates in place, not duplicating', () => {
    act(() => { mountContainer(); });
    act(() => { toast.info('Original message', { id: 'dedup-1', duration: 0 }); });
    expect(document.body.querySelectorAll('.rdd-toast')).toHaveLength(1);
    expect(document.body.querySelector('.rdd-toast__body')?.textContent).toContain('Original message');

    act(() => { toast.success('Updated message', { id: 'dedup-1', duration: 0 }); });
    expect(document.body.querySelectorAll('.rdd-toast')).toHaveLength(1);
    expect(document.body.querySelector('.rdd-toast__body')?.textContent).toContain('Updated message');
    expect(document.body.querySelector('.rdd-toast--success')).not.toBeNull();
  });
});
