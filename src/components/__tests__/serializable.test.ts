import { describe, it, expect } from 'vitest';
import React from 'react';
import { isSerializable } from '../serializable';

class CustomClass {
  value = 1;
}

describe('isSerializable', () => {
  it('accepts primitives and null', () => {
    expect(isSerializable('hello')).toBe(true);
    expect(isSerializable(42)).toBe(true);
    expect(isSerializable(true)).toBe(true);
    expect(isSerializable(null)).toBe(true);
  });

  it('rejects a bare undefined', () => {
    expect(isSerializable(undefined)).toBe(false);
  });

  it('accepts arrays and plain objects of serializable values', () => {
    expect(isSerializable([1, 'two', true, null])).toBe(true);
    expect(isSerializable({ a: 1, b: { c: 'nested' }, d: [1, 2, 3] })).toBe(true);
    expect(isSerializable(Object.create(null))).toBe(true);
  });

  it('rejects an array or object containing undefined anywhere', () => {
    expect(isSerializable([1, undefined, 3])).toBe(false);
    expect(isSerializable({ a: 1, b: undefined })).toBe(false);
    expect(isSerializable({ a: { b: { c: undefined } } })).toBe(false);
  });

  it('rejects functions and symbols, anywhere in the tree', () => {
    expect(isSerializable(() => {})).toBe(false);
    expect(isSerializable(Symbol('x'))).toBe(false);
    expect(isSerializable({ onSave: () => {} })).toBe(false);
    expect(isSerializable({ nested: { fn: () => {} } })).toBe(false);
  });

  it('rejects React elements', () => {
    expect(isSerializable(React.createElement('div'))).toBe(false);
    expect(isSerializable({ icon: React.createElement('svg') })).toBe(false);
  });

  it('rejects class instances, Map, and Set', () => {
    expect(isSerializable(new CustomClass())).toBe(false);
    expect(isSerializable(new Map())).toBe(false);
    expect(isSerializable(new Set())).toBe(false);
    expect(isSerializable({ instance: new CustomClass() })).toBe(false);
  });

  it('treats Date as serializable-enough, matching JSON.stringify\'s own behavior', () => {
    expect(isSerializable(new Date())).toBe(true);
    expect(isSerializable({ createdAt: new Date() })).toBe(true);
  });
});
