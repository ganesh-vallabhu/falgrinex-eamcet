import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidate, memoize } from './cache.js';

describe('memoize', () => {
  beforeEach(() => {
    invalidate('');
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidate('');
  });

  it('caches resolved promises', async () => {
    const producer = vi.fn().mockResolvedValue('value');
    const first = memoize('async:key', 5_000, producer);
    const second = memoize('async:key', 5_000, producer);

    expect(first).toBe(second);
    await expect(first).resolves.toBe('value');
    await expect(second).resolves.toBe('value');
    expect(memoize('async:key', 5_000, producer)).toBe('value');
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('does not cache rejected promises', async () => {
    const producer = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('recovered');

    await expect(memoize('async:reject', 5_000, producer)).rejects.toThrow('boom');
    await expect(memoize('async:reject', 5_000, producer)).resolves.toBe('recovered');
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it('expires cached values after the TTL', () => {
    vi.useFakeTimers();
    const producer = vi.fn(() => 'first');

    expect(memoize('ttl:key', 1_000, producer)).toBe('first');
    expect(memoize('ttl:key', 1_000, producer)).toBe('first');
    expect(producer).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    producer.mockReturnValue('second');
    expect(memoize('ttl:key', 1_000, producer)).toBe('second');
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it('removes matching keys with invalidate(prefix)', () => {
    const leaderboardProducer = vi.fn(() => 'leaderboard');
    const otherProducer = vi.fn(() => 'other');

    expect(memoize('leaderboard:week', 5_000, leaderboardProducer)).toBe('leaderboard');
    expect(memoize('other:key', 5_000, otherProducer)).toBe('other');

    invalidate('leaderboard:');

    expect(memoize('leaderboard:week', 5_000, leaderboardProducer)).toBe('leaderboard');
    expect(leaderboardProducer).toHaveBeenCalledTimes(2);
    expect(memoize('other:key', 5_000, otherProducer)).toBe('other');
    expect(otherProducer).toHaveBeenCalledTimes(1);
  });
});
