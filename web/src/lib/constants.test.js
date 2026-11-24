import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKeyToMillis, todayKey, weekStartKey } from '../config/constants.js';

describe('date key helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 13, 45, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats todayKey from a date and defaults to the current date', () => {
    expect(todayKey(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
    expect(todayKey(new Date(2026, 10, 24, 23, 59))).toBe('2026-11-24');
    expect(todayKey()).toBe('2026-11-24');
  });

  it('resolves weekStartKey to Sunday, including Sunday input', () => {
    expect(weekStartKey(new Date(2026, 10, 24, 23, 59))).toBe('2026-11-22');
    expect(weekStartKey(new Date(2026, 10, 22, 0, 5))).toBe('2026-11-22');
    expect(weekStartKey()).toBe('2026-11-22');
  });

  it('converts date keys to local midnight millis', () => {
    expect(dateKeyToMillis('2026-11-24')).toBe(new Date(2026, 10, 24).getTime());
    expect(dateKeyToMillis('2026-02-03')).toBe(new Date(2026, 1, 3).getTime());
    expect(new Date(dateKeyToMillis('2026-11-24')).getHours()).toBe(0);
    expect(Number.isNaN(dateKeyToMillis('bad'))).toBe(true);
  });
});
