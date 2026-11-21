const { initializeApp, applicationDefault } = require('../functions/node_modules/firebase-admin/app');
const { getAuth } = require('../functions/node_modules/firebase-admin/auth');
const { getFirestore } = require('../functions/node_modules/firebase-admin/firestore');

const command = process.argv[2];
const first = process.argv[3];
const second = process.argv[4];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a private service-account key before running this tool.');
  process.exit(1);
}

const usage = 'Usage: node tools/spark-admin.js grant-admin UID | set-username UID USERNAME | repair-mapping USERNAME UID';
if (!command || !first || (!second && command !== 'grant-admin')) {
  console.error(usage);
  process.exit(1);
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeUid(value) {
  return String(value || '').trim();
}

initializeApp({ credential: applicationDefault(), projectId: 'eamcet-ace' });
const auth = getAuth();
const db = getFirestore();

async function grantAdmin() {
  const uid = normalizeUid(first);
  const user = await auth.getUser(uid);
  const claims = Object.assign({}, user.customClaims || {}, { admin: true });
  await auth.setCustomUserClaims(uid, claims);
  console.log(`admin claim granted for uid ${uid}`);
}

async function setUsername() {
  const uid = normalizeUid(first);
  const username = normalizeUsername(second);
  const snap = await db.collection('usernameLookup').doc(username).get();
  if (!snap.exists) throw new Error('No usernameLookup document exists for that username.');
  const mappedUid = normalizeUid((snap.data() || {}).studentId || (snap.data() || {}).uid);
  if (mappedUid !== uid) throw new Error('The UID does not match the authoritative usernameLookup mapping.');
  const user = await auth.getUser(uid);
  const claims = Object.assign({}, user.customClaims || {}, { username });
  await auth.setCustomUserClaims(uid, claims);
  console.log(`username claim set for uid ${uid}`);
}

async function repairMapping() {
  const username = normalizeUsername(first);
  const uid = normalizeUid(second);
  const lookupRef = db.collection('usernameLookup').doc(username);
  const lookupSnap = await lookupRef.get();
  if (!lookupSnap.exists) throw new Error('No usernameLookup document exists for that username.');
  const lookup = lookupSnap.data() || {};
  const expectedEmail = String(lookup.email || '').trim().toLowerCase();
  const mappedUid = normalizeUid(lookup.studentId || lookup.uid);
  if (mappedUid && mappedUid !== uid) throw new Error('The UID does not match the authoritative usernameLookup mapping.');

  const user = await auth.getUser(uid);
  if (!user.email || user.email.toLowerCase() !== expectedEmail) {
    throw new Error('The Firebase Auth email does not match the authoritative usernameLookup email.');
  }

  let studentKey = mappedUid || uid;
  let studentSnap = await db.collection('students').doc(studentKey).get();
  if (!studentSnap.exists) {
    const querySnap = await db.collection('students').where('username', '==', username).limit(5).get();
    const active = querySnap.docs.filter(doc => {
      const data = doc.data() || {};
      return !data.archived && !data.renamedTo && !data.migratedTo;
    });
    if (active.length !== 1) throw new Error('The student profile is ambiguous. Select the correct record explicitly before repairing.');
    studentKey = active[0].id;
    studentSnap = active[0];
  }

  const batch = db.batch();
  batch.set(lookupRef, Object.assign({}, lookup, {
    email: expectedEmail,
    studentId: uid,
    username,
    name: user.displayName || lookup.name || 'Student',
    repairedAt: Date.now()
  }), { merge: true });
  batch.set(db.collection('userProfiles').doc(uid), {
    uid,
    username,
    email: expectedEmail,
    name: user.displayName || lookup.name || 'Student',
    studentKey,
    repairedAt: Date.now()
  }, { merge: true });
  batch.set(db.collection('students').doc(studentKey), {
    uid,
    studentId: uid,
    username,
    email: expectedEmail,
    mappingRepairedAt: Date.now()
  }, { merge: true });
  await batch.commit();

  const claims = Object.assign({}, user.customClaims || {}, { username });
  await auth.setCustomUserClaims(uid, claims);
  console.log(`mapping repaired for uid ${uid}`);
}

(async () => {
  if (command === 'grant-admin') await grantAdmin();
  else if (command === 'set-username') await setUsername();
  else if (command === 'repair-mapping') await repairMapping();
  else throw new Error(usage);
})().catch(error => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
