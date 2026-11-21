import catalog from '../data/catalog.generated.json';
import { DIFFICULTY_CAPS, SUBJECTS } from '../config/constants.js';
import { cachedJson, memoize } from './cache.js';
import { withRetry } from './retry.js';

export function normalizeSubject(subject) {
  const value = String(subject || '').trim().toLowerCase();
  if (value.startsWith('math')) return 'Mathematics';
  if (value.startsWith('phys')) return 'Physics';
  if (value.startsWith('chem')) return 'Chemistry';
  return 'Other';
}

export function questionId(bank, question) {
  const scope = bank === 'P' ? `${question.chapter || ''} · ${question.difficulty || ''}` : question.test || '';
  return [bank, scope, question.subject || '', question.chapter || '', question.difficulty || '', question.topic || '', question.question || '']
    .map((value) => String(value).trim().toLowerCase())
    .join('|');
}

export function practiceTitle(chapter, difficulty) {
  return `${chapter} · ${difficulty}`;
}

export async function loadCatalog() {
  return catalog;
}

export async function loadPracticeChapter(subject, chapter) {
  const entry = catalog.practice.find((row) => row.subject === subject && row.chapter === chapter);
  if (!entry) return [];
  return loadQuestionFile(entry);
}

export async function loadTestQuestions(test) {
  if (!test?.file) return [];
  return loadQuestionFile(test);
}

async function loadQuestionFile(entry) {
  const url = `${import.meta.env.BASE_URL || '/'}${entry.file}`.replace(/\/{2,}/g, '/');
  return withRetry(() => cachedJson(url, `${entry.file}:${entry.sha256}`, { ttlMs: 86_400_000 }));
}

export function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function selectPracticeQuestions(pool, difficulty, count = DIFFICULTY_CAPS[difficulty]) {
  return shuffle(pool.filter((question) => question.difficulty === difficulty)).slice(0, count);
}

export function buildSubjectBlocks(questions, totalQuestions = questions.length) {
  const selected = questions.slice(0, totalQuestions);
  const blocks = SUBJECTS.map((subject) => ({
    subject,
    questions: selected.filter((question) => normalizeSubject(question.subject) === subject),
  })).filter((block) => block.questions.length > 0);
  const other = selected.filter((question) => normalizeSubject(question.subject) === 'Other');
  if (other.length) blocks.push({ subject: 'Other', questions: other });
  return blocks;
}

export async function getAutoDailyChallenge(dateKey) {
  const entries = catalog.practice.filter((entry) => entry.count > 0);
  if (!entries.length) return null;
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
  const entry = entries[dayNumber % entries.length];
  const questions = await loadQuestionFile(entry);
  if (!questions.length) return null;
  return questions[dayNumber % questions.length];
}

export function chapterStatsFor(profile, chapter, difficulty) {
  const record = profile?.testBestScores?.[practiceTitle(chapter, difficulty)];
  return {
    best: record?.score ?? null,
    attempts: record?.attempts ?? 0,
    accuracy: record?.accuracy ?? null,
  };
}

export function testById(id) {
  return catalog.tests.find((test) => test.title === id || test.file === id) || null;
}

export function subjectQuestionCount(subject) {
  return memoize(`subject-count:${subject}`, 300_000, () => catalog.practice
    .filter((entry) => entry.subject === subject)
    .reduce((sum, entry) => sum + entry.count, 0));
}

export function chapterCountForSubject(subject) {
  return catalog.practice.filter((entry) => entry.subject === subject).length;
}
