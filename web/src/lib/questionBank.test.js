import { describe, expect, it } from 'vitest';
import catalog from '../data/catalog.generated.json';
import { SUBJECTS } from '../config/constants.js';
import {
  buildSubjectBlocks,
  chapterCountForSubject,
  chapterStatsFor,
  normalizeSubject,
  practiceTitle,
  questionId,
  selectPracticeQuestions,
  subjectQuestionCount,
} from './questionBank.js';

const pool = [
  { subject: 'Mathematics', chapter: 'Functions', difficulty: 'Easy', question: 'A', options: [], correctIndex: 0 },
  { subject: 'Physics', chapter: 'Motion', difficulty: 'Easy', question: 'B', options: [], correctIndex: 0 },
  { subject: 'Chemistry', chapter: 'Atoms', difficulty: 'Hard', question: 'C', options: [], correctIndex: 0 },
  { subject: 'Mathematics', chapter: 'Matrices', difficulty: 'Hard', question: 'D', options: [], correctIndex: 0 },
];

function sharedChapterOwners() {
  const chapters = [...new Set(catalog.practice.map((entry) => entry.chapter))];
  const chapter = chapters.find((item) => SUBJECTS.filter((subject) => catalog.practice.some((entry) => entry.subject === subject && entry.chapter === item)).length > 1);
  const owners = SUBJECTS.filter((subject) => catalog.practice.some((entry) => entry.subject === subject && entry.chapter === chapter));
  return { chapter, owners };
}

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

describe('subject-aware practice metadata', () => {
  it('suffixes practice titles for non-first owners of a shared chapter', () => {
    const { chapter, owners } = sharedChapterOwners();
    expect(chapter).toBeTruthy();
    expect(owners.length).toBeGreaterThan(1);
    expect(practiceTitle(chapter, 'Easy', owners[0])).toBe(`${chapter} · Easy`);
    expect(practiceTitle(chapter, 'Easy', owners[1])).toBe(`${chapter} (${owners[1]}) · Easy`);
    expect(practiceTitle(chapter, 'Easy', owners[1].toLowerCase())).toBe(`${chapter} (${owners[1]}) · Easy`);
    expect(practiceTitle(chapter, 'Easy')).toBe(`${chapter} · Easy`);
  });

  it('reads chapter stats from the subject-specific score key', () => {
    const { chapter, owners } = sharedChapterOwners();
    const other = owners[1];
    const profile = {
      testBestScores: {
        [`${chapter} (${other}) · Medium`]: { score: 17, attempts: 3, accuracy: 85 },
        [`${chapter} · Medium`]: { score: 4, attempts: 1, accuracy: 40 },
      },
    };
    expect(chapterStatsFor(profile, chapter, 'Medium', other)).toEqual({ best: 17, attempts: 3, accuracy: 85 });
    expect(chapterStatsFor(profile, chapter, 'Medium', owners[0])).toEqual({ best: 4, attempts: 1, accuracy: 40 });
    expect(chapterStatsFor({}, chapter, 'Medium', other)).toEqual({ best: null, attempts: 0, accuracy: null });
  });

  it('counts chapters and questions per subject from the generated catalog', () => {
    for (const subject of SUBJECTS) {
      const entries = catalog.practice.filter((entry) => entry.subject === subject);
      expect(chapterCountForSubject(subject)).toBe(entries.length);
      expect(subjectQuestionCount(subject)).toBe(entries.reduce((sum, entry) => sum + entry.count, 0));
    }
    expect(chapterCountForSubject('Other')).toBe(0);
    expect(subjectQuestionCount('Other')).toBe(0);
  });
});
