/**
 * @file FloatingWidget.tsx
 * @description A floating widget inside a panel: docked to a corner or free, stretchable, resizable.
 */
import React, { useState, useContext, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import { useOptionalWindowManagerState, formatLabel, useFormatMessage, usePredefinedMessages } from '../WindowManagerContext';
import type { FloatAnchor } from '../WindowManagerContext';
import type { PanelTitle } from '../PanelProviderContext';
import { flipZoneHorizontal } from '../anchorGeometry';
import { startPointerDrag, computeResizedRect } from '../dragResize';
import type { ResizeDir } from '../dragResize';
import type { PanelFloatPlacement, Stretch } from './types';
import { PanelOverlayContext } from './context';
import type { PanelOverlayCtx } from './context';
import { stretchesInline, stretchesBlock, addAxis, releaseAxis, bucketsFor, withInlineHalf, withBlockHalf } from '../../core/stretch';
import { getHoveredZone, MIN_W, MIN_H, DOCK_INSET, DOCK_GAP, SNAP_IN, SNAP_OUT } from '../../core/panelOverlayGeometry';

// ─── PanelFloatingWindow ──────────────────────────────────────────────────────

/** Props for `<RddFloatingWidget>`. */
export interface RddFloatingWidgetProps {
  /** Unique identifier within the panel overlay. Used for z-order and stack tracking. */
  id: string;
  /** Text shown in the window's header bar. Accepts a plain string or an i18n message descriptor. */
  title: PanelTitle;
  /** Optional icon shown to the left of the title in the header. */
  icon?: React.ReactNode;
  /** Whether the window is mounted and visible. Set to `false` to close/unmount it. */
  open: boolean;
  /** Called when the user clicks the × button. Set `open` to `false` in response. */
  onClose(): void;
  /** Corner of the panel to dock to on first render. @see FloatAnchor */
  defaultAnchor: FloatAnchor;
  /** Initial width in pixels. Ignored on an axis that starts stretched, and restored to when that
   *  axis is later released. */
  defaultWidth: number;
  /** Initial height in pixels. Ignored on an axis that starts stretched, and restored to when that
   *  axis is later released. */
  defaultHeight: number;
  /**
   * Which axes span the panel on first render. Uncontrolled: gestures update it from here.
   * @see Stretch
   */
  defaultStretch?: Stretch;
  /**
   * Controlled stretch state. When provided — **including as `null`** — the caller is the single
   * source of truth: gestures report through {@link RddFloatingWidgetProps.onPlacementChange}
   * instead of updating internally, and the caller must echo the new value back. Omit entirely
   * (`undefined`) for uncontrolled behaviour, matching `ToolbarToggleItem.active` and
   * `Sidebar.activeTabId`.
   */
  stretch?: Stretch | null;
  /**
   * Called whenever a gesture changes where the widget sits — a stretched axis released, a
   * re-dock, or a detach. Reports anchor and stretch **together**, because one gesture can change
   * both at once and reporting them separately would surface a state that is never valid.
   *
   * This is also the only way to persist placement: the library serialises nothing about inner
   * widgets, so store what you receive here and feed it back via `defaultAnchor`/`stretch`.
   */
  onPlacementChange?: (placement: PanelFloatPlacement) => void;
  /**
   * Whether this widget may span the panel at all. `false` disables resize-to-stretch snapping,
   * for content that only makes sense at a bounded size. Default `true`.
   */
  stretchable?: boolean;
  children?: React.ReactNode;
}

/**
 * A floating widget inside a panel — anchored within an `RddPanelOverlay`.
 *
 * Docks to any corner, drags free of it, and drops back onto one. Windows sharing a corner stack
 * along the block axis with animated offsets. An axis can also **span the panel** instead of
 * carrying a fixed size, so the window tracks the panel as it resizes — see
 * {@link RddFloatingWidgetProps.defaultStretch} and {@link Stretch}.
 *
 * Resize handles follow what is actually movable: a free-floating window is pinned by nothing and
 * offers all eight, while a docked one offers only its free edges — plus both ends of any spanning
 * axis, either of which releases it.
 *
 * @example
 * const [infoOpen, setInfoOpen] = useState(false);
 * <RddFloatingWidget
 *   id="layer-info" title="Layer Info"
 *   open={infoOpen} onClose={() => setInfoOpen(false)}
 *   defaultAnchor="top-right" defaultWidth={300} defaultHeight={200}
 * >
 *   <LayerInfoContent />
 * </RddFloatingWidget>
 *
 * @example
 * // A full-width status strip along the bottom, tracking the panel's width.
 * // defaultHeight still applies; defaultWidth is what the inline axis returns to if released.
 * <RddFloatingWidget
 *   id="timeline" title="Timeline"
 *   open onClose={close}
 *   defaultAnchor="bottom-left" defaultStretch="width"
 *   defaultWidth={240} defaultHeight={120}
 * >
 *   <TimelineContent />
 * </RddFloatingWidget>
 */
export function PanelFloatingWindow(props: RddFloatingWidgetProps): React.ReactElement | null {
  const ctx = useContext(PanelOverlayContext);
  if (!props.open) return null;
  return <FloatingWindowBody key={props.id} ctx={ctx} {...props} />;
}

// ─── Internal: FloatingWindowBody ─────────────────────────────────────────────

interface FloatingWindowBodyProps extends RddFloatingWidgetProps {
  ctx: PanelOverlayCtx | null;
}

type WindowMode = 'docked' | 'free';


function FloatingWindowBody({ id, title, icon, defaultAnchor, defaultWidth, defaultHeight, defaultStretch, stretch: stretchProp, onPlacementChange, stretchable = true, children, ctx, onClose }: FloatingWindowBodyProps): React.ReactElement {
  const isRtl = useOptionalWindowManagerState(s => s.isRtl, false);
  // Resolved here rather than at the call site, so a descriptor title re-resolves whenever the
  // formatter changes. Both hooks fall back to the message's own `defaultMessage` when there is no
  // provider, so an overlay used outside a WindowManager keeps working.
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const [mode, setMode] = useState<WindowMode>('docked');
  const [currentAnchor, setCurrentAnchor] = useState<FloatAnchor>(defaultAnchor);
  // `size` is deliberately left untouched while an axis is stretched — the render branch below
  // simply stops reading it, exactly as a maximized workspace window keeps its x/y/w/h. Releasing
  // the axis therefore restores the previous size with no snapshot and no bookkeeping.
  const [internalStretch, setInternalStretch] = useState<Stretch | null>(defaultStretch ?? null);
  // Controlled when the prop is present at all — `null` is a meaningful value ("not stretched"),
  // so only `undefined` means "manage it yourself".
  const isStretchControlled = stretchProp !== undefined;
  const stretch = isStretchControlled ? (stretchProp ?? null) : internalStretch;
  const [freePos, setFreePos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: defaultWidth, h: defaultHeight });
  const windowRef = useRef<HTMLDivElement>(null);

  // Refs to avoid stale closures in pointer handlers
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const freePosRef = useRef(freePos);
  freePosRef.current = freePos;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const stretchRef = useRef(stretch);
  stretchRef.current = stretch;
  const currentAnchorRef = useRef(currentAnchor);
  currentAnchorRef.current = currentAnchor;
  const onPlacementChangeRef = useRef(onPlacementChange);
  onPlacementChangeRef.current = onPlacementChange;
  /** Which axes would snap to stretched if the drag were released now — drives the visual cue. */
  const [snapArmed, setSnapArmed] = useState<{ inline: boolean; block: boolean }>({ inline: false, block: false });
  const snapArmedRef = useRef(snapArmed);
  snapArmedRef.current = snapArmed;
  /** The block extent available to this widget depends on what it is stacked behind. */
  const stackOffsetRef = useRef(0);

  /**
   * The single write path for placement. Anchor is always internal; stretch is internal only when
   * uncontrolled. Either way the pair is reported once, so a listener never observes a half-applied
   * transition.
   */
  const applyPlacement = useCallback((anchor: FloatAnchor, next: Stretch | null): void => {
    setCurrentAnchor(anchor);
    if (!isStretchControlled) setInternalStretch(next);
    onPlacementChangeRef.current?.({ anchor, stretch: next });
  }, [isStretchControlled]);

  const dragState = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number; hasDragged: boolean } | null>(null);

  // Bucket membership depends on the whole placement (see bucketsFor), so this re-runs whenever
  // the anchor or a stretched axis changes — not only on mount. Free-floating widgets are in no
  // stack at all.
  useLayoutEffect(() => {
    if (mode !== 'docked') return;
    ctx?.dockWindow(id, currentAnchor, stretch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentAnchor, stretch]);

  // Leave the stack on unmount (close). Closing resets to the defaults on the next open, since a
  // fresh mount means fresh state.
  useLayoutEffect(() => () => { ctx?.undockWindow(id); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  // Dev-only: a block-stretched widget spans the whole block axis, so it cannot stack with
  // anything — it will simply overlap siblings on its own inline side, with z-order deciding.
  // Warns once per widget, matching the warning conventions in Sidebar/WindowManager.
  const blockStretchWarnedRef = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (blockStretchWarnedRef.current) return;
    if (mode !== 'docked' || !stretchesBlock(stretch) || !ctx) return;
    const half = currentAnchor.endsWith('-right') ? 'right' : 'left';
    const neighbours = ([`top-${half}`, `bottom-${half}`] as FloatAnchor[])
      .flatMap(bucket => ctx.stacks[bucket] ?? [])
      .filter(other => other !== id);
    if (neighbours.length === 0) return;
    blockStretchWarnedRef.current = true;
    console.warn(
      `[react-dockable-desktop] RddFloatingWidget "${id}" stretches the block axis ` +
      `(stretch: "${stretch}") while ${neighbours.length} other widget(s) are anchored to the ` +
      `same side (${neighbours.join(', ')}). A block-stretched widget spans the axis that stacking ` +
      `uses to separate siblings, so it cannot stack and will overlap them — z-order decides which ` +
      `is on top. Either give it a fixed height, or move the other widgets to the opposite side.`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stretch, currentAnchor, ctx?.stacks, id]);

  // Report height whenever size changes so stack peers can compute their offset.
  useEffect(() => {
    ctx?.reportDockedSize(id, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.h]);

  const zOrder = ctx?.zOrders[id] ?? 101;

  const isActive = !ctx || ctx.topId === id;

  const getContainerBounds = (): { cw: number; ch: number } => {
    const container = windowRef.current?.offsetParent as HTMLElement | null;
    return { cw: container?.clientWidth ?? 9999, ch: container?.clientHeight ?? 9999 };
  };

  /**
   * The band a docked widget is allowed to occupy, in physical pixels from the container's edges.
   *
   * The block axis keeps clear of top/bottom `PanelToolbar`s only; the inline axis also adds the
   * `DOCK_INSET` gutter, matching how a docked widget is already positioned (one inline inset of
   * `DOCK_INSET`, one block inset of the toolbar size). Growth previously stopped at the raw
   * container edge, so a docked widget could be resized straight over the toolbar on the far side —
   * which the library elsewhere treats as a bug (a 5.x fix stopped docked floats *positioning*
   * themselves over a toolbar; the resize path never got the same treatment).
   *
   * Inline is converted from logical to physical here because handle directions and measured rects
   * are physical, while `PanelToolbar` claims its space logically.
   */
  const dockedBand = (): { left: number; right: number; top: number; bottom: number } => {
    const logicalStart = ctx?.insetInlineStart ?? 0;
    const logicalEnd = ctx?.insetInlineEnd ?? 0;
    return {
      left: (isRtl ? logicalEnd : logicalStart) + DOCK_INSET,
      right: (isRtl ? logicalStart : logicalEnd) + DOCK_INSET,
      top: ctx?.insetTop ?? 0,
      bottom: ctx?.insetBottom ?? 0,
    };
  };

  const handleWindowPointerDown = (): void => {
    ctx?.focusWindow(id);
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();

    let startX: number;
    let startY: number;

    if (modeRef.current === 'docked') {
      // Snapshot the rendered position so that *if* this becomes a real drag, switching to free
      // positioning causes no visual jump. Undocking itself is deferred to the drag threshold
      // below — doing it here meant a plain click on the header silently tore the widget off its
      // anchor: it looked unchanged, but its stacked siblings reflowed to close the gap and it
      // stopped tracking the corner on every later panel resize.
      const el = windowRef.current;
      const container = ctx?.containerRef?.current;
      if (el && container) {
        const elRect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        startX = elRect.left - cRect.left;
        startY = elRect.top - cRect.top;
      } else {
        startX = DOCK_INSET;
        startY = ctx?.insetTop ?? 0;
      }
    } else {
      startX = freePosRef.current?.x ?? 0;
      startY = freePosRef.current?.y ?? 0;
    }

    dragState.current = { mouseX: e.clientX, mouseY: e.clientY, posX: startX, posY: startY, hasDragged: false };
    windowRef.current?.setPointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (dir: ResizeDir) => (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Snapshot current rendered position for offset-from-edge calculations
    let startX = 0, startY = 0;
    if (modeRef.current === 'free') {
      startX = freePosRef.current?.x ?? 0;
      startY = freePosRef.current?.y ?? 0;
    } else {
      const el = windowRef.current;
      const container = el?.offsetParent as HTMLElement | null;
      if (el && container) {
        const er = el.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        startX = er.left - cr.left;
        startY = er.top - cr.top;
      }
    }
    // For a stretched axis the stored size is stale by design (the render branch stops reading it),
    // so the drag has to start from the *measured* extent or the widget would jump.
    const measured = windowRef.current?.getBoundingClientRect();
    const startRect = {
      x: startX,
      y: startY,
      w: stretchesInline(stretchRef.current) && measured ? measured.width : sizeRef.current.w,
      h: stretchesBlock(stretchRef.current) && measured ? measured.height : sizeRef.current.h,
    };

    // Dragging an end of a stretched axis releases that axis: the edge under the pointer becomes
    // the moving one and the opposite end becomes the new pin, so it reads exactly like an ordinary
    // resize. Done once per drag; `released` guards against repeat moves before the re-render.
    const dragsInline = dir.includes('e') || dir.includes('w');
    const dragsBlock = dir.includes('n') || dir.includes('s');
    let released = false;
    let armed = { inline: false, block: false };
    const releaseIfNeeded = (): void => {
      if (released || modeRef.current !== 'docked') return;
      const st = stretchRef.current;
      const releasingInline = dragsInline && stretchesInline(st);
      const releasingBlock = dragsBlock && stretchesBlock(st);
      if (!releasingInline && !releasingBlock) return;
      released = true;

      let next = st;
      let nextAnchor = currentAnchorRef.current;
      if (releasingInline) {
        next = releaseAxis(next, 'inline');
        // Pin the end opposite the dragged edge. Handle dirs are physical, anchors are logical.
        const pinsPhysicalLeft = dir.includes('e');
        nextAnchor = withInlineHalf(nextAnchor, (pinsPhysicalLeft !== isRtl) ? 'left' : 'right');
      }
      if (releasingBlock) {
        next = releaseAxis(next, 'block');
        nextAnchor = withBlockHalf(nextAnchor, dir.includes('s') ? 'top' : 'bottom');
      }
      applyPlacement(nextAnchor, next);
    };

    startPointerDrag({
      element: e.currentTarget,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      captureStart: () => startRect,
      activeClasses: [{ el: document.body, classes: ['rdd-resizing-active'] }],
      onMove: (dx, dy, start) => {
        // Re-measured every move, matching the original's live re-measurement —
        // the container can in principle change size during a drag.
        const { cw, ch } = getContainerBounds();
        // Docked widgets stop at the toolbar band; free-floating ones stay unconstrained beyond the
        // container itself, since "free" means free.
        const band = modeRef.current === 'docked'
          ? dockedBand()
          : { left: 0, right: 0, top: 0, bottom: 0 };
        const { x: newX, y: newY, w: newW, h: newH } = computeResizedRect(dir, dx, dy, start, {
          minW: MIN_W, minH: MIN_H,
          maxW: (cw - band.right) - start.x, maxH: (ch - band.bottom) - start.y,
          minX: band.left, minY: band.top,
        });
        releaseIfNeeded();

        // ── resize-to-stretch snapping ──
        // The clamps above already stop growth exactly where a stretched axis would sit, so an
        // armed drag is already visually at its target; the cue is an outline rather than a ghost.
        if (modeRef.current === 'docked' && stretchable) {
          const fullInline = cw - band.left - band.right;
          const fullBlock = ch - band.top - band.bottom - stackOffsetRef.current;
          const st = stretchRef.current;
          const nextArmed = { ...armed };
          if (dragsInline && !stretchesInline(st)) {
            if (newW >= fullInline - SNAP_IN) nextArmed.inline = true;
            else if (armed.inline && newW < fullInline - SNAP_OUT) nextArmed.inline = false;
          }
          if (dragsBlock && !stretchesBlock(st)) {
            if (newH >= fullBlock - SNAP_IN) nextArmed.block = true;
            else if (armed.block && newH < fullBlock - SNAP_OUT) nextArmed.block = false;
          }
          if (nextArmed.inline !== armed.inline || nextArmed.block !== armed.block) {
            armed = nextArmed;
            setSnapArmed(nextArmed);
          }
        }
        // Only write an axis that carries a size. A still-stretched axis must keep its stored
        // value, so releasing it later restores the size it had before stretching.
        const st = released ? releaseAxis(releaseAxis(stretchRef.current,
          dragsInline ? 'inline' : 'block'), dragsBlock ? 'block' : 'inline') : stretchRef.current;
        setSize(prev => ({
          w: stretchesInline(st) ? prev.w : newW,
          h: stretchesBlock(st) ? prev.h : newH,
        }));
        if (modeRef.current === 'free') {
          setFreePos({ x: newX, y: newY });
        }
      },
      onEnd: (start) => {
        if (!armed.inline && !armed.block) {
          if (snapArmedRef.current.inline || snapArmedRef.current.block) {
            setSnapArmed({ inline: false, block: false });
          }
          return;
        }
        // Restore the size the axis had *before* this drag: while an axis is stretched its stored
        // size is what releasing it later returns to, so it should be the size the user last chose
        // deliberately — not the full-bleed value the drag happened to pass through.
        setSize(prev => ({
          w: armed.inline ? start.w : prev.w,
          h: armed.block ? start.h : prev.h,
        }));
        let next = stretchRef.current;
        if (armed.inline) next = addAxis(next, 'inline');
        if (armed.block) next = addAxis(next, 'block');
        applyPlacement(currentAnchorRef.current, next);
        setSnapArmed({ inline: false, block: false });
      },
    });
  };

  const handleWindowPointerMove = (e: React.PointerEvent): void => {
    if (dragState.current) {
      const ds = dragState.current;
      if (!ds.hasDragged) {
        const dist = Math.abs(e.clientX - ds.mouseX) + Math.abs(e.clientY - ds.mouseY);
        if (dist < 4) return;
        ds.hasDragged = true;
        // This, not pointerdown, is the moment the widget leaves its anchor.
        if (modeRef.current === 'docked') {
          // A stretched axis carries no size, so free mode — which positions from an explicit box —
          // would otherwise snap back to whatever the size was before stretching. Materialise what
          // is actually on screen, then clear stretch: "free" and "spanning the panel" are
          // mutually exclusive.
          if (stretchRef.current) {
            const r = windowRef.current?.getBoundingClientRect();
            if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
            applyPlacement(currentAnchorRef.current, null);
          }
          ctx?.undockWindow(id);
          setMode('free');
        }
        document.body.classList.add('rdd-dragging-active');
        ctx?.setDraggingId(id);
      }
      const { cw, ch } = getContainerBounds();
      const newX = Math.max(0, Math.min(ds.posX + e.clientX - ds.mouseX, cw - sizeRef.current.w));
      const newY = Math.max(0, Math.min(ds.posY + e.clientY - ds.mouseY, ch - sizeRef.current.h));
      setFreePos({ x: newX, y: newY });

      const container = ctx?.containerRef?.current;
      if (container) {
        const rawZone = getHoveredZone(container, e.clientX, e.clientY);
        ctx?.setHoveredZone(rawZone && isRtl ? flipZoneHorizontal(rawZone) : rawZone);
      }
    }
  };

  const handleWindowPointerUp = (): void => {
    if (dragState.current?.hasDragged) {
      const zone = ctx?.hoveredZone;
      if (zone) {
        ctx?.dockWindow(id, zone, stretchRef.current);
        setMode('docked');
        setFreePos(null);
        applyPlacement(zone, stretchRef.current);
      }
      ctx?.setHoveredZone(null);
      ctx?.setDraggingId(null);
    }
    document.body.classList.remove('rdd-dragging-active');
    dragState.current = null;
  };

  const handleWindowPointerCancel = (): void => {
    if (dragState.current?.hasDragged) {
      ctx?.setHoveredZone(null);
      ctx?.setDraggingId(null);
    }
    document.body.classList.remove('rdd-dragging-active');
    dragState.current = null;
  };

  // ── Compute position style ─────────────────────────────────────────────────
  let windowStyle: React.CSSProperties;

  if (mode === 'docked' && ctx) {
    // Offset is the largest offset across every bucket this widget occupies, so a strip spanning
    // an edge clears whatever is stacked in *both* of that edge's corners.
    const buckets = bucketsFor(currentAnchor, stretch);
    let stackOffset = 0;
    // A widget with no buckets (block-stretched) is never "in" a stack, so it must not be held
    // invisible by the not-yet-registered guard below.
    let registered = buckets.length === 0;
    for (const bucket of buckets) {
      const stack = ctx.stacks[bucket] ?? [];
      const idx = stack.indexOf(id);
      if (idx === -1) continue;
      registered = true;
      let offset = 0;
      for (let i = 0; i < idx; i++) {
        offset += (ctx.dockedSizes[stack[i]] ?? defaultHeight) + DOCK_GAP;
      }
      stackOffset = Math.max(stackOffset, offset);
    }
    stackOffsetRef.current = stackOffset;

    const band = dockedBand();

    windowStyle = {
      zIndex: zOrder,
      transition: 'top 0.2s ease, bottom 0.2s ease',
      // Hide until registered in stack (first layout effect hasn't run yet)
      opacity: registered ? undefined : 0,
      pointerEvents: registered ? undefined : 'none',
    };

    // Inline axis: one inset plus an explicit width, or both insets and no width at all. Setting
    // both ends is the whole mechanism — CSS then keeps the widget spanning the panel for free.
    if (stretchesInline(stretch)) {
      windowStyle.insetInlineStart = (ctx.insetInlineStart ?? 0) + DOCK_INSET;
      windowStyle.insetInlineEnd = (ctx.insetInlineEnd ?? 0) + DOCK_INSET;
    } else {
      windowStyle[currentAnchor.endsWith('-right') ? 'insetInlineEnd' : 'insetInlineStart'] = DOCK_INSET;
      windowStyle.width = size.w;
    }

    // Block axis: same idea. Note the block insets carry no DOCK_INSET gutter, matching how a
    // docked widget has always been positioned against a top/bottom toolbar (flush, not inset).
    if (stretchesBlock(stretch)) {
      windowStyle.top = band.top;
      windowStyle.bottom = band.bottom;
    } else if (currentAnchor.startsWith('top-')) {
      windowStyle.top = band.top + stackOffset;
      windowStyle.height = size.h;
    } else {
      windowStyle.bottom = band.bottom + stackOffset;
      windowStyle.height = size.h;
    }
  } else {
    windowStyle = {
      left: freePos?.x ?? 0,
      top: freePos?.y ?? 0,
      width: size.w,
      height: size.h,
      zIndex: zOrder,
    };
  }

  // ── Which resize handles this window offers ────────────────────────────────
  // Free-floating: all eight, nothing is pinned.
  //
  // Docked: only the edges that can actually move. A docked window has one edge pinned per axis
  // (see the positioning block above — `top-*` pins `top`, `bottom-*` pins `bottom`, `*-left`
  // pins `insetInlineStart`, `*-right` pins `insetInlineEnd`), so dragging a handle on a pinned
  // side moves the *opposite* edge instead of the one under the cursor, and can't move it further
  // than that side's own inset before `computeResizedRect`'s bounds stop it — an inert stub with a
  // resize cursor on it. The handle set used to be hardcoded to the five non-northern directions
  // regardless of anchor, which made that harmless-looking for top anchors but left every
  // bottom-anchored window with no working vertical resize at all: `n` wasn't rendered, and `s`
  // was the stub.
  //
  // Restricting docked mode to free edges also means the existing resize bounds are already
  // correct for every direction that remains: `maxW`/`maxH` apply only to eastward/southward
  // growth (where the top-left origin genuinely is pinned), while `minX`/`minY` bound the moving
  // edge for westward/northward growth — so no change to the resize math is needed.
  const handleDirs: ResizeDir[] = React.useMemo(() => {
    if (mode === 'free') return ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

    // Block axis is direction-agnostic; the inline axis is not. The pin is a logical property
    // (`insetInlineEnd`) but the handle classes are physical (`.rdd-resize-e { right: -4px }`), so
    // which *physical* side is pinned depends on the window's own `dir`.
    const freeBlock: ResizeDir = currentAnchor.startsWith('top-') ? 's' : 'n';
    const pinsPhysicalRight = currentAnchor.endsWith('-right') !== isRtl;
    const freeInline: ResizeDir = pinsPhysicalRight ? 'w' : 'e';

    const inlineStretched = stretchesInline(stretch);
    const blockStretched = stretchesBlock(stretch);

    // A stretched axis has both ends pinned, but both are *releasable*: dragging either end moves
    // that edge and pins the opposite one, so the widget leaves stretch at the width the drag
    // produced. Hence handles on both ends — which is also what keeps the fully-stretched state
    // from being a dead end with nothing to grab.
    const dirs: ResizeDir[] = [];
    dirs.push(...(inlineStretched ? (['e', 'w'] as ResizeDir[]) : [freeInline]));
    dirs.push(...(blockStretched ? (['n', 's'] as ResizeDir[]) : [freeBlock]));
    // The corner belongs only to the all-pinned state; in a stretched state it would mix a resize
    // and a release into one gesture.
    if (!inlineStretched && !blockStretched) dirs.push(`${freeBlock}${freeInline}` as ResizeDir);
    return dirs;
  }, [mode, currentAnchor, isRtl, stretch]);

  const CloseIcon = (
    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="1" x2="9" y2="9" />
      <line x1="9" y1="1" x2="1" y2="9" />
    </svg>
  );

  return (
    <div
      ref={windowRef}
      dir={isRtl ? 'rtl' : 'ltr'}
      data-rdd-widget={id}
      className={[
        'rdd-panel-float',
        isActive ? 'rdd-panel-float--active' : '',
        snapArmed.inline || snapArmed.block ? 'rdd-panel-float--snapping' : '',
      ].filter(Boolean).join(' ')}
      style={windowStyle}
      onPointerDown={handleWindowPointerDown}
      onPointerMove={handleWindowPointerMove}
      onPointerUp={handleWindowPointerUp}
      onPointerCancel={handleWindowPointerCancel}
    >
      {/* Clips header and body to the rounded corners; the resize handles are its siblings so
          they can straddle the edge instead of being half clipped. */}
      <div className="rdd-panel-float__frame">
      <div className="rdd-panel-float__header" onPointerDown={handleHeaderPointerDown}>
        {icon && <span className="rdd-panel-float__icon">{icon}</span>}
        <span className="rdd-panel-float__title">{formatLabel(title, formatMessage)}</span>
        <button
          type="button"
          className="rdd-panel-float__close"
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          title={formatLabel(messages.closeTooltip, formatMessage)}
          aria-label={formatLabel(messages.closeTooltip, formatMessage)}
        >
          {CloseIcon}
        </button>
      </div>
      <div className="rdd-panel-float__body">{children}</div>
      </div>
      {handleDirs.map(dir => (
        <div
          key={dir}
          className={`rdd-resize-handle rdd-resize-${dir}`}
          onPointerDown={handleResizePointerDown(dir)}
        />
      ))}
    </div>
  );
}
