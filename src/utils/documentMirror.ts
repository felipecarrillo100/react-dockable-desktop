/**
 * What a workspace mirrors onto `<html>`: its skin, its animations opt-out and its stacking base.
 *
 * Chrome that renders outside the workspace element (the toolbar, the sidebar, portaled menus, toasts,
 * flyouts, modals) can only inherit these from the document, so they are written there. The document
 * is shared by every workspace on the page, which is why this module keeps state at module level, per
 * document — and why it is a stack of owners rather than a plain write: with two workspaces mounted,
 * each used to overwrite the other, and unmounting either one removed the values for the one still on
 * screen.
 *
 * Each field shows the most recently mounted owner that claims it. An owner releases only the fields
 * it claimed; releasing the last claim of a field removes it from `<html>`, as a single workspace
 * always did. A field nobody claims is never touched, so a value the page set itself survives.
 */

export interface DocumentMirrorValues {
  /** `data-rdd-skin`. `null` claims "no skin attribute". */
  skin?: string | null;
  /** The `rdd-no-animations` class. */
  noAnimations?: boolean;
  /** `--rdd-z-base`. */
  zBase?: number;
}

type Field = keyof DocumentMirrorValues;
const FIELDS: readonly Field[] = ['skin', 'noAnimations', 'zBase'];

interface Claim { owner: object; values: DocumentMirrorValues }

const stacks = new WeakMap<Document, Claim[]>();

function apply(doc: Document, stack: readonly Claim[], touched: readonly Field[]): void {
  const root = doc.documentElement;
  // The newest owner that claims a field decides it.
  const pick = <K extends Field>(field: K): { claimed: boolean; value?: DocumentMirrorValues[K] } => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (field in stack[i].values) return { claimed: true, value: stack[i].values[field] };
    }
    return { claimed: false };
  };

  if (touched.includes('skin')) {
    const skin = pick('skin');
    if (skin.claimed && skin.value) root.setAttribute('data-rdd-skin', skin.value);
    else root.removeAttribute('data-rdd-skin');
  }
  if (touched.includes('noAnimations')) {
    const noAnimations = pick('noAnimations');
    root.classList.toggle('rdd-no-animations', noAnimations.claimed && noAnimations.value === true);
  }
  if (touched.includes('zBase')) {
    const zBase = pick('zBase');
    if (zBase.claimed && zBase.value !== undefined) root.style.setProperty('--rdd-z-base', String(zBase.value));
    else root.style.removeProperty('--rdd-z-base');
  }
}

/**
 * Claims (or updates) `owner`'s values. A first claim puts the owner on top; an update keeps its
 * place, so changing one workspace's skin never lets it jump over a workspace mounted after it.
 */
export function claimDocumentMirror(owner: object, values: DocumentMirrorValues, doc: Document = document): void {
  const stack = stacks.get(doc) ?? [];
  stacks.set(doc, stack);
  const claim = stack.find(c => c.owner === owner);
  if (claim) Object.assign(claim.values, values);
  else stack.push({ owner, values: { ...values } });
  apply(doc, stack, Object.keys(values) as Field[]);
}

/** Releases `owner`'s claim on `fields`; the owner leaves the stack once it claims nothing. */
export function releaseDocumentMirror(owner: object, fields: readonly Field[] = FIELDS, doc: Document = document): void {
  const stack = stacks.get(doc);
  if (!stack) return;
  const index = stack.findIndex(c => c.owner === owner);
  if (index === -1) return;
  const claim = stack[index];
  const released = fields.filter(field => field in claim.values);
  for (const field of released) delete claim.values[field];
  if (Object.keys(claim.values).length === 0) stack.splice(index, 1);
  apply(doc, stack, released);
}
