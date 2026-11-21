const crypto = require('crypto');
const { logger } = require('firebase-functions');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const questionBank = require('./questionBank.json');
const { scoreSubmission, normalizeUsername, validateUsername } = require('./scoring');

initializeApp();

const auth = getAuth();
const db = getFirestore();
const webApiKey = defineSecret('WEB_API_KEY');

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const ERROR_CODES = new Set(['invalid-argument', 'permission-denied', 'unauthenticated', 'failed-precondition', 'not-found', 'already-exists', 'resource-exhausted', 'unavailable', 'internal']);

const AUTH_ERROR_MESSAGES = {
  'auth/email-already-exists': 'That email is already registered. Use a different email or ask the student to reset their password.',
  'auth/email-already-in-use': 'That email is already registered. Use a different email or ask the student to reset their password.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-not-found': 'No Firebase account was found for this student. Ask the administrator to repair the account mapping.',
  'auth/user-disabled': 'This account has been disabled. Contact your administrator.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in Firebase Authentication.',
  'auth/network-request-failed': 'The authentication service is unavailable. Please try again.'
};

function httpsCodeForAuthError(code) {
  if (code === 'auth/email-already-exists' || code === 'auth/email-already-in-use') return 'already-exists';
  if (code === 'auth/invalid-email') return 'invalid-argument';
  if (code === 'auth/user-not-found') return 'not-found';
  if (code === 'auth/user-disabled') return 'permission-denied';
  if (code === 'auth/too-many-requests') return 'resource-exhausted';
  if (code === 'auth/operation-not-allowed' || code === 'auth/network-request-failed') return 'failed-precondition';
  return 'unauthenticated';
}

function isTokenSigningError(error) {
  const text = `${(error && error.code) || ''} ${(error && error.message) || ''}`;
  return /signBlob|iam\.serviceAccounts|ServiceAccountTokenCreator|permission.*denied/i.test(text);
}

function isTransientFirestoreError(error) {
  const code = String((error && error.code) || '').toLowerCase();
  const message = String((error && error.message) || '');
  return ['internal', 'unavailable', 'deadline-exceeded', 'aborted', '13', '14'].includes(code)
    || /\b(internal|unavailable|deadline exceeded|aborted)\b/i.test(message);
}

function toHttpsError(error, fallbackMessage) {
  if (error instanceof HttpsError) throw error;
  if (isTransientFirestoreError(error)) {
    logger.error('Transient Firestore failure', error);
    throw new HttpsError('unavailable', fallbackMessage || 'A temporary database error occurred. Please retry.');
  }
  if (error && ERROR_CODES.has(error.code)) throw new HttpsError(error.code, error.message);
  const code = String((error && error.code) || '');
  if (Object.prototype.hasOwnProperty.call(AUTH_ERROR_MESSAGES, code)) {
    throw new HttpsError(httpsCodeForAuthError(code), AUTH_ERROR_MESSAGES[code]);
  }
  if (isTokenSigningError(error)) {
    logger.error('Firebase token signing is not authorized', error);
    throw new HttpsError('failed-precondition', 'The server cannot mint sign-in tokens. Grant the Functions runtime service account the Service Account Token Creator role, then try again.');
  }
  logger.error('Unexpected Cloud Functions error', error);
  const message = (error && error.message) || fallbackMessage || 'The request could not be completed. Check the Cloud Functions logs for details.';
  throw new HttpsError('internal', message);
}

function lowerEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function requireAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Admin authentication is required.');
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin role is required.');
  return request.auth.uid;
}

function requireStudent(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  return request.auth.uid;
}

function cleanUid(value) {
  return String(value || '').trim();
}

async function resolveUsername(uid, token) {
  const profileSnap = await db.collection('userProfiles').doc(uid).get();
  if (profileSnap.exists) return normalizeUsername(profileSnap.data().username);
  if (token && token.username) return normalizeUsername(token.username);
  const lookupSnap = await db.collection('usernameLookup').where('studentId', '==', uid).limit(1).get();
  if (!lookupSnap.empty) return normalizeUsername(lookupSnap.docs[0].data().username || lookupSnap.docs[0].id);
  const legacySnap = await db.collection('students').doc(uid).get();
  if (legacySnap.exists) return normalizeUsername(legacySnap.data().username);
  return '';
}

async function runScoreTransaction(operation) {
  const delays = [0, 150, 400];
  let lastError = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise(resolve => setTimeout(resolve, delays[i]));
    try {
      return await db.runTransaction(operation);
    } catch (error) {
      lastError = error;
      if (!isTransientFirestoreError(error) || i === delays.length - 1) throw error;
      logger.warn('Retrying score transaction after transient Firestore error', { retry: i + 1, code: error.code, message: error.message });
    }
  }
  throw lastError;
}

function rateKey(request, username) {
  const ip = request.ip || 'unknown';
  return crypto.createHash('sha256').update(`${ip}:${username}`).digest('hex');
}

async function checkRateLimit(key) {
  const snap = await db.collection('loginAttempts').doc(key).get();
  const data = snap.data();
  if (data && Date.now() - data.windowStart < RATE_WINDOW_MS && data.count >= MAX_FAILURES) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please wait a few minutes and try again.');
  }
}

async function recordFailure(key) {
  const ref = db.collection('loginAttempts').doc(key);
  const now = Date.now();
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const data = snap.data();
    const inWindow = data && now - data.windowStart < RATE_WINDOW_MS;
    transaction.set(ref, {
      count: inWindow ? (data.count || 0) + 1 : 1,
      windowStart: inWindow ? data.windowStart : now,
      updatedAt: now
    });
  });
}

async function clearRateLimit(key) {
  await db.collection('loginAttempts').doc(key).delete().catch(() => {});
}

async function deleteCollectionByQuery(queryRef) {
  while (true) {
    const snap = await queryRef.limit(400).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function commitWrites(writes) {
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    writes.slice(i, i + 450).forEach(write => {
      if (write.type === 'set') batch.set(write.ref, write.data || {}, write.options || {});
      else if (write.type === 'update') batch.update(write.ref, write.data || {});
      else if (write.type === 'delete') batch.delete(write.ref);
    });
    await batch.commit();
  }
}

async function updateHistoricalUsername(username, uid) {
  const writes = [];
  const seen = new Set();
  const addUpdate = doc => {
    if (seen.has(doc.ref.path)) return;
    seen.add(doc.ref.path);
    writes.push({
      type: 'update',
      ref: doc.ref,
      data: { username, uid, updatedAt: Date.now() }
    });
  };
  const queries = [
    db.collection('results').where('studentId', '==', uid),
    db.collection('results').where('username', '==', username),
    db.collection('quizAttempts').where('studentId', '==', uid),
    db.collection('quizAttempts').where('username', '==', username)
  ];
  for (const queryRef of queries) {
    const snap = await queryRef.get();
    snap.docs.forEach(addUpdate);
  }
  await commitWrites(writes);
  return writes.length;
}

function initialProfile(name, username, email, institute, uid) {
  return {
    uid,
    username,
    name: String(name || 'Student').trim(),
    email: String(email || '').trim().toLowerCase(),
    institute: String(institute || '').trim(),
    totalScore: 0,
    testsTaken: 0,
    accuracySum: 0,
    streak: 0,
    lastActiveDate: '',
    subjectTotals: {
      Mathematics: { correct: 0, total: 0 },
      Physics: { correct: 0, total: 0 },
      Chemistry: { correct: 0, total: 0 }
    },
    weakTopics: [],
    testBestScores: {},
    archived: false,
    passwordSetupRequired: true,
    setupLinkSent: false,
    createdAt: Date.now()
  };
}

exports.setAdminRole = onCall(async request => {
  try {
    const actorUid = requireAdmin(request);
    const uid = cleanUid(request.data && request.data.uid);
    const makeAdmin = request.data && request.data.admin === true;
    if (!uid || uid === actorUid) throw new HttpsError('invalid-argument', 'Provide a different valid user UID.');

    const user = await auth.getUser(uid);
    const claims = Object.assign({}, user.customClaims || {});
    if (makeAdmin) claims.admin = true;
    else delete claims.admin;
    await auth.setCustomUserClaims(uid, claims);
    await db.collection('adminAudit').add({
      action: makeAdmin ? 'grant-admin' : 'revoke-admin',
      targetUid: uid,
      targetUsername: claims.username || '',
      actorUid,
      createdAt: Date.now()
    });
    return { uid, admin: makeAdmin };
  } catch (error) {
    toHttpsError(error, 'Could not update the admin role. Check the Cloud Functions logs for details.');
  }
});

exports.createStudentAccount = onCall(async request => {
  const actorUid = requireAdmin(request);
  try {
    const data = request.data || {};
    const username = validateUsername(data.username);
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    const name = String(data.name || '').trim();
    if (!email || !email.includes('@') || password.length < 6 || !name) {
      throw new HttpsError('invalid-argument', 'Name, valid email, and password of at least 6 characters are required.');
    }

    try {
      const existing = await auth.getUserByEmail(email);
      if (existing && existing.uid) {
        throw new HttpsError('already-exists', 'That email is already registered in Firebase Authentication. Ask the student to use Forgot password instead of creating a duplicate account.');
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (!error || error.code !== 'auth/user-not-found') throw error;
    }

    const collision = await Promise.all([
      db.collection('students').doc(username).get(),
      db.collection('usernameLookup').doc(username).get()
    ]);
    if (collision[0].exists || collision[1].exists) {
      throw new HttpsError('already-exists', 'That username is already in use.');
    }

    let uid = null;
    try {
      const user = await auth.createUser({
        email,
        password,
        displayName: name,
        emailVerified: false
      });
      uid = user.uid;
      await auth.setCustomUserClaims(uid, { username });
      const profile = initialProfile(name, username, email, data.institute, uid);
      await commitWrites([
        { type: 'set', ref: db.collection('students').doc(username), data: profile },
        { type: 'set', ref: db.collection('usernameLookup').doc(username), data: { email, studentId: uid, username, name } },
        { type: 'set', ref: db.collection('userProfiles').doc(uid), data: { uid, username, email, name, createdAt: Date.now() } },
        { type: 'set', ref: db.collection('leaderboard').doc(username), data: { name, institute: profile.institute, totalScore: 0, testsTaken: 0, streak: 0, archived: false, updatedAt: Date.now() } },
        { type: 'set', ref: db.collection('practiceProgress').doc(username), data: { uid, username, updatedAt: Date.now(), lastTestTitle: '', completedAttempts: 0 } }
      ]);
      await db.collection('adminAudit').add({ action: 'create-student', targetUid: uid, targetUsername: username, actorUid, createdAt: Date.now() });
      return { uid, username };
    } catch (error) {
      if (uid) await auth.deleteUser(uid).catch(() => {});
      throw error;
    }
  } catch (error) {
    toHttpsError(error);
  }
});

exports.renameStudentUsername = onCall(async request => {
  const actorUid = requireAdmin(request);
  try {
    const data = request.data || {};
    const oldUsername = normalizeUsername(data.oldUsername || data.username);
    const newUsername = validateUsername(data.newUsername);
    if (!oldUsername || oldUsername === newUsername) throw new HttpsError('invalid-argument', 'Provide a different username.');

    const oldRef = db.collection('students').doc(oldUsername);
    const newRef = db.collection('students').doc(newUsername);
    const [oldSnap, newSnap, lookupSnap] = await Promise.all([
      oldRef.get(),
      newRef.get(),
      db.collection('usernameLookup').doc(newUsername).get()
    ]);
    if (!oldSnap.exists) throw new HttpsError('not-found', 'Student profile not found.');
    if (newSnap.exists || lookupSnap.exists) throw new HttpsError('already-exists', 'That username is already in use.');

    const oldData = oldSnap.data() || {};
    const uid = cleanUid(data.uid || oldData.uid || oldData.studentId || oldUsername);
    const newName = String(data.name || '').trim() || oldData.name || 'Student';
    const newInstitute = String(data.institute || '').trim() || oldData.institute || '';
    const newEmail = String(data.email || '').trim() || oldData.email || '';
    const updatedProfile = Object.assign({}, oldData, {
      uid,
      username: newUsername,
      name: newName,
      institute: newInstitute,
      email: newEmail,
      archived: false,
      renamedFrom: oldUsername,
      renamedAt: Date.now()
    });
    delete updatedProfile.migratedTo;

    if (newEmail && lowerEmail(newEmail) !== lowerEmail(oldData.email)) {
      try {
        const existingByEmail = await auth.getUserByEmail(newEmail);
        if (existingByEmail && existingByEmail.uid !== uid) {
          throw new HttpsError('already-exists', 'That email belongs to another Firebase account.');
        }
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        if (!error || error.code !== 'auth/user-not-found') throw error;
      }
      await auth.updateUser(uid, { email: newEmail });
    }

    const writes = [
      { type: 'set', ref: newRef, data: updatedProfile },
      { type: 'update', ref: oldRef, data: { archived: true, renamedTo: newUsername, archivedAt: Date.now() } },
      { type: 'set', ref: db.collection('usernameLookup').doc(newUsername), data: { email: newEmail, studentId: uid, username: newUsername, name: newName } },
      { type: 'delete', ref: db.collection('usernameLookup').doc(oldUsername) },
      { type: 'set', ref: db.collection('userProfiles').doc(uid), data: { uid, username: newUsername, email: newEmail, name: newName, updatedAt: Date.now() } },
      { type: 'set', ref: db.collection('leaderboard').doc(newUsername), data: { name: newName, institute: newInstitute, totalScore: oldData.totalScore || 0, testsTaken: oldData.testsTaken || 0, streak: oldData.streak || 0, archived: false, updatedAt: Date.now() } },
      { type: 'set', ref: db.collection('practiceProgress').doc(newUsername), data: { uid, username: newUsername, updatedAt: Date.now(), lastTestTitle: '', completedAttempts: oldData.testsTaken || 0 } }
    ];
    await commitWrites(writes);
    const oldLeaderboard = db.collection('leaderboard').doc(oldUsername);
    const oldLeaderboardSnap = await oldLeaderboard.get();
    if (oldLeaderboardSnap.exists) {
      await oldLeaderboard.update({ archived: true, archivedAt: Date.now() });
    }
    await auth.setCustomUserClaims(uid, Object.assign({}, (await auth.getUser(uid)).customClaims || {}, { username: newUsername }));
    const tagged = await updateHistoricalUsername(newUsername, uid);
    await db.collection('adminAudit').add({ action: 'rename-student', targetUid: uid, targetUsername: newUsername, previousUsername: oldUsername, historicalRecordsUpdated: tagged, actorUid, createdAt: Date.now() });
    return { uid, oldUsername, username: newUsername, historicalRecordsUpdated: tagged };
  } catch (error) {
    toHttpsError(error);
  }
});

exports.rebuildUsernameLookups = onCall(async request => {
  try {
    requireAdmin(request);
    const snap = await db.collection('students').get();
    const writes = [];
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const username = normalizeUsername(data.username || (doc.id.length === 28 ? '' : doc.id));
      if (!username || data.archived) continue;
      const uid = cleanUid(data.uid || (doc.id.length === 28 ? doc.id : data.studentId));
      if (!uid || !data.email || !data.name) continue;
      writes.push({
        type: 'set',
        ref: db.collection('usernameLookup').doc(username),
        data: { email: data.email, studentId: uid, username, name: data.name }
      });
    }
    await commitWrites(writes);
    return { updated: writes.length };
  } catch (error) {
    toHttpsError(error, 'Could not rebuild username lookups. Check the Cloud Functions logs for details.');
  }
});

exports.migrateUsernamesToPrimaryKey = onCall(async request => {
  const actorUid = requireAdmin(request);
  try {
    const dryRun = request.data && request.data.dryRun === true;
    const snap = await db.collection('students').get();
    const writes = [];
    const processedUsernames = new Set();
    let migrated = 0;
    let alreadyCurrent = 0;
    let skipped = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.archived || data.migratedTo || data.renamedTo) { skipped++; continue; }
      let username = '';
      try { username = validateUsername(data.username); } catch (error) { skipped++; continue; }
      const uid = cleanUid(data.uid || data.studentId || (doc.id.length === 28 ? doc.id : ''));
      if (!uid || !data.email || !data.name) { skipped++; continue; }
      if (processedUsernames.has(username)) { skipped++; continue; }
      processedUsernames.add(username);

      if (doc.id !== username) {
        const targetSnap = await db.collection('students').doc(username).get();
        if (targetSnap.exists) {
          if (!dryRun) {
            writes.push({ type: 'update', ref: doc.ref, data: { migratedTo: username, archived: true, archivedAt: Date.now() } });
          }
          skipped++;
          continue;
        }
        if (!dryRun) {
          const migratedProfile = Object.assign({}, data, { uid, username, migratedFrom: doc.id, migratedAt: Date.now(), archived: false });
          writes.push({ type: 'set', ref: db.collection('students').doc(username), data: migratedProfile });
          writes.push({ type: 'update', ref: doc.ref, data: { migratedTo: username, archived: true, archivedAt: Date.now() } });
        }
        const oldLeaderboard = db.collection('leaderboard').doc(doc.id);
        const oldLeaderboardSnap = await oldLeaderboard.get();
        if (oldLeaderboardSnap.exists && !dryRun) {
          writes.push({ type: 'update', ref: oldLeaderboard, data: { archived: true, archivedAt: Date.now() } });
        }
        migrated++;
      } else {
        alreadyCurrent++;
      }

      if (!dryRun) {
        writes.push({ type: 'set', ref: db.collection('usernameLookup').doc(username), data: { email: data.email, studentId: uid, username, name: data.name } });
        writes.push({ type: 'set', ref: db.collection('userProfiles').doc(uid), data: { uid, username, email: data.email, name: data.name, migratedAt: Date.now() } });
        writes.push({ type: 'set', ref: db.collection('leaderboard').doc(username), data: { name: data.name, institute: data.institute || '', totalScore: data.totalScore || 0, testsTaken: data.testsTaken || 0, streak: data.streak || 0, archived: false, updatedAt: Date.now() } });
        writes.push({ type: 'set', ref: db.collection('practiceProgress').doc(username), data: { uid, username, updatedAt: Date.now(), lastTestTitle: '', completedAttempts: data.testsTaken || 0 } });
      }
    }

    let historicalRecordsUpdated = 0;
    if (!dryRun) {
      await commitWrites(writes);
      const taggedUsernames = new Set();
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        let username = '';
        try { username = validateUsername(data.username); } catch (error) { continue; }
        if (taggedUsernames.has(username)) continue;
        taggedUsernames.add(username);
        historicalRecordsUpdated += await updateHistoricalUsername(username, cleanUid(data.uid || data.studentId || doc.id));
      }
      await db.collection('adminAudit').add({ action: 'migrate-usernames', migrated, alreadyCurrent, skipped, historicalRecordsUpdated, dryRun, actorUid, createdAt: Date.now() });
    }
    return { migrated, alreadyCurrent, skipped, historicalRecordsUpdated, dryRun };
  } catch (error) {
    toHttpsError(error);
  }
});

exports.submitQuizAttempt = onCall(async request => {
  const uid = requireStudent(request);
  try {
    const scoring = scoreSubmission(questionBank, request.data || {});
    logger.info('submitQuizAttempt started', {
      uid,
      attemptId: scoring.result.attemptId,
      title: scoring.result.title,
      bank: scoring.result.questionBank,
      answerCount: scoring.result.total
    });
    const username = await resolveUsername(uid, request.auth.token);
    if (!username) throw new HttpsError('failed-precondition', 'Student username migration has not been completed.');

    const result = Object.assign({}, scoring.result, {
      uid,
      username,
      questionBankVersion: questionBank.sha256,
      submittedAt: Date.now()
    });
    const attemptId = `${username}_${result.attemptId}`;
    const attemptRef = db.collection('quizAttempts').doc(attemptId);
    const resultRef = db.collection('results').doc(attemptId);
    const leaderboardRef = db.collection('leaderboard').doc(username);
    const progressRef = db.collection('practiceProgress').doc(username);
    const today = new Date().toISOString().slice(0, 10);
    let response = null;

    const loadProfile = async transaction => {
      let snap = await transaction.get(db.collection('students').doc(uid));
      if (!snap.exists && username !== uid) snap = await transaction.get(db.collection('students').doc(username));
      return snap;
    };

    await runScoreTransaction(async transaction => {
      const attemptSnap = await transaction.get(attemptRef);
      if (attemptSnap.exists) {
        const existing = attemptSnap.data();
        const currentProfile = (await loadProfile(transaction)).data() || {};
        response = {
          duplicate: true,
          result: existing.result,
          profile: profileSummary(currentProfile)
        };
        return;
      }

      const profileSnap = await loadProfile(transaction);
      if (!profileSnap.exists) throw new HttpsError('not-found', 'Student profile not found.');
      const profileRef = profileSnap.ref;
      const profile = profileSnap.data() || {};
      if (profile.uid && profile.uid !== uid) throw new HttpsError('permission-denied', 'Profile ownership check failed.');
      if (profile.archived) throw new HttpsError('failed-precondition', 'This student profile is archived.');

      const prevBest = (profile.testBestScores || {})[result.title] || null;
      const isRetake = !!prevBest;
      const isNewHigh = !prevBest || result.score > prevBest.score;
      const scoreDelta = isNewHigh ? result.score - (prevBest ? prevBest.score : 0) : 0;
      const testsTakenDelta = isRetake ? 0 : 1;
      const accuracyDelta = isRetake ? (isNewHigh ? result.accuracy - (prevBest.accuracy || 0) : 0) : result.accuracy;
      const lastActive = profile.lastActiveDate || '';
      let newStreak = profile.streak || 0;
      if (lastActive !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        newStreak = lastActive === yesterday ? newStreak + 1 : 1;
      }

      const testBestScores = Object.assign({}, profile.testBestScores || {});
      if (isNewHigh) {
        testBestScores[result.title] = {
          score: result.score,
          correct: result.correct,
          wrong: result.wrong,
          skipped: result.skipped,
          total: result.total,
          accuracy: result.accuracy,
          timeTakenSec: result.timeTakenSec,
          wrongTopics: result.wrongTopics,
          attempts: (prevBest ? prevBest.attempts || 0 : 0) + 1,
          updatedAt: today
        };
      } else if (prevBest) {
        testBestScores[result.title] = Object.assign({}, prevBest, { attempts: (prevBest.attempts || 0) + 1 });
      }

      const subjectTotals = Object.assign({}, profile.subjectTotals || {});
      Object.entries(scoring.subjectTotals).forEach(([subject, counts]) => {
        subjectTotals[subject] = subjectTotals[subject] || { correct: 0, total: 0 };
        subjectTotals[subject].correct += counts.correct;
        subjectTotals[subject].total += counts.total;
      });

      const weakTopics = Array.from(new Set([...(profile.weakTopics || []), ...result.wrongTopics])).slice(-12);
      const updatedProfile = Object.assign({}, profile, {
        totalScore: (profile.totalScore || 0) + scoreDelta,
        testsTaken: (profile.testsTaken || 0) + testsTakenDelta,
        accuracySum: (profile.accuracySum || 0) + accuracyDelta,
        streak: newStreak,
        lastActiveDate: today,
        weakTopics,
        testBestScores,
        subjectTotals,
        updatedAt: Date.now()
      });

      const storedResult = Object.assign({}, result, { isNewHigh, isRetake, scoreDelta });
      const publicResult = Object.assign({}, storedResult);
      delete publicResult.review;
      transaction.set(attemptRef, { uid, username, result: storedResult, answers: (request.data || {}).answers || [], createdAt: Date.now() });
      transaction.set(resultRef, Object.assign({}, publicResult, {
        studentId: uid,
        studentName: profile.name || 'Student',
        username,
        createdAt: Date.now()
      }));
      transaction.set(profileRef, updatedProfile);
      transaction.set(leaderboardRef, {
        name: profile.name || 'Student',
        institute: profile.institute || '',
        totalScore: updatedProfile.totalScore,
        testsTaken: updatedProfile.testsTaken,
        streak: updatedProfile.streak,
        archived: false,
        updatedAt: Date.now()
      });
      transaction.set(progressRef, {
        uid,
        username,
        lastTestTitle: result.title,
        lastQuestionBank: result.questionBank,
        completedAttempts: (profile.testsTaken || 0) + testsTakenDelta,
        updatedAt: Date.now()
      });

      response = {
        duplicate: false,
        result: storedResult,
        profile: profileSummary(updatedProfile)
      };
    });

    logger.info('submitQuizAttempt committed', {
      uid,
      attemptId: scoring.result.attemptId,
      duplicate: !!(response && response.duplicate),
      score: response && response.result ? response.result.score : null
    });
    return response;
  } catch (error) {
    toHttpsError(error, 'Score submission failed after a temporary database error. Your answers were preserved; retry submission.');
  }
});

function profileSummary(profile) {
  return {
    totalScore: profile.totalScore || 0,
    testsTaken: profile.testsTaken || 0,
    accuracySum: profile.accuracySum || 0,
    streak: profile.streak || 0,
    lastActiveDate: profile.lastActiveDate || '',
    weakTopics: profile.weakTopics || [],
    testBestScores: profile.testBestScores || {},
    subjectTotals: profile.subjectTotals || {}
  };
}

exports.deleteStudentAccount = onCall(async request => {
  const actorUid = requireAdmin(request);
  try {
    const data = request.data || {};
    const uid = cleanUid(data.uid);
    const username = normalizeUsername(data.username || (uid ? await resolveUsername(uid, {}) : ''));
    if (!uid && !username) throw new HttpsError('invalid-argument', 'Provide a student UID or username.');
    const profileRef = db.collection('students').doc(username || uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) throw new HttpsError('not-found', 'Student record not found.');
    const student = profileSnap.data() || {};
    const targetUid = cleanUid(student.uid || uid);
    if (!targetUid) throw new HttpsError('failed-precondition', 'Student UID is missing from the profile.');
    if (targetUid === actorUid) throw new HttpsError('invalid-argument', 'You cannot delete your own account here.');

    let targetUser = null;
    try { targetUser = await auth.getUser(targetUid); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    if (targetUser && targetUser.customClaims && targetUser.customClaims.admin === true) {
      throw new HttpsError('failed-precondition', 'Admin accounts cannot be deleted through student deletion.');
    }
    try { await auth.deleteUser(targetUid); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }

    const writes = [{ type: 'delete', ref: profileRef }];
    if (username) {
      writes.push({ type: 'delete', ref: db.collection('usernameLookup').doc(username) });
      writes.push({ type: 'delete', ref: db.collection('leaderboard').doc(username) });
      writes.push({ type: 'delete', ref: db.collection('practiceProgress').doc(username) });
    }
    writes.push({ type: 'delete', ref: db.collection('userProfiles').doc(targetUid) });
    writes.push({ type: 'delete', ref: db.collection('leaderboard').doc(targetUid) });
    await commitWrites(writes);
    if (username) {
      await deleteCollectionByQuery(db.collection('results').where('username', '==', username));
      await deleteCollectionByQuery(db.collection('quizAttempts').where('username', '==', username));
    }
    await deleteCollectionByQuery(db.collection('results').where('studentId', '==', targetUid));
    await deleteCollectionByQuery(db.collection('quizAttempts').where('studentId', '==', targetUid));
    await db.collection('adminAudit').add({ action: 'delete-student', targetUid, targetUsername: username, actorUid, createdAt: Date.now() });
    return { deleted: targetUid, username };
  } catch (error) {
    toHttpsError(error);
  }
});

async function resolveStudentIdentity(username) {
  const lookupRef = db.collection('usernameLookup').doc(username);
  const profileRef = db.collection('students').doc(username);
  const [lookupSnap, profileSnap] = await Promise.all([lookupRef.get(), profileRef.get()]);

  const lookupData = lookupSnap.exists ? (lookupSnap.data() || {}) : null;
  const lookupEmail = lowerEmail(lookupData && lookupData.email);
  const lookupUid = cleanUid((lookupData && (lookupData.studentId || lookupData.uid)) || '');

  let profileData = profileSnap.exists ? (profileSnap.data() || {}) : null;
  let profileKey = profileSnap.exists ? username : '';
  if (!profileData && lookupUid) {
    const mappedSnap = await db.collection('students').doc(lookupUid).get();
    if (mappedSnap.exists) {
      profileData = mappedSnap.data() || {};
      profileKey = mappedSnap.id;
    }
  }
  if (!profileData) {
    const querySnap = await db.collection('students').where('username', '==', username).limit(5).get();
    const active = querySnap.docs.filter(doc => {
      const data = doc.data() || {};
      return !data.archived && !data.renamedTo && !data.migratedTo;
    });
    if (active.length > 1) {
      throw new HttpsError('failed-precondition', 'More than one active student record matches this username. Ask the administrator to run the username migration.');
    }
    if (active.length === 1) {
      profileData = active[0].data() || {};
      profileKey = active[0].id;
    }
  }
  const profileEmail = lowerEmail(profileData && profileData.email);
  const profileUid = cleanUid((profileData && (profileData.uid || profileData.studentId)) || (profileKey.length === 28 ? profileKey : ''));

  if (lookupEmail && profileEmail && lookupEmail !== profileEmail) {
    logger.warn('Username/email mapping conflict', { username });
    throw new HttpsError('failed-precondition', 'The email on this username does not match the student profile. Ask the administrator to rebuild username lookups.');
  }
  if (lookupUid && profileUid && lookupUid !== profileUid) {
    logger.warn('Username/uid mapping conflict', { username });
    throw new HttpsError('failed-precondition', 'The account linked to this username does not match the student profile. Ask the administrator to rebuild username lookups.');
  }

  const email = lookupEmail || profileEmail;
  const uid = lookupUid || profileUid;
  if (!email || !uid) return null;

  return {
    email,
    uid,
    name: String((profileData && profileData.name) || (lookupData && lookupData.name) || 'Student'),
    studentKey: profileKey || username,
    lookupRef,
    needsLookupRepair: !lookupSnap.exists || lookupEmail !== email || lookupUid !== uid
  };
}

async function repairStudentMapping(identity, username, verifiedEmail) {
  const writes = [];
  const email = lowerEmail(verifiedEmail);
  if (identity.needsLookupRepair || email !== identity.email) {
    writes.push({
      type: 'set',
      ref: identity.lookupRef,
      data: { email, studentId: identity.uid, username, name: identity.name, repairedAt: Date.now() }
    });
  }
  const profileRef = db.collection('userProfiles').doc(identity.uid);
  const profileSnap = await profileRef.get();
  const profile = profileSnap.exists ? (profileSnap.data() || {}) : {};
  if (lowerEmail(profile.email) !== email || profile.username !== username || profile.studentKey !== identity.studentKey || !profile.uid) {
    writes.push({
      type: 'set',
      ref: profileRef,
      data: { uid: identity.uid, username, email, name: identity.name, studentKey: identity.studentKey, repairedAt: Date.now() },
      options: { merge: true }
    });
  }
  const studentRef = db.collection('students').doc(identity.studentKey);
  const studentSnap = await studentRef.get();
  if (studentSnap.exists) {
    const student = studentSnap.data() || {};
    if (student.uid !== identity.uid || student.studentId !== identity.uid) {
      writes.push({ type: 'update', ref: studentRef, data: { uid: identity.uid, studentId: identity.uid, mappingRepairedAt: Date.now() } });
    }
  }
  if (writes.length) await commitWrites(writes);
}

exports.resolveUsernameLogin = onCall({ secrets: [webApiKey] }, async request => {
  try {
    let username = '';
    try { username = validateUsername(request.data && request.data.username); }
    catch (error) { throw new HttpsError('invalid-argument', 'Invalid username or password.'); }
    const password = String((request.data && request.data.password) || '');
    if (password.length < 6) throw new HttpsError('invalid-argument', 'Invalid username or password.');

    const key = rateKey(request, username);
    await checkRateLimit(key);

    let apiKey = '';
    try { apiKey = webApiKey.value(); }
    catch (error) {
      logger.error('WEB_API_KEY secret is unavailable', error);
      throw new HttpsError('failed-precondition', 'The login service key (WEB_API_KEY) is not configured. Ask the administrator to set it and redeploy.');
    }
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'The login service key (WEB_API_KEY) is empty. Ask the administrator to set it and redeploy.');
    }

    const identity = await resolveStudentIdentity(username);
    if (!identity) {
      await recordFailure(key);
      throw new HttpsError('invalid-argument', 'Incorrect username or password.');
    }

    let response = null;
    let body = {};
    try {
      response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identity.email, password, returnSecureToken: true })
      });
      body = await response.json().catch(() => ({}));
    } catch (error) {
      logger.error('Identity Toolkit request failed', error);
      throw new HttpsError('unavailable', 'Login service is unavailable. Please try again.');
    }

    if (!response.ok) {
      const reason = String((body.error && body.error.message) || '');
      logger.warn('Username login rejected by Firebase Authentication', { username, reason });
      await recordFailure(key);
      if (/INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS/.test(reason)) {
        throw new HttpsError('invalid-argument', 'Incorrect username or password.');
      }
      if (/USER_DISABLED/.test(reason)) {
        throw new HttpsError('permission-denied', 'This account has been disabled. Contact your administrator.');
      }
      if (/TOO_MANY_ATTEMPTS/.test(reason)) {
        throw new HttpsError('resource-exhausted', 'Too many attempts. Please wait a few minutes and try again.');
      }
      if (/API_KEY|REFERER|IP_REFERER|KEY_INVALID/.test(reason)) {
        throw new HttpsError('failed-precondition', 'The server login key is not configured for server-side use. Ask the administrator to check WEB_API_KEY restrictions.');
      }
      throw new HttpsError('unavailable', 'Login service is unavailable. Please try again.');
    }

    const verifiedEmail = lowerEmail(body.email);
    if (!verifiedEmail) {
      throw new HttpsError('failed-precondition', 'Firebase did not return an email for this account. Ask the administrator to repair the account mapping.');
    }
    if (body.localId !== identity.uid) {
      // Legacy records often kept an old UID in usernameLookup after the
      // Firebase Auth account was recreated. The verified Auth email is
      // authoritative, so adopt its UID and repair the mapping below.
      if (verifiedEmail !== identity.email) {
        logger.warn('Username login uid/email mismatch', { username, expectedUid: identity.uid, actualUid: body.localId });
        await recordFailure(key);
        throw new HttpsError('invalid-argument', 'Incorrect username or password.');
      }
      logger.warn('Repairing stale uid mapping after successful login', { username, oldUid: identity.uid, newUid: body.localId });
      identity.uid = body.localId;
      identity.needsLookupRepair = true;
    }

    await repairStudentMapping(identity, username, verifiedEmail);
    await clearRateLimit(key);

    let customToken = '';
    try {
      const existingClaims = (await auth.getUser(identity.uid)).customClaims || {};
      customToken = await auth.createCustomToken(identity.uid, { ...existingClaims, username });
    } catch (error) {
      toHttpsError(error, 'Could not create a secure sign-in token. Check the Cloud Functions logs for details.');
    }
    return { customToken, email: verifiedEmail };
  } catch (error) {
    toHttpsError(error);
  }
});

exports.completePasswordSetup = onCall(async request => {
  const uid = requireStudent(request);
  try {
    let username = normalizeUsername((request.data || {}).username || '');
    let studentKey = username;
    const mapSnap = await db.collection('userProfiles').doc(uid).get();
    if (mapSnap.exists) {
      const map = mapSnap.data() || {};
      username = username || normalizeUsername(map.username);
      studentKey = normalizeUsername(map.studentKey) || username;
    }
    if (!username || !studentKey) throw new HttpsError('failed-precondition', 'Student username is not available.');

    const profileRef = db.collection('students').doc(studentKey);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) throw new HttpsError('not-found', 'Student profile not found.');
    const profile = profileSnap.data() || {};
    if (profile.uid && profile.uid !== uid) throw new HttpsError('permission-denied', 'Profile ownership check failed.');

    await profileRef.update({ passwordSetupRequired: false, setupLinkSent: true, passwordSetAt: Date.now() });
    const mapRef = db.collection('userProfiles').doc(uid);
    const latestMapSnap = await mapRef.get();
    if (latestMapSnap.exists) {
      await mapRef.update({ passwordSetupRequired: false, passwordSetAt: Date.now() }).catch(() => {});
    }
    return { username, completed: true };
  } catch (error) {
    toHttpsError(error, 'Could not record the password setup. Check the Cloud Functions logs for details.');
  }
});

exports.repairStudentAuth = onCall(async request => {
  requireAdmin(request);
  try {
    const data = request.data || {};
    const username = validateUsername(data.username);
    const password = String(data.password || '');
    if (password && password.length < 6) {
      throw new HttpsError('invalid-argument', 'The temporary password must be at least 6 characters.');
    }
    const identity = await resolveStudentIdentity(username);
    if (!identity) throw new HttpsError('not-found', 'Student mapping not found. Rebuild username lookups first.');

    let user = null;
    let created = false;
    try { user = await auth.getUserByEmail(identity.email); }
    catch (error) {
      if (!error || error.code !== 'auth/user-not-found') throw error;
    }
    if (!user) {
      if (!password) {
        throw new HttpsError('invalid-argument', 'No Firebase Auth account exists for this student. Provide a temporary password to create one.');
      }
      user = await auth.createUser({ email: identity.email, password, displayName: identity.name, emailVerified: false });
      created = true;
    }
    const claims = Object.assign({}, user.customClaims || {}, { username });
    await auth.setCustomUserClaims(user.uid, claims);
    if (password) await auth.updateUser(user.uid, { password });

    identity.uid = user.uid;
    identity.needsLookupRepair = true;
    await repairStudentMapping(identity, username, identity.email);
    return { uid: user.uid, username, email: identity.email, created };
  } catch (error) {
    toHttpsError(error, 'Could not repair the student account. Check the Cloud Functions logs for details.');
  }
});

exports.getWeeklyLeaderboard = onCall(async request => {
  requireStudent(request);
  const weekStart = Number((request.data || {}).weekStart);
  const now = Date.now();
  if (!Number.isFinite(weekStart) || weekStart > now || now - weekStart > 8 * 86400000) {
    throw new HttpsError('invalid-argument', 'Invalid week start.');
  }
  const [tsSnap, msSnap] = await Promise.all([
    db.collection('results').where('createdAt', '>=', Timestamp.fromMillis(weekStart)).get(),
    db.collection('results').where('createdAt', '>=', weekStart).get()
  ]);
  const seen = new Set();
  const map = {};
  [...tsSnap.docs, ...msSnap.docs].forEach(doc => {
    if (seen.has(doc.id)) return;
    seen.add(doc.id);
    const result = doc.data() || {};
    const key = result.username || result.studentId;
    if (!key) return;
    map[key] = map[key] || { id: key, name: result.studentName || result.username || 'Student', score: 0 };
    map[key].score += Number(result.score) || 0;
  });
  const rows = Object.values(map).sort((a, b) => b.score - a.score).slice(0, 50);
  return { rows };
});

exports.syncLeaderboard = onDocumentWritten('students/{studentKey}', async event => {
  const studentKey = normalizeUsername(event.params.studentKey);
  const after = event.data && event.data.after;
  const leaderboardRef = db.collection('leaderboard').doc(studentKey);
  if (!after || !after.exists) {
    await leaderboardRef.delete().catch(() => {});
    return;
  }
  const data = after.data() || {};
  const currentSnap = await leaderboardRef.get();
  const currentUpdatedAt = currentSnap.exists ? Number((currentSnap.data() || {}).updatedAt || 0) : 0;
  if (currentUpdatedAt > (Number(data.updatedAt) || 0)) return;
  if (data.archived) {
    await leaderboardRef.set({ archived: true, archivedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
    return;
  }
  await leaderboardRef.set({
    name: data.name || 'Student',
    institute: data.institute || '',
    totalScore: data.totalScore || 0,
    testsTaken: data.testsTaken || 0,
    streak: data.streak || 0,
    archived: false,
    updatedAt: Date.now()
  }, { merge: true });
});
