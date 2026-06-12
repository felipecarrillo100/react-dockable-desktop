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
