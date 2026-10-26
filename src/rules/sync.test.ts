import { describe, expect, it } from 'vitest';
import { canonicalJson, decideSync, deviceLabel } from './sync';

const local = (hash: string, hasProfile = true) => ({ hash, hasProfile });

describe('decideSync', () => {
  it('copies the phone to an empty account', () => {
    expect(decideSync({ local: local('a'), last: null, cloud: null }).action).toBe('upload');
  });

  it('restores a fresh phone from the account and never uploads an empty phone', () => {
    expect(decideSync({ local: local('empty', false), last: null, cloud: { version: 3, hash: 'b' } }).action).toBe('download');
    expect(decideSync({ local: local('empty', false), last: { version: 3, hash: 'b' }, cloud: { version: 3, hash: 'b' } }).action).toBe('download');
    expect(decideSync({ local: local('empty', false), last: null, cloud: null }).action).toBe('none');
  });

  it('asks when a phone with data meets an account with different data', () => {
    expect(decideSync({ local: local('a'), last: null, cloud: { version: 1, hash: 'b' } }).action).toBe('conflict');
  });

  it('only records agreement when both already match', () => {
    expect(decideSync({ local: local('a'), last: null, cloud: { version: 4, hash: 'a' } }).action).toBe('mark');
    expect(decideSync({ local: local('a'), last: { version: 4, hash: 'a' }, cloud: { version: 4, hash: 'a' } }).action).toBe('none');
    // Both changed, but to the same data: nothing to choose between.
    expect(decideSync({ local: local('c'), last: { version: 4, hash: 'a' }, cloud: { version: 5, hash: 'c' } }).action).toBe('mark');
  });

  it('uploads phone changes, downloads account changes, and asks when both changed', () => {
    const last = { version: 2, hash: 'a' };
    expect(decideSync({ local: local('a'), last, cloud: { version: 2, hash: 'a' } }).action).toBe('none');
    expect(decideSync({ local: local('b'), last, cloud: { version: 2, hash: 'a' } }).action).toBe('upload');
    expect(decideSync({ local: local('a'), last, cloud: { version: 3, hash: 'c' } }).action).toBe('download');
    expect(decideSync({ local: local('b'), last, cloud: { version: 3, hash: 'c' } }).action).toBe('conflict');
  });

  it('gives a plain reason for every decision', () => {
    expect(decideSync({ local: local('b'), last: { version: 2, hash: 'a' }, cloud: { version: 3, hash: 'c' } }).reason).toMatch(/both changed/);
  });
});

describe('canonicalJson', () => {
  it('ignores key order and undefined fields, so equal data hashes equally', () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }], c: undefined })).toBe('{"a":[{"x":1,"y":2}],"b":1}');
    expect(canonicalJson({ a: 1, b: null })).toBe(canonicalJson({ b: null, a: 1 }));
  });
});

describe('deviceLabel', () => {
  it('names common devices', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36')).toBe('Android phone');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130')).toBe('Windows computer');
  });
});
