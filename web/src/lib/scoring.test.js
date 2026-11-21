import { describe, expect, it } from 'vitest';
import { bestScoreDelta, nextStreak, scoreSubmission } from './scoring.js';

const questions = [
  { subject: 'Mathematics', topic: 'Functions', question: 'Q1', options: ['a', 'b', 'c', 'd'], correctIndex: 1, chapter: 'Functions', difficulty: 'Easy' },
  { subject: 'Physics', topic: 'Motion', question: 'Q2', options: ['a', 'b', 'c', 'd'], correctIndex: 2, chapter: 'Motion', difficulty: 'Medium' },
  { subject: 'Chemistry', topic: 'Atoms', question: 'Q3', options: ['a', 'b', 'c', 'd'], correctIndex: 0, chapter: 'Atoms', difficulty: 'Hard' },
];

describe('scoreSubmission', () => {
  it('scores correct, wrong, and skipped answers', () => {
    const result = scoreSubmission({ questions, answers: [1, 0, null], title: 'Test' });
    expect(result).toMatchObject({ correct: 1, wrong: 1, skipped: 1, attempted: 2, total: 3, score: 1, accuracy: 33 });
    expect(result.subjectTotals.Mathematics).toEqual({ correct: 1, total: 1 });
    expect(result.wrongTopics).toEqual(['Motion']);
    expect(result.review[1].status).toBe('Wrong');
  });

  it('applies negative marking only when requested', () => {
    const answers = [1, 0, 3];
    const plain = scoreSubmission({ questions, answers });
    const negative = scoreSubmission({ questions, answers, negativeMarking: true });
    expect(plain.score).toBe(1);
    expect(negative.score).toBe(0.5);
    expect(negative.wrong).toBe(2);
  });
});

describe('progress helpers', () => {
  it('awards only the improvement over previous best', () => {
    expect(bestScoreDelta({ testBestScores: { Test: { score: 80 } } }, 'Test', 95)).toBe(15);
    expect(bestScoreDelta({ testBestScores: { Test: { score: 95 } } }, 'Test', 80)).toBe(0);
  });

  it('continues a streak only across consecutive days', () => {
    expect(nextStreak('2026-11-20', '2026-11-21', 4)).toBe(5);
    expect(nextStreak('2026-11-19', '2026-11-21', 4)).toBe(1);
    expect(nextStreak('2026-11-21', '2026-11-21', 4)).toBe(4);
  });
});
