import { NEGATIVE_MARK } from '../config/constants.js';
import { normalizeSubject, questionId } from './questionBank.js';

export function scoreSubmission({ questions, answers, negativeMarking = false, bank = 'P', title = '' }) {
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  const wrongTopics = [];
  const subjectTotals = {};
  const review = [];

  questions.forEach((question, index) => {
    const selected = answers[index] ?? null;
    const correctIndex = Number(question.correctIndex);
    const subject = normalizeSubject(question.subject);
    if (subject && subject !== 'Other') {
      if (!subjectTotals[subject]) subjectTotals[subject] = { correct: 0, total: 0 };
      subjectTotals[subject].total += 1;
    }

    let status = 'Skipped';
    if (selected === null || selected === undefined) {
      skipped += 1;
    } else if (Number(selected) === correctIndex) {
      correct += 1;
      status = 'Correct';
      if (subject && subject !== 'Other') subjectTotals[subject].correct += 1;
    } else {
      wrong += 1;
      status = 'Wrong';
      wrongTopics.push(question.topic || question.chapter || question.subject || 'General');
    }

    review.push({
      questionId: questionId(bank, question),
      question: question.question,
      options: question.options,
      correctIndex,
      selectedIndex: selected,
      status,
      explanation: question.explanation || '',
      topic: question.topic || question.chapter || question.subject || 'General',
    });
  });

  const attempted = correct + wrong;
  const total = questions.length;
  const penalty = negativeMarking ? wrong * NEGATIVE_MARK : 0;
  const score = Math.round((correct - penalty) * 100) / 100;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  return {
    title,
    bank,
    correct,
    wrong,
    skipped,
    attempted,
    total,
    score,
    accuracy,
    negativeMarking,
    wrongTopics: [...new Set(wrongTopics)],
    subjectTotals,
    review,
  };
}

export function bestScoreDelta(profile, title, score) {
  const previous = Number(profile?.testBestScores?.[title]?.score ?? -Infinity);
  return Math.max(0, Number(score) - (previous === -Infinity ? 0 : previous));
}

export function nextStreak(lastActiveDate, today, currentStreak = 0) {
  if (lastActiveDate === today) return currentStreak;
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const previous = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return lastActiveDate === previous ? Number(currentStreak || 0) + 1 : 1;
}
