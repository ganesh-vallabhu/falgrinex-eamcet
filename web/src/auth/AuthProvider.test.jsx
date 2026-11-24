import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth } from '../config/firebase.js';
import { getStudentProfile, resolveUsername } from '../lib/repository.js';
import { AuthProvider, isAdminClaims, useAuth } from './AuthProvider.jsx';

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: 'local',
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_database, name, id) => ({ name, id })),
  onSnapshot: vi.fn(),
}));

vi.mock('../config/firebase.js', () => ({
  auth: { currentUser: null },
  db: { name: 'test-db' },
}));

vi.mock('../lib/repository.js', () => ({
  getStudentProfile: vi.fn(),
  resolveUsername: vi.fn(),
}));

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function makeUser(claims = {}) {
  return {
    uid: 'student-1',
    email: 'aria@example.com',
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
  };
}

let authCallback;
let snapshotCallback;

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.currentUser = null;
    authCallback = null;
    snapshotCallback = null;
    vi.mocked(onAuthStateChanged).mockImplementation((_firebaseAuth, callback) => {
      authCallback = callback;
      return vi.fn();
    });
    vi.mocked(onSnapshot).mockImplementation((_reference, next) => {
      snapshotCallback = next;
      return vi.fn();
    });
    vi.mocked(setPersistence).mockResolvedValue(undefined);
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ uid: 'student-1' });
    vi.mocked(signOut).mockResolvedValue(undefined);
    vi.mocked(getStudentProfile).mockResolvedValue(null);
    vi.mocked(resolveUsername).mockResolvedValue(null);
  });

  afterEach(() => {
    auth.currentUser = null;
  });

  it('keeps loading while claims and profile resolve after signed-in callback', async () => {
    let resolveToken;
    let resolveProfile;
    const tokenPromise = new Promise((resolve) => { resolveToken = resolve; });
    const profilePromise = new Promise((resolve) => { resolveProfile = resolve; });
    const user = makeUser();
    user.getIdTokenResult.mockReturnValue(tokenPromise);
    vi.mocked(getStudentProfile).mockReturnValue(profilePromise);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      authCallback(user);
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBe(user);
    expect(result.current.profile).toBe(null);

    await act(async () => {
      resolveToken({ claims: { admin: true } });
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.claims.admin).toBe(true);

    await act(async () => {
      resolveProfile({ id: 'student-1', username: 'aria' });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toEqual({ id: 'student-1', username: 'aria' });
    expect(result.current.isAdmin).toBe(true);
    expect(typeof snapshotCallback).toBe('function');
    expect(doc).toHaveBeenCalledWith({ name: 'test-db' }, 'students', 'student-1');
  });

  it('clears user, profile, and claims when signed out', async () => {
    const user = makeUser({ admin: true });
    vi.mocked(getStudentProfile).mockResolvedValue({ id: 'student-1', username: 'aria' });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authCallback(user);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.profile.username).toBe('aria');

    await act(async () => {
      await authCallback(null);
    });
    expect(result.current.user).toBe(null);
    expect(result.current.profile).toBe(null);
    expect(result.current.claims).toEqual({});
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('resolves a username to email before signing in', async () => {
    vi.mocked(resolveUsername).mockResolvedValue({ email: 'Aria@Example.com' });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('aria', 'Secret123');
    });

    expect(resolveUsername).toHaveBeenCalledWith('aria');
    expect(setPersistence).toHaveBeenCalledWith(auth, browserLocalPersistence);
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'aria@example.com', 'Secret123');
  });

  it('throws for a missing username without signing in', async () => {
    vi.mocked(resolveUsername).mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(result.current.login('nobody', 'Secret123')).rejects.toThrow(
      'We could not find that username. Use your email instead.',
    );
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('derives isAdmin from claims', async () => {
    expect(isAdminClaims({ admin: true })).toBe(true);
    expect(isAdminClaims({ admin: 1 })).toBe(true);
    expect(isAdminClaims({ isAdmin: true })).toBe(true);
    expect(isAdminClaims({ admin: false })).toBe(false);
    expect(isAdminClaims(null)).toBe(false);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await authCallback(makeUser({ admin: 1 }));
    });
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
  });

  it('refreshes claims from the current user', async () => {
    auth.currentUser = {
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true, role: 'admin' } }),
    };
    const { result } = renderHook(() => useAuth(), { wrapper });

    let refreshed;
    await act(async () => {
      refreshed = await result.current.refreshClaims();
    });

    expect(auth.currentUser.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(refreshed).toEqual({ admin: true, role: 'admin' });
    expect(result.current.claims).toEqual({ admin: true, role: 'admin' });
    expect(result.current.isAdmin).toBe(true);
  });

  it('returns empty claims when there is no current user to refresh', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await expect(result.current.refreshClaims()).resolves.toEqual({});
  });
});
