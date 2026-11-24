import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, firebaseConfig, USE_EMULATORS } from '../config/firebase.js';
import {
  LEADERBOARD_LIMIT,
  PAGE_SIZE,
  TOP_STUDENT_SCAN,
  WEEKLY_SCAN_LIMIT,
  todayKey,
  weekStartKey,
  dateKeyToMillis,
} from '../config/constants.js';
import { memoize, invalidate } from './cache.js';
import { withRetry } from './retry.js';
import { isPermissionDenied } from './errors.js';
import { nextStreak } from './scoring.js';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function safeAttemptId() {
  const candidate = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return String(candidate).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}

export async function getStudentProfile(uid) {
  if (!uid) return null;
  const snapshot = await withRetry(() => getDoc(doc(db, 'students', uid)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function subscribeAnnouncements(onData, onError) {
  const feed = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(8));
  return onSnapshot(feed, (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}

export function subscribeMockLocks(onData, onError) {
  return onSnapshot(doc(db, 'settings', 'mockTestLocks'), (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() : {});
  }, onError);
}

export async function listResources({ pageSize = PAGE_SIZE, cursor = null } = {}) {
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (cursor) constraints.push(startAfter(cursor));
  const snapshot = await withRetry(() => getDocs(query(collection(db, 'resources'), ...constraints)));
  return {
    rows: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    cursor: snapshot.docs.at(-1) || null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function listTopStudents() {
  const snapshot = await withRetry(() => getDocs(query(collection(db, 'students'), orderBy('totalScore', 'desc'), limit(TOP_STUDENT_SCAN))));
  const seen = new Set();
  const rows = [];
  for (const item of snapshot.docs) {
    const data = item.data();
    if (data.archived || data.disabled) continue;
    const key = normalizeUsername(data.username || item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: item.id, ...data });
    if (rows.length >= LEADERBOARD_LIMIT) break;
  }
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getWeeklyLeaderboard(weekStart = weekStartKey()) {
  try {
    const snapshot = await withRetry(() => getDocs(query(collection(db, 'weeklyStats'), where('weekStart', '==', weekStart), limit(WEEKLY_SCAN_LIMIT))));
    const rows = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
      .slice(0, LEADERBOARD_LIMIT)
      .map((row, index) => ({ ...row, rank: index + 1 }));
    if (rows.length) return rows;
  } catch (error) {
    if (!isPermissionDenied(error)) console.warn('Weekly stats query failed; using results fallback', error);
  }

  const startMillis = dateKeyToMillis(weekStart);
  const [byTimestamp, byMillis] = await Promise.all([
    withRetry(() => getDocs(query(collection(db, 'results'), where('createdAt', '>=', Timestamp.fromMillis(startMillis)), limit(500)))),
    withRetry(() => getDocs(query(collection(db, 'results'), where('createdAt', '>=', startMillis), limit(500)))),
  ]);
  const byId = new Map();
  for (const item of [...byTimestamp.docs, ...byMillis.docs]) byId.set(item.id, item.data());
  const totals = new Map();
  for (const data of byId.values()) {
    const key = data.studentId || data.uid || data.username || 'unknown';
    const current = totals.get(key) || {
      name: data.studentName || data.name || 'Student',
      username: data.username || '',
      score: 0,
      tests: 0,
      accuracySum: 0,
    };
    current.score += Number(data.score) || 0;
    current.tests += 1;
    current.accuracySum += Number(data.accuracy) || 0;
    totals.set(key, current);
  }
  return [...totals.entries()]
    .map(([id, value]) => ({
      id,
      studentId: id,
      ...value,
      accuracy: value.tests ? Math.round((value.accuracySum / value.tests) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_LIMIT)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function saveQuizAttempt({ uid, profile, result, attemptId, weekStart = weekStartKey() }) {
  const id = String(attemptId || safeAttemptId());
  const resultRef = doc(db, 'results', `${uid}_${id}`);
  const attemptRef = doc(db, 'quizAttempts', `${uid}_${id}`);
  const studentRef = doc(db, 'students', uid);
  const weekRef = doc(db, 'weeklyStats', `${uid}_${weekStart}`);
  const today = todayKey();
  const title = result.title;
  const previousRecord = profile?.testBestScores?.[title] || null;
  const score = Math.max(0, Number(result.score) || 0);
  const previousBest = Math.max(0, Number(previousRecord?.score ?? 0));
  const isNewHigh = !previousRecord || score > previousBest;
  const attempts = Number(previousRecord?.attempts || 0) + 1;
  const bestRecord = isNewHigh
    ? { ...previousRecord, score, accuracy: result.accuracy, total: result.total, attempts, updatedAt: Date.now(), attemptId: id, lastAttemptId: id }
    : { ...previousRecord, attempts, lastAttemptAt: Date.now(), lastAttemptId: id };

  const profileUpdate = {
    totalScore: increment(Math.max(0, score - previousBest)),
    testsTaken: increment(1),
    accuracySum: increment(Number(result.accuracy) || 0),
    streak: nextStreak(profile?.lastActiveDate, today, profile?.streak),
    lastActiveDate: today,
    weakTopics: [...new Set([...(profile?.weakTopics || []), ...(result.wrongTopics || [])])].slice(-12),
    updatedAt: Date.now(),
    [`testBestScores.${title}`]: bestRecord,
  };
  for (const [subject, totals] of Object.entries(result.subjectTotals || {})) {
    profileUpdate[`subjectTotals.${subject}.correct`] = increment(Number(totals.correct) || 0);
    profileUpdate[`subjectTotals.${subject}.total`] = increment(Number(totals.total) || 0);
  }

  const storedResult = {
    ...result,
    studentId: uid,
    uid,
    studentName: profile?.name || '',
    username: profile?.username || '',
    attemptId: id,
    verification: 'unverified-client',
    isNewHigh,
    createdAt: serverTimestamp(),
    updatedAt: Date.now(),
  };
  const { review, ...publicResult } = storedResult;

  const batch = writeBatch(db);
  batch.set(resultRef, publicResult);
  batch.set(attemptRef, { ...storedResult, review: result.review || [] });
  batch.update(studentRef, profileUpdate);
  batch.set(weekRef, {
    uid,
    studentId: uid,
    username: profile?.username || '',
    name: profile?.name || '',
    weekStart,
    score: increment(score),
    tests: increment(1),
    accuracySum: increment(Number(result.accuracy) || 0),
    updatedAt: Date.now(),
  }, { merge: true });

  try {
    await withRetry(() => batch.commit());
    invalidate('leaderboard:');
    return { duplicate: false, result: { ...publicResult, review: result.review || [] } };
  } catch (error) {
    if (isPermissionDenied(error)) {
      const existing = await getDoc(resultRef);
      if (existing.exists()) {
        const attempt = await getDoc(attemptRef);
        return { duplicate: true, result: { ...existing.data(), review: attempt.exists() ? attempt.data().review || [] : [] } };
      }
    }
    throw error;
  }
}

export async function getResultById(uid, attemptId) {
  const [result, attempt] = await Promise.all([
    getDoc(doc(db, 'results', `${uid}_${attemptId}`)),
    getDoc(doc(db, 'quizAttempts', `${uid}_${attemptId}`)),
  ]);
  if (!result.exists()) return null;
  return { ...result.data(), review: attempt.exists() ? attempt.data().review || [] : [] };
}

export async function getDailyChallenge(dateKey) {
  const snapshot = await getDoc(doc(db, 'dailyChallenges', dateKey));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function markSetupLinkSent(uid) {
  await updateDoc(doc(db, 'students', uid), { setupLinkSent: true, updatedAt: Date.now() });
}

export async function resolveUsername(username) {
  const key = normalizeUsername(username);
  if (!key) return null;
  const snapshot = await getDoc(doc(db, 'usernameLookup', key));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function resetActionSettings() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || location.origin === 'null') return undefined;
  const dir = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
  return { url: `${location.origin}${dir}#/set-password`, handleCodeInApp: true };
}

export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email, resetActionSettings());
  } catch (error) {
    if (['auth/unauthorized-continue-uri', 'auth/invalid-continue-uri'].includes(error?.code)) {
      await sendPasswordResetEmail(auth, email);
      return;
    }
    throw error;
  }
}

export async function listStudents({ pageSize = PAGE_SIZE, cursor = null } = {}) {
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (cursor) constraints.push(startAfter(cursor));
  const snapshot = await withRetry(() => getDocs(query(collection(db, 'students'), ...constraints)));
  return {
    rows: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    cursor: snapshot.docs.at(-1) || null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function createStudentAccount({ name, username, email, password, institute }) {
  const key = normalizeUsername(username);
  if (!name?.trim() || !key) throw new Error('Name and username are required.');
  const lookup = await getDoc(doc(db, 'usernameLookup', key));
  if (lookup.exists()) throw new Error('That username is already taken.');

  const appName = `falgrinex-admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const secondary = initializeApp(firebaseConfig, appName);
  let secondaryAuth;
  try {
    secondaryAuth = getAuth(secondary);
    if (USE_EMULATORS) {
      const { connectAuthEmulator } = await import('firebase/auth');
      connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    const credential = await createUserWithEmailAndPassword(secondaryAuth, String(email).trim().toLowerCase(), password);
    await signOut(secondaryAuth);
    const uid = credential.user.uid;
    const batch = writeBatch(db);
    batch.set(doc(db, 'students', uid), {
      uid,
      studentId: uid,
      name: name.trim(),
      username: key,
      email: String(email).trim().toLowerCase(),
      institute: institute || '',
      totalScore: 0,
      testsTaken: 0,
      accuracySum: 0,
      streak: 0,
      lastActiveDate: '',
      subjectTotals: {
        Mathematics: { correct: 0, total: 0 },
        Physics: { correct: 0, total: 0 },
        Chemistry: { correct: 0, total: 0 },
      },
      weakTopics: [],
      testBestScores: {},
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now(),
    });
    batch.set(doc(db, 'usernameLookup', key), {
      email: String(email).trim().toLowerCase(),
      studentId: uid,
      name: name.trim(),
    });
    await batch.commit();
    invalidate('leaderboard:');
    return uid;
  } catch (error) {
    try {
      if (secondaryAuth?.currentUser) await deleteUser(secondaryAuth.currentUser);
    } catch {}
    throw error;
  } finally {
    await deleteApp(secondary);
  }
}

export async function updateStudentAccount(student, { name, username, institute }) {
  const key = normalizeUsername(username);
  if (!key) throw new Error('Username is required.');
  const oldKey = normalizeUsername(student.username);
  if (key !== oldKey) {
    const taken = await getDoc(doc(db, 'usernameLookup', key));
    if (taken.exists() && taken.data()?.studentId !== student.id) throw new Error('That username is already taken.');
  }
  const batch = writeBatch(db);
  batch.update(doc(db, 'students', student.id), { name: name.trim(), username: key, institute: institute || '', updatedAt: Date.now() });
  const payload = { email: student.email, studentId: student.id, name: name.trim() };
  if (key !== oldKey) {
    const oldLookup = await getDoc(doc(db, 'usernameLookup', oldKey));
    batch.delete(doc(db, 'usernameLookup', oldKey));
    batch.set(doc(db, 'usernameLookup', key), oldLookup.exists() ? { ...oldLookup.data(), ...payload } : payload);
  } else {
    batch.set(doc(db, 'usernameLookup', key), payload, { merge: true });
  }
  await batch.commit();
  invalidate('leaderboard:');
}

export async function disableStudent(student) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'students', student.id), {
    archived: true,
    disabled: true,
    disabledAt: Date.now(),
    updatedAt: Date.now(),
  });
  batch.set(doc(db, 'usernameLookup', normalizeUsername(student.username)), {
    disabled: true,
    disabledAt: Date.now(),
  }, { merge: true });
  await batch.commit();
  invalidate('leaderboard:');
}

export async function saveDailyChallenge(payload) {
  await setDoc(doc(db, 'dailyChallenges', payload.date), {
    topic: payload.topic || '',
    question: payload.question,
    options: payload.options,
    correctIndex: Number(payload.correctIndex),
    explanation: payload.explanation || '',
    createdAt: new Date().toISOString(),
  });
}

export async function listDailyChallenges() {
  const snapshot = await withRetry(() => getDocs(query(collection(db, 'dailyChallenges'), orderBy(documentId(), 'desc'), limit(30))));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listAnnouncements() {
  const snapshot = await withRetry(() => getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50))));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createResource({ title, link }) {
  const ref = await addResource({ title, link });
  return ref;
}

async function addResource({ title, link }) {
  const { addDoc } = await import('firebase/firestore');
  const ref = await addDoc(collection(db, 'resources'), { title, link, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function updateResource(id, { title, link }) {
  await updateDoc(doc(db, 'resources', id), { title, link });
}

export async function deleteResource(id) {
  await deleteDoc(doc(db, 'resources', id));
}

export async function createAnnouncement({ title, message }) {
  const { addDoc } = await import('firebase/firestore');
  await addDoc(collection(db, 'announcements'), { title, message, createdAt: new Date().toISOString() });
}

export async function deleteAnnouncement(id) {
  await deleteDoc(doc(db, 'announcements', id));
}

export function leaderboardCacheKey(tab, uid) {
  return `leaderboard:${tab}:${uid || 'guest'}`;
}

export async function cachedLeaderboard(tab, uid, loader) {
  return memoize(leaderboardCacheKey(tab, uid), 60_000, loader);
}
