import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { Timestamp, doc, getDoc, getDocs, increment, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../config/firebase.js';
import { withRetry } from './retry.js';
import {
  createStudentAccount,
  getWeeklyLeaderboard,
  resolveUsername,
  saveQuizAttempt,
  sendPasswordReset,
} from './repository.js';

vi.mock('firebase/app', () => ({
  deleteApp: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  connectAuthEmulator: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  getAuth: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: { fromMillis: vi.fn((millis) => ({ millis })) },
  collection: vi.fn((database, name) => ({ name })),
  deleteDoc: vi.fn(),
  doc: vi.fn((database, name, id) => ({ path: `${name}/${id}` })),
  documentId: vi.fn(() => 'id'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((amount) => ({ increment: amount })),
  limit: vi.fn((amount) => ({ limit: amount })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field) => ({ field })),
  query: vi.fn((...parts) => ({ parts })),
  serverTimestamp: vi.fn(() => ({ server: true })),
  setDoc: vi.fn(),
  startAfter: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn((field, operator, value) => ({ field, operator, value })),
  writeBatch: vi.fn(),
}));

vi.mock('../config/firebase.js', () => ({
  auth: { currentUser: null },
  db: { name: 'test-db' },
  firebaseConfig: { projectId: 'test-project' },
  USE_EMULATORS: false,
}));

vi.mock('./cache.js', () => ({
  invalidate: vi.fn(),
  memoize: vi.fn((key, ttlMs, producer) => producer()),
}));

vi.mock('./retry.js', () => ({
  withRetry: vi.fn((operation) => operation()),
}));

const batch = {
  commit: vi.fn(),
  delete: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
};

const secondaryApp = { name: 'secondary-app' };
const secondaryAuth = { currentUser: { uid: 'new-student' } };

function payloadSetAt(path) {
  return batch.set.mock.calls.find(([reference]) => reference.path === path)?.[1];
}

function profileUpdateFor(uid) {
  return batch.update.mock.calls.find(([reference]) => reference.path === `students/${uid}`)?.[1];
}

function resultData(id, data) {
  return { id, data: () => data };
}

describe('repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batch.commit.mockResolvedValue(undefined);
    vi.mocked(withRetry).mockImplementation((operation) => operation());
    vi.mocked(writeBatch).mockReturnValue(batch);
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, id: '', data: () => ({}) });
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });
    vi.mocked(initializeApp).mockReturnValue(secondaryApp);
    vi.mocked(getAuth).mockReturnValue(secondaryAuth);
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user: { uid: 'new-student' } });
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);
    vi.mocked(deleteUser).mockResolvedValue(undefined);
    vi.mocked(deleteApp).mockResolvedValue(undefined);
    vi.mocked(signOut).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  describe('saveQuizAttempt', () => {
    const uid = 'student-1';
    const weekStart = '2026-11-23';

    it('writes attempt identifiers into the profile best-score record', async () => {
      const profile = {
        name: 'Ada',
        username: 'ada',
        totalScore: 40,
        testBestScores: { 'Chapter Quiz': { score: 4, attempts: 1, attemptId: 'old-attempt' } },
      };
      const result = { title: 'Chapter Quiz', score: 9, accuracy: 90, total: 10, review: [] };

      await saveQuizAttempt({ uid, profile, result, attemptId: 'attempt-2', weekStart });

      const update = profileUpdateFor(uid);
      expect(update['testBestScores.Chapter Quiz']).toMatchObject({
        score: 9,
        attempts: 2,
        attemptId: 'attempt-2',
        lastAttemptId: 'attempt-2',
      });
      expect(update.totalScore).toEqual(increment(5));
      expect(doc).toHaveBeenCalledWith(expect.anything(), 'results', `${uid}_attempt-2`);
      expect(doc).toHaveBeenCalledWith(expect.anything(), 'quizAttempts', `${uid}_attempt-2`);
    });

    it('clamps negative scores so totalScore never decreases', async () => {
      const profile = {
        totalScore: 100,
        testBestScores: { 'Chapter Quiz': { score: 8, attempts: 2, attemptId: 'old-attempt' } },
      };
      const result = { title: 'Chapter Quiz', score: -5, accuracy: 10, total: 10, review: [] };

      await saveQuizAttempt({ uid, profile, result, attemptId: 'attempt-3', weekStart });

      const update = profileUpdateFor(uid);
      expect(update.totalScore).toEqual(increment(0));
      expect(update['testBestScores.Chapter Quiz']).toMatchObject({
        score: 8,
        attempts: 3,
        attemptId: 'old-attempt',
        lastAttemptId: 'attempt-3',
      });

      batch.update.mockClear();
      await saveQuizAttempt({
        uid,
        profile: { totalScore: 10, testBestScores: {} },
        result,
        attemptId: 'attempt-4',
        weekStart,
      });
      const freshUpdate = profileUpdateFor(uid);
      expect(freshUpdate.totalScore).toEqual(increment(0));
      expect(freshUpdate['testBestScores.Chapter Quiz']).toMatchObject({ score: 0, attemptId: 'attempt-4' });
    });

    it('stores review only in quizAttempts', async () => {
      const review = [{ question: 'Q1', status: 'Wrong' }];
      const result = { title: 'Chapter Quiz', score: 3, accuracy: 30, total: 10, review };

      const saved = await saveQuizAttempt({ uid, profile: {}, result, attemptId: 'attempt-5', weekStart });

      const resultPayload = payloadSetAt(`results/${uid}_attempt-5`);
      const attemptPayload = payloadSetAt(`quizAttempts/${uid}_attempt-5`);
      expect(resultPayload).toBeDefined();
      expect('review' in resultPayload).toBe(false);
      expect(attemptPayload.review).toEqual(review);
      expect(saved.result.review).toEqual(review);
    });
  });

  it('resolves a username from usernameLookup', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'ada',
      data: () => ({ studentId: 'student-1', name: 'Ada' }),
    });

    await expect(resolveUsername(' Ada Lovelace ')).resolves.toEqual({
      id: 'ada',
      studentId: 'student-1',
      name: 'Ada',
    });
    expect(doc).toHaveBeenCalledWith(db, 'usernameLookup', 'adalovelace');

    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, id: '', data: () => ({}) });
    await expect(resolveUsername('missing')).resolves.toBeNull();
  });

  it('builds a set-password continue URL from the current location', async () => {
    window.history.replaceState(null, '', '/app/admin/settings.html');

    await sendPasswordReset('ada@example.com');

    const dir = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'ada@example.com', {
      url: `${location.origin}${dir}#/set-password`,
      handleCodeInApp: true,
    });
  });

  describe('getWeeklyLeaderboard', () => {
    it('falls back to results and aggregates username, studentId, tests and accuracy', async () => {
      const weekStart = '2026-11-23';
      vi.mocked(getDocs).mockImplementation(async (statement) => {
        const source = statement.parts[0].name;
        if (source === 'weeklyStats') return { docs: [] };
        return {
          docs: [
            resultData('r1', { studentId: 's1', studentName: 'Ada', username: 'ada', score: 8, accuracy: 80 }),
            resultData('r2', { studentId: 's1', studentName: 'Ada', username: 'ada', score: 12, accuracy: 60 }),
            resultData('r3', { studentId: 's2', name: 'Grace', username: 'grace', score: 5, accuracy: 100 }),
          ],
        };
      });

      const rows = await getWeeklyLeaderboard(weekStart);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        studentId: 's1',
        username: 'ada',
        name: 'Ada',
        score: 20,
        tests: 2,
        accuracy: 70,
        rank: 1,
      });
      expect(rows[1]).toMatchObject({
        studentId: 's2',
        username: 'grace',
        tests: 1,
        accuracy: 100,
        rank: 2,
      });
      expect(where).toHaveBeenCalledWith('createdAt', '>=', expect.objectContaining({ millis: expect.any(Number) }));
      expect(Timestamp.fromMillis).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  it('deletes the secondary auth user when the batch commit fails', async () => {
    batch.commit.mockRejectedValue(new Error('commit failed'));

    await expect(createStudentAccount({
      name: 'Ada',
      username: 'ada',
      email: 'Ada@Example.com',
      password: 'secret',
    })).rejects.toThrow('commit failed');

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(secondaryAuth, 'ada@example.com', 'secret');
    expect(deleteUser).toHaveBeenCalledWith(secondaryAuth.currentUser);
    expect(signOut).toHaveBeenCalledWith(secondaryAuth);
    expect(deleteApp).toHaveBeenCalledWith(secondaryApp);
  });
});
