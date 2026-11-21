function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function validateUsername(username) {
  const value = normalizeUsername(username);
  if (!value || value.length > 128 || /[/#\[\]]/.test(value) || value === '.' || value === '..' || /^__.*__$/.test(value) || value.includes('@')) {
    fail('invalid-argument', 'Username must be 1-128 characters and contain no spaces, slashes, brackets, @, or reserved names.');
  }
  return value;
}

function questionIdFor(bank, question) {
  const scope = bank === 'P'
    ? `${question.chapter || ''} · ${question.difficulty || ''}`
    : (question.test || '');
  return [bank, scope, question.subject || '', question.chapter || '', question.difficulty || '', question.topic || '', question.question || '']
    .map(value => String(value).trim().toLowerCase())
    .join('|');
}

const PRACTICE_CAPS = { easy: 30, medium: 25, hard: 20 };
const expectedCountCache = new WeakMap();

function expectedCountsFor(bankData) {
  if (expectedCountCache.has(bankData)) return expectedCountCache.get(bankData);
  const rawCounts = {};
  const samples = {};
  Object.values(bankData.questions || {}).forEach(entry => {
    const title = normalizeText(expectedTitleFor(entry));
    rawCounts[title] = (rawCounts[title] || 0) + 1;
    if (!samples[title]) samples[title] = entry;
  });
  const counts = Object.assign({}, rawCounts);
  Object.keys(rawCounts).forEach(title => {
    const sample = samples[title];
    if (sample && String(sample.bank).toUpperCase() === 'P') {
      const cap = PRACTICE_CAPS[normalizeText(sample.difficulty)];
      counts[title] = cap ? Math.min(cap, rawCounts[title]) : rawCounts[title];
    }
  });
  expectedCountCache.set(bankData, counts);
  return counts;
}

function normalizeSubject(subject) {
  const value = normalizeText(subject);
  if (value.startsWith('math')) return 'Mathematics';
  if (value.startsWith('phys')) return 'Physics';
  if (value.startsWith('chem')) return 'Chemistry';
  return null;
}

function expectedTitleFor(entry) {
  return String(entry.bank).toUpperCase() === 'P'
    ? `${entry.chapter || ''} · ${entry.difficulty || ''}`
    : String(entry.test || '');
}

function scoreSubmission(bankData, payload) {
  const input = payload || {};
  const attemptId = String(input.attemptId || '').trim();
  if (!attemptId || attemptId.length > 128 || /[/#\[\]]/.test(attemptId) || attemptId === '.' || attemptId === '..') {
    fail('invalid-argument', 'Invalid attempt identifier.');
  }
  const title = String(input.title || '').trim();
  if (!title || title.length > 200) fail('invalid-argument', 'Invalid test title.');
  const bank = String(input.questionBank || '').toUpperCase();
  if (!['P', 'M', 'G'].includes(bank)) fail('invalid-argument', 'Unknown question bank.');
  if (!bankData || !bankData.questions) fail('failed-precondition', 'Trusted question bank is unavailable.');
  if (!Array.isArray(input.answers) || input.answers.length < 1 || input.answers.length > 300) {
    fail('invalid-argument', 'A submission must contain between 1 and 300 answers.');
  }
  const expectedCount = expectedCountsFor(bankData)[normalizeText(title)];
  if (expectedCount && input.answers.length !== expectedCount) {
    fail('invalid-argument', `This test requires exactly ${expectedCount} answers.`);
  }

  const seen = new Set();
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  const wrongTopics = new Set();
  const subjectTotals = {};
  const review = [];

  for (const answer of input.answers) {
    const questionId = String((answer && answer.questionId) || '');
    if (!questionId || questionId.length > 2000 || seen.has(questionId)) {
      fail('invalid-argument', 'Duplicate or invalid question in submission.');
    }
    seen.add(questionId);
    const entry = bankData.questions[questionId];
    if (!entry) fail('invalid-argument', 'Question is not present in the trusted bank.');
    if (String(entry.bank).toUpperCase() !== bank) fail('invalid-argument', 'Question does not belong to this question bank.');
    if (normalizeText(expectedTitleFor(entry)) !== normalizeText(title)) {
      fail('invalid-argument', 'Question does not belong to this test.');
    }
    const answerIndex = answer.answerIndex;
    if (answerIndex !== null && answerIndex !== undefined) {
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= entry.optionCount) {
        fail('invalid-argument', 'Answer index is outside the trusted option range.');
      }
    }
    const answered = answerIndex !== null && answerIndex !== undefined;
    const isCorrect = answered && answerIndex === entry.correctIndex;
    if (!answered) skipped++;
    else if (isCorrect) correct++;
    else {
      wrong++;
      wrongTopics.add(entry.topic || entry.chapter || entry.subject || 'General');
    }
    const subject = normalizeSubject(entry.subject);
    if (subject) {
      subjectTotals[subject] = subjectTotals[subject] || { correct: 0, total: 0 };
      subjectTotals[subject].total++;
      if (isCorrect) subjectTotals[subject].correct++;
    }
    review.push({
      questionId,
      answerIndex: answered ? answerIndex : null,
      correctIndex: entry.correctIndex,
      status: !answered ? 'Skipped' : (isCorrect ? 'Correct' : 'Wrong')
    });
  }

  const total = input.answers.length;
  const elapsed = Number(input.elapsedSeconds);
  const timeTakenSec = Number.isFinite(elapsed) ? Math.max(0, Math.min(86400, Math.round(elapsed))) : 0;
  const score = Math.round(correct * 100) / 100;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return {
    result: {
      attemptId,
      title,
      subject: String(input.subject || 'Mixed').slice(0, 100),
      testType: String(input.testType || (bank === 'P' ? 'Practice' : 'Mock')).slice(0, 50),
      questionBank: bank,
      correct,
      wrong,
      skipped,
      total,
      score,
      accuracy,
      timeTakenSec,
      wrongTopics: Array.from(wrongTopics),
      review
    },
    subjectTotals,
    wrongTopics: Array.from(wrongTopics)
  };
}

module.exports = { fail, normalizeText, normalizeUsername, validateUsername, questionIdFor, normalizeSubject, expectedCountsFor, scoreSubmission };
