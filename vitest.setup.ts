// Suppress React 18/19 act(...) environment check warnings globally in JSDOM
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement ResizeObserver — stub it out for all tests
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement MutationObserver with all APIs — ensure it is present
if (typeof globalThis.MutationObserver === 'undefined') {
  globalThis.MutationObserver = class MutationObserver {
    constructor(_callback: MutationCallback) {}
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

// jsdom does not implement Pointer Events capture APIs — stub them out
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = function(_pointerId: number) {};
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = function(_pointerId: number) {};
}
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = function(_pointerId: number) { return false; };
}

// jsdom does not implement navigator.vibrate — stub it out
if (typeof navigator.vibrate === 'undefined') {
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
}
