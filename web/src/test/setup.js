import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const items = new Map();
const storage = {
  clear: () => items.clear(),
  getItem: (key) => (items.has(String(key)) ? items.get(String(key)) : null),
  key: (index) => [...items.keys()][index] ?? null,
  removeItem: (key) => items.delete(String(key)),
  setItem: (key, value) => items.set(String(key), String(value)),
  get length() {
    return items.size;
  },
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage, writable: true });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
