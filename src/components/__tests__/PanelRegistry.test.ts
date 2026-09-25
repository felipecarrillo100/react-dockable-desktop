import { describe, it, expect } from 'vitest';
import { globalPanelRegistry } from '../PanelRegistry';

const ComponentA = () => null;
const ComponentB = () => null;

describe('globalPanelRegistry', () => {
  it('should register a component and retrieve it by key', () => {
    globalPanelRegistry.register('reg-basic', ComponentA, { title: 'Panel A' });
    const entry = globalPanelRegistry.get('reg-basic');
    expect(entry).toBeDefined();
    expect(entry!.Component).toBe(ComponentA);
  });

  it('should return undefined for an unregistered key', () => {
    expect(globalPanelRegistry.get('nonexistent-key-xyz')).toBeUndefined();
  });

  it('should store all defaultOptions alongside the component', () => {
    globalPanelRegistry.register('reg-full-opts', ComponentA, {
      title: 'Full Opts',
      canClose: false,
      canMinimize: false,
      canDrag: false,
      initialTarget: 'floating',
      favoritePosition: { x: 50, y: 50, width: 300, height: 200 },
    });

    const opts = globalPanelRegistry.get('reg-full-opts')!.defaultOptions!;
    expect(opts.title).toBe('Full Opts');
    expect(opts.canClose).toBe(false);
    expect(opts.canMinimize).toBe(false);
    expect(opts.canDrag).toBe(false);
    expect(opts.initialTarget).toBe('floating');
    expect(opts.favoritePosition).toEqual({ x: 50, y: 50, width: 300, height: 200 });
  });

  it('should overwrite an existing registration', () => {
    globalPanelRegistry.register('reg-overwrite', ComponentA, { title: 'First' });
    globalPanelRegistry.register('reg-overwrite', ComponentB, { title: 'Second' });

    const entry = globalPanelRegistry.get('reg-overwrite')!;
    expect(entry.Component).toBe(ComponentB);
    expect(entry.defaultOptions!.title).toBe('Second');
  });

  it('should accept an i18n descriptor object as title', () => {
    globalPanelRegistry.register('reg-i18n-title', ComponentB, {
      title: { id: 'app.panelTitle', defaultMessage: 'Translated Panel' },
    });

    expect(globalPanelRegistry.get('reg-i18n-title')!.defaultOptions!.title).toEqual({
      id: 'app.panelTitle',
      defaultMessage: 'Translated Panel',
    });
  });

  it('should register without options and still be retrievable', () => {
    globalPanelRegistry.register('reg-no-opts', ComponentA);
    const entry = globalPanelRegistry.get('reg-no-opts');
    expect(entry).toBeDefined();
    expect(entry!.Component).toBe(ComponentA);
  });

  it('should store disableLivePreview flag', () => {
    globalPanelRegistry.register('reg-no-preview', ComponentA, { disableLivePreview: true });
    expect(globalPanelRegistry.get('reg-no-preview')!.defaultOptions!.disableLivePreview).toBe(true);
  });
});
