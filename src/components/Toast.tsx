import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ToastType     = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ToastOptions {
  type?:     ToastType;
  duration?: number;
  id?:       string;
  closable?: boolean;
  icon?:     React.ReactNode;
  content?:  React.ReactNode;
  onClose?:  () => void;
}

export interface ResolvedToastOptions {
  id:        string;
  type:      ToastType;
  duration:  number;
  closable:  boolean;
  icon?:     React.ReactNode;
  content?:  React.ReactNode;
  onClose?:  () => void;
}

export interface ToastContainerProps {
  position?:        ToastPosition;
  maxVisible?:      number;
  defaultDuration?: number;
  defaultClosable?: boolean;
  pauseOnHover?:    boolean;
  animation?:       'slide' | 'fade' | 'none';
  newestOnTop?:     boolean;
  progressBar?:     boolean;
  width?:           number;
  adapter?:         ToastAdapter;
}

export interface ToastPromiseMessages<T> {
  pending: React.ReactNode;
  success: React.ReactNode | ((result: T)    => React.ReactNode);
  error:   React.ReactNode | ((err: unknown) => React.ReactNode);
}

export interface ToastAdapter {
  show(id: string, message: React.ReactNode, options: ResolvedToastOptions): void;
  update(id: string, message: React.ReactNode, options: Partial<ResolvedToastOptions>): void;
  dismiss(id?: string): void;
  Container: React.ComponentType<{ position: ToastPosition }> | null;
}

// ─── Internal types ───────────────────────────────────────────────────────────

type ToastEvent =
  | { kind: 'show';    id: string; message: React.ReactNode; rawOpts: ToastOptions & { id: string } }
  | { kind: 'update';  id: string; message: React.ReactNode; patch: Partial<ResolvedToastOptions> }
  | { kind: 'dismiss'; id?: string };

interface ActiveToast {
  id:      string;
  message: React.ReactNode;
  options: ResolvedToastOptions;
  exiting: boolean;
}

// ─── ToastEmitter ─────────────────────────────────────────────────────────────

class ToastEmitter {
  private listeners = new Set<(e: ToastEvent) => void>();
  private counter   = 0;

  subscribe(fn: (e: ToastEvent) => void)   { this.listeners.add(fn); }
  unsubscribe(fn: (e: ToastEvent) => void) { this.listeners.delete(fn); }

  show(message: React.ReactNode, opts: ToastOptions = {}): string {
    const id = opts.id ?? `toast-${++this.counter}`;
    this.emit({ kind: 'show', id, message, rawOpts: { ...opts, id } });
    return id;
  }

  update(id: string, message: React.ReactNode, patch: Partial<ResolvedToastOptions>) {
    this.emit({ kind: 'update', id, message, patch });
  }

  dismiss(id?: string) { this.emit({ kind: 'dismiss', id }); }

  private emit(e: ToastEvent) { this.listeners.forEach(fn => fn(e)); }
}

const emitter = new ToastEmitter();

// ─── toast public API ─────────────────────────────────────────────────────────

export interface ToastFunction {
  (msg: React.ReactNode, opts?: ToastOptions): string;
  info:    (msg: React.ReactNode, opts?: ToastOptions) => string;
  success: (msg: React.ReactNode, opts?: ToastOptions) => string;
  warning: (msg: React.ReactNode, opts?: ToastOptions) => string;
  error:   (msg: React.ReactNode, opts?: ToastOptions) => string;
  dismiss: (id?: string) => void;
  promise: <T>(promise: Promise<T>, messages: ToastPromiseMessages<T>, opts?: ToastOptions) => Promise<T>;
}

export const toast: ToastFunction = Object.assign(
  (msg: React.ReactNode, opts?: ToastOptions): string => emitter.show(msg, opts),
  {
    info:    (msg: React.ReactNode, opts?: ToastOptions): string =>
      emitter.show(msg, { ...opts, type: 'info' }),
    success: (msg: React.ReactNode, opts?: ToastOptions): string =>
      emitter.show(msg, { ...opts, type: 'success' }),
    warning: (msg: React.ReactNode, opts?: ToastOptions): string =>
      emitter.show(msg, { ...opts, type: 'warning' }),
    error:   (msg: React.ReactNode, opts?: ToastOptions): string =>
      emitter.show(msg, { ...opts, type: 'error' }),
    dismiss: (id?: string): void => emitter.dismiss(id),
    promise: <T,>(
      promise: Promise<T>,
      messages: ToastPromiseMessages<T>,
      opts?: ToastOptions
    ): Promise<T> => {
      const id = emitter.show(messages.pending, { ...opts, type: 'info', duration: 0 });
      promise.then(
        result => {
          const msg = typeof messages.success === 'function' ? messages.success(result) : messages.success;
          emitter.update(id, msg, { type: 'success', duration: opts?.duration ?? 5000 });
        },
        err => {
          const msg = typeof messages.error === 'function' ? messages.error(err) : messages.error;
          emitter.update(id, msg, { type: 'error', duration: opts?.duration ?? 5000 });
        }
      );
      return promise;
    },
  }
);

// ─── Icons ────────────────────────────────────────────────────────────────────

const InfoIcon = () => (
  <svg className="dw-toast__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 5v.01M8 7.5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const SuccessIcon = () => (
  <svg className="dw-toast__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const WarningIcon = () => (
  <svg className="dw-toast__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 2.5L14 13.5H2L8 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M8 7v2.5M8 11.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const ErrorIcon = () => (
  <svg className="dw-toast__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const DEFAULT_ICONS: Record<ToastType, React.ReactNode> = {
  info:    <InfoIcon />,
  success: <SuccessIcon />,
  warning: <WarningIcon />,
  error:   <ErrorIcon />,
};

// ─── ToastItem ────────────────────────────────────────────────────────────────

interface ToastItemProps {
  id:           string;
  message:      React.ReactNode;
  options:      ResolvedToastOptions;
  exiting:      boolean;
  isLeft:       boolean;
  showProgress: boolean;
  pauseOnHover: boolean;
  animation:    'slide' | 'fade' | 'none';
  onDismiss:    (id: string) => void;
  onExited:     (id: string) => void;
}

function ToastItem({
  id, message, options, exiting, isLeft,
  showProgress, pauseOnHover, animation, onDismiss, onExited,
}: ToastItemProps) {
  const divRef    = useRef<HTMLDivElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainRef = useRef<number>(options.duration);
  const startRef  = useRef<number>(0);
  const [paused, setPaused] = useState(false);

  const startEntry =
    animation === 'none' ? 'dw-toast--visible' :
    animation === 'fade' ? 'dw-toast--fade-entering' :
    isLeft               ? 'dw-toast--entering-left' :
                           'dw-toast--entering';
  const [entryClass, setEntryClass] = useState(startEntry);

  // Lock max-height for exit collapse animation
  useLayoutEffect(() => {
    if (divRef.current) {
      divRef.current.style.maxHeight = `${divRef.current.offsetHeight}px`;
    }
  }, []);

  // Trigger entry transition on next frame
  useEffect(() => {
    if (animation === 'none') return;
    const raf = requestAnimationFrame(() => setEntryClass('dw-toast--visible'));
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss timer
  const scheduleDismiss = useCallback((ms: number) => {
    if (ms <= 0) return;
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => onDismiss(id), ms);
  }, [id, onDismiss]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    remainRef.current = options.duration;
    scheduleDismiss(options.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [options.duration, scheduleDismiss]);

  // Exit animation → call onExited after transition
  useEffect(() => {
    if (!exiting) return;
    const el = divRef.current;
    if (!el || animation === 'none') {
      onExited(id);
      return;
    }
    const handle = (e: TransitionEvent) => {
      if (e.propertyName === 'max-height') onExited(id);
    };
    el.addEventListener('transitionend', handle);
    const fallback = setTimeout(() => onExited(id), 520);
    return () => {
      el.removeEventListener('transitionend', handle);
      clearTimeout(fallback);
    };
  }, [exiting, id, onExited, animation]);

  const handleMouseEnter = () => {
    if (!pauseOnHover || options.duration === 0) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      remainRef.current = Math.max(0, remainRef.current - (Date.now() - startRef.current));
    }
    setPaused(true);
  };

  const handleMouseLeave = () => {
    if (!pauseOnHover || options.duration === 0) return;
    setPaused(false);
    scheduleDismiss(remainRef.current);
  };

  const cls = [
    'dw-toast',
    options.type && `dw-toast--${options.type}`,
    entryClass,
    exiting && 'dw-toast--exiting',
    paused  && 'dw-toast--paused',
  ].filter(Boolean).join(' ');

  const icon = options.icon !== undefined ? options.icon : (options.type ? DEFAULT_ICONS[options.type] : null);

  return (
    <div
      ref={divRef}
      role="status"
      aria-live="polite"
      className={cls}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {icon && icon}
      <div className="dw-toast__body">
        {options.content !== undefined ? options.content : message}
      </div>
      {options.closable && (
        <button
          type="button"
          className="dw-toast__close"
          onClick={() => onDismiss(id)}
          aria-label="Close notification"
        >
          <CloseIcon />
        </button>
      )}
      {showProgress && options.duration > 0 && (
        <div
          className="dw-toast__progress"
          style={{ animationDuration: `${options.duration}ms` }}
        />
      )}
    </div>
  );
}

// ─── ToastContainer ───────────────────────────────────────────────────────────

function resolveOpts(
  raw: ToastOptions & { id: string },
  defaultDuration: number,
  defaultClosable: boolean
): ResolvedToastOptions {
  return {
    id:       raw.id,
    type:     raw.type     ?? 'info',
    duration: raw.duration ?? defaultDuration,
    closable: raw.closable ?? defaultClosable,
    icon:     raw.icon,
    content:  raw.content,
    onClose:  raw.onClose,
  };
}

export function ToastContainer({
  position        = 'top-right',
  maxVisible      = 3,
  defaultDuration = 5000,
  defaultClosable = true,
  pauseOnHover    = true,
  animation       = 'slide',
  newestOnTop      = false,
  progressBar     = false,
  width           = 320,
  adapter,
}: ToastContainerProps): React.ReactElement | null {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const queueRef  = useRef<Array<{ id: string; message: React.ReactNode; rawOpts: ToastOptions & { id: string } }>>([]);
  const toastsRef = useRef<ActiveToast[]>(toasts);
  toastsRef.current = toasts;

  const handleDismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    toastsRef.current.find(t => t.id === id)?.options.onClose?.();
  }, []);

  const handleExited = useCallback((id: string) => {
    // Shift outside the updater (once) so the updater is pure and safe for StrictMode
    const promoted = queueRef.current.shift() ?? null;
    setToasts(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (!promoted) return filtered;
      const options = resolveOpts(promoted.rawOpts, defaultDuration, defaultClosable);
      return [...filtered, { id: promoted.id, message: promoted.message, options, exiting: false }];
    });
  }, [defaultDuration, defaultClosable]);

  // Subscribe to emitter (built-in path)
  useEffect(() => {
    if (adapter) return;

    const handle = (e: ToastEvent) => {
      if (e.kind === 'show') {
        // Resolve options once outside the updater so the updater stays pure
        const options = resolveOpts(e.rawOpts, defaultDuration, defaultClosable);
        const newEntry: ActiveToast = { id: e.id, message: e.message, options, exiting: false };
        const rawEntry = { id: e.id, message: e.message, rawOpts: e.rawOpts };

        setToasts(prev => {
          // Dedup check against actual prev (not stale ref) so batched calls are safe
          const existing = prev.find(t => t.id === e.id);
          if (existing) {
            return prev.map(t => t.id === e.id ? { ...t, message: e.message, options } : t);
          }
          // Count against actual prev so multiple synchronous toast() calls batch correctly
          const visible = prev.filter(t => !t.exiting).length;
          if (visible < maxVisible) {
            return [...prev, newEntry];
          }
          // Queue — guard prevents duplicate push when React calls updater twice (StrictMode)
          if (!queueRef.current.some(q => q.id === rawEntry.id)) {
            queueRef.current.push(rawEntry);
          }
          return prev;
        });
      } else if (e.kind === 'update') {
        setToasts(prev => prev.map(t => {
          if (t.id !== e.id) return t;
          const merged: ResolvedToastOptions = { ...t.options, ...e.patch, id: t.id };
          return { ...t, message: e.message, options: merged };
        }));
        queueRef.current = queueRef.current.map(q => {
          if (q.id !== e.id) return q;
          return { ...q, message: e.message, rawOpts: { ...q.rawOpts, ...e.patch } };
        });
      } else if (e.kind === 'dismiss') {
        if (e.id === undefined) {
          setToasts(prev => prev.map(t => ({ ...t, exiting: true })));
          queueRef.current = [];
        } else {
          const isActive = toastsRef.current.some(t => t.id === e.id);
          if (isActive) {
            handleDismiss(e.id);
          } else {
            queueRef.current = queueRef.current.filter(q => q.id !== e.id);
          }
        }
      }
    };

    emitter.subscribe(handle);
    return () => emitter.unsubscribe(handle);
  }, [adapter, maxVisible, defaultDuration, defaultClosable, handleDismiss]);

  // Subscribe to emitter (adapter path)
  useEffect(() => {
    if (!adapter) return;
    const handle = (e: ToastEvent) => {
      if (e.kind === 'show') {
        const opts = resolveOpts(e.rawOpts, defaultDuration, defaultClosable);
        adapter.show(e.id, e.message, opts);
      } else if (e.kind === 'update') {
        adapter.update(e.id, e.message, e.patch);
      } else if (e.kind === 'dismiss') {
        adapter.dismiss(e.id);
      }
    };
    emitter.subscribe(handle);
    return () => emitter.unsubscribe(handle);
  }, [adapter, defaultDuration, defaultClosable]);

  if (adapter) {
    if (!adapter.Container) return null;
    const AdapterContainer = adapter.Container;
    return createPortal(<AdapterContainer position={position} />, document.body);
  }

  const isLeft = position.endsWith('left');
  let dirMod   = '';
  if (newestOnTop === true)  dirMod = 'dw-toast-container--newest-top';
  if (newestOnTop === false) dirMod = 'dw-toast-container--newest-bottom';

  const cls = ['dw-toast-container', `dw-toast-container--${position}`, dirMod]
    .filter(Boolean).join(' ');

  return createPortal(
    <div className={cls} style={{ width }} aria-label="Notifications" aria-live="polite">
      {toasts.map(t => (
        <ToastItem
          key={t.id}
          id={t.id}
          message={t.message}
          options={t.options}
          exiting={t.exiting}
          isLeft={isLeft}
          showProgress={progressBar}
          pauseOnHover={pauseOnHover}
          animation={animation}
          onDismiss={handleDismiss}
          onExited={handleExited}
        />
      ))}
    </div>,
    document.body
  );
}
