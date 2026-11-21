import { describe, expect, it } from 'vitest';
import { buildSubjectBlocks, normalizeSubject, questionId, selectPracticeQuestions } from './questionBank.js';

const pool = [
  { subject: 'Mathematics', chapter: 'Functions', difficulty: 'Easy', question: 'A', options: [], correctIndex: 0 },
  { subject: 'Physics', chapter: 'Motion', difficulty: 'Easy', question: 'B', options: [], correctIndex: 0 },
  { subject: 'Chemistry', chapter: 'Atoms', difficulty: 'Hard', question: 'C', options: [], correctIndex: 0 },
  { subject: 'Mathematics', chapter: 'Matrices', difficulty: 'Hard', question: 'D', options: [], correctIndex: 0 },
];

describe('question bank helpers', () => {
  it('normalizes subject names', () => {
    expect(normalizeSubject('maths')).toBe('Mathematics');
    expect(normalizeSubject('Physics')).toBe('Physics');
    expect(normalizeSubject('chem')).toBe('Chemistry');
  });

  it('selects by difficulty and caps the count', () => {
    expect(selectPracticeQuestions(pool, 'Easy', 1)).toHaveLength(1);
    expect(selectPracticeQuestions(pool, 'Hard', 10)).toHaveLength(2);
    expect(['A', 'B']).toContain(selectPracticeQuestions(pool, 'Easy', 1)[0].question);
  });

  it('groups test questions by subject in legacy order', () => {
    const blocks = buildSubjectBlocks([pool[1], pool[0], pool[2]], 3);
    expect(blocks.map((block) => block.subject)).toEqual(['Mathematics', 'Physics', 'Chemistry']);
  });

  it('creates a stable question id', () => {
    expect(questionId('P', pool[0])).toBe(questionId('P', { ...pool[0] }));
    expect(questionId('P', pool[0])).not.toBe(questionId('M', pool[0]));
  });
});
