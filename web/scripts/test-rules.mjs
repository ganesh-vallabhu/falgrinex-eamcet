import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const root = path.resolve(webDir, '..');
const projectId = 'demo-falgrinex';
const host = '127.0.0.1';
const port = 8085;
const baseUrl = `http://${host}:${port}`;
const isWindows = process.platform === 'win32';

async function isReady() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const response = await fetch(baseUrl, { signal: controller.signal });
      return response.status > 0;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

function startEmulator() {
  const cli = path.join(webDir, 'node_modules', '.bin', isWindows ? 'firebase.cmd' : 'firebase');
  const args = ['emulators:start', '--only', 'firestore', '--project', projectId, '--config', '../firebase.json'];
  const child = spawn(isWindows ? `"${cli}"` : cli, args, {
    cwd: webDir,
    shell: isWindows,
    windowsHide: true,
    detached: !isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
  child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
  child.emulatorOutput = () => output;
  return child;
}

async function waitForEmulator(child) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await isReady()) return;
    if (child && child.exitCode !== null) {
      throw new Error(`Firestore emulator exited with code ${child.exitCode}: ${child.emulatorOutput()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}: ${child ? child.emulatorOutput() : ''}`);
}

function stopEmulator(child) {
  if (!child || child.exitCode !== null) return;
  if (isWindows) {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function run() {
  let emulator = null;
  let testEnv = null;
  try {
    if (!(await isReady())) emulator = startEmulator();
    await waitForEmulator(emulator);

    const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { host, port, rules },
    });

    const admin = testEnv.authenticatedContext('admin-uid', { admin: true }).firestore();
    const student = testEnv.authenticatedContext('student-uid').firestore();
    const guest = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(guest, 'students', 'student-uid')));

    await assertSucceeds(setDoc(doc(admin, 'students', 'student-uid'), {
      uid: 'student-uid',
      studentId: 'student-uid',
      name: 'Student',
      username: 'student',
      email: 'student@example.com',
      totalScore: 0,
      testsTaken: 0,
      createdAt: '2026-01-01',
    }));
    await assertSucceeds(getDoc(doc(student, 'students', 'student-uid')));
    await assertFails(setDoc(doc(student, 'resources', 'resource-1'), { title: 'Denied', link: 'https://example.com' }));

    await assertSucceeds(setDoc(doc(admin, 'resources', 'resource-1'), { title: 'Allowed', link: 'https://example.com' }));

    await assertSucceeds(setDoc(doc(student, 'results', 'student-uid_attempt-1'), {
      uid: 'student-uid',
      studentId: 'student-uid',
      score: 10,
      title: 'Mock Test 1',
      attemptId: 'attempt-1',
      verification: 'unverified-client',
    }));
    await assertFails(setDoc(doc(student, 'results', 'other-uid_attempt-2'), {
      uid: 'other-uid',
      studentId: 'other-uid',
      score: 10,
      title: 'Mock Test 1',
      attemptId: 'attempt-2',
      verification: 'unverified-client',
    }));

    await assertFails(updateDoc(doc(student, 'students', 'student-uid'), { username: 'renamed' }));
    await assertSucceeds(updateDoc(doc(student, 'students', 'student-uid'), { totalScore: 5 }));

    await assertFails(setDoc(doc(student, 'dailyChallenges', '2026-01-01'), {
      topic: 'Denied',
      question: 'No write access',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    }));

    console.log('rules tests passed');
  } finally {
    if (testEnv) await testEnv.cleanup();
    stopEmulator(emulator);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
