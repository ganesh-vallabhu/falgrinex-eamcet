import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthProvider.jsx';
import { todayKey } from '../config/constants.js';
import {
  getAutoDailyChallenge,
  loadPracticeChapter,
  loadTestQuestions,
  normalizeSubject,
  practiceTitle,
  questionId,
  selectPracticeQuestions,
  testById,
} from '../lib/questionBank.js';
import { getDailyChallenge, getResultById, saveQuizAttempt } from '../lib/repository.js';
import { scoreSubmission } from '../lib/scoring.js';
import QuizRunner from './QuizRunner.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/questionBank.js', () => ({
  getAutoDailyChallenge: vi.fn(),
  loadPracticeChapter: vi.fn(),
  loadTestQuestions: vi.fn(),
  normalizeSubject: vi.fn(),
  practiceTitle: vi.fn(),
  questionId: vi.fn(),
  selectPracticeQuestions: vi.fn(),
  testById: vi.fn(),
}));

vi.mock('../lib/repository.js', () => ({
  getDailyChallenge: vi.fn(),
  getResultById: vi.fn(),
  saveQuizAttempt: vi.fn(),
}));

vi.mock('../lib/scoring.js', () => ({
  scoreSubmission: vi.fn(),
}));

const practiceQuestions = [
  {
    id: 'q1',
    subject: 'Mathematics',
    chapter: 'Functions',
    difficulty: 'Easy',
    topic: 'Domain',
    question: 'Question one',
    options: ['First', 'Second', 'Third'],
    correctIndex: 0,
  },
  {
    id: 'q2',
    subject: 'Mathematics',
    chapter: 'Functions',
    difficulty: 'Easy',
    topic: 'Range',
    question: 'Question two',
    options: ['Alpha', 'Beta', 'Gamma'],
    correctIndex: 1,
  },
  {
    id: 'q3',
    subject: 'Mathematics',
    chapter: 'Functions',
    difficulty: 'Easy',
    topic: 'Inverse',
    question: 'Question three',
    options: ['Red', 'Green', 'Blue'],
    correctIndex: 2,
  },
];

const dailyQuestion = {
  topic: 'Logic',
  question: 'Daily question',
  options: ['First', 'Second', 'Third', 'Fourth'],
  correctIndex: 1,
  explanation: 'Daily explanation',
};

const autoDailyQuestion = {
  topic: 'Reasoning',
  question: 'Auto daily question',
  options: ['One', 'Two', 'Three', 'Four'],
  correctIndex: 0,
};

function renderPractice() {
  return render(
    <MemoryRouter initialEntries={['/app/practice/Maths/Functions/Easy']}>
      <Routes>
        <Route path="/app/practice/:subject/:chapter/:difficulty" element={<QuizRunner mode="practice" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDaily() {
  return render(
    <MemoryRouter initialEntries={['/app/test/daily/today']}>
      <Routes>
        <Route path="/app/test/:bank/:title" element={<QuizRunner mode="test" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuizRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'u1', email: 'student@example.com' },
      profile: { name: 'Arya' },
      loading: false,
      isAuthenticated: true,
      isAdmin: false,
    });
    vi.mocked(normalizeSubject).mockImplementation((value) => (
      /^math/i.test(String(value)) ? 'Mathematics' : 'Other'
    ));
    vi.mocked(questionId).mockImplementation((bank, question) => `${bank}:${question.id}`);
    vi.mocked(practiceTitle).mockImplementation((chapter, difficulty, subject) => `${subject} ${chapter} ${difficulty}`);
    vi.mocked(loadPracticeChapter).mockResolvedValue(practiceQuestions);
    vi.mocked(selectPracticeQuestions).mockImplementation((pool) => pool);
    vi.mocked(loadTestQuestions).mockResolvedValue([]);
    vi.mocked(testById).mockReturnValue(null);
    vi.mocked(getDailyChallenge).mockResolvedValue(null);
    vi.mocked(getAutoDailyChallenge).mockResolvedValue(autoDailyQuestion);
    vi.mocked(saveQuizAttempt).mockResolvedValue({ result: { attemptId: 'saved' } });
    vi.mocked(getResultById).mockResolvedValue(null);
    vi.mocked(scoreSubmission).mockReturnValue({ score: 0, correct: 0, wrong: 0, total: 3, review: [] });
  });

  it('retains restored answers, bookmarks and index for the daily challenge', async () => {
    localStorage.setItem(`falgrinex_quiz_u1_test_daily/${todayKey()}`, JSON.stringify({
      answers: [1],
      bookmarks: [true],
      index: 0,
      secondsLeft: null,
    }));
    vi.mocked(getDailyChallenge).mockResolvedValue(dailyQuestion);

    renderDaily();

    await waitFor(() => expect(screen.getByText('Daily question')).toBeTruthy());
    expect(screen.getAllByRole('radio')[1].checked).toBe(true);
    expect(screen.getByText('Marked for review')).toBeTruthy();
    expect(screen.getByText('1 answered · 0 skipped · 1 bookmarked')).toBeTruthy();
    expect(screen.getByText('Question 1 of 1')).toBeTruthy();
  });

  it('shows a load error and recovers through retry', async () => {
    const user = userEvent.setup();
    vi.mocked(loadPracticeChapter).mockRejectedValueOnce(new Error('bank offline'));

    renderPractice();

    await waitFor(() => expect(screen.getByText('bank offline')).toBeTruthy());
    expect(screen.getByText('Quiz unavailable')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Question one')).toBeTruthy());
    expect(loadPracticeChapter).toHaveBeenCalledTimes(2);
  });

  it('shows save errors inline while the quiz stays visible', async () => {
    const user = userEvent.setup();
    vi.mocked(saveQuizAttempt).mockRejectedValue(new Error('save blocked'));

    renderPractice();
    await waitFor(() => expect(screen.getByText('Question one')).toBeTruthy());

    await user.click(screen.getAllByRole('button', { name: 'Submit quiz' })[0]);
    await user.click(screen.getByRole('button', { name: 'Submit now' }));

    await waitFor(() => expect(screen.getByText('save blocked')).toBeTruthy());
    expect(screen.getByText('Question one')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('updates the palette after choosing an option and bookmarking', async () => {
    const user = userEvent.setup();

    renderPractice();
    await waitFor(() => expect(screen.getByText('Question one')).toBeTruthy());

    await user.click(screen.getAllByRole('radio')[1]);
    expect(screen.getByText('1 answered · 2 skipped · 0 bookmarked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Mark for review' }));
    expect(screen.getByText('1 answered · 2 skipped · 1 bookmarked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Question 1, answered, bookmarked' })).toBeTruthy();
  });

  it('restores practice question order from stored questionIds', async () => {
    const user = userEvent.setup();
    vi.mocked(selectPracticeQuestions).mockImplementation((pool) => [pool[1], pool[2], pool[0]]);
    localStorage.setItem('falgrinex_quiz_u1_practice_Mathematics/Functions/Easy', JSON.stringify({
      answers: [],
      bookmarks: [],
      index: 0,
      questionIds: ['P:q1', 'P:q2', 'P:q3'],
    }));

    renderPractice();

    await waitFor(() => expect(screen.getByText('Question one')).toBeTruthy());
    expect(selectPracticeQuestions).toHaveBeenCalled();
    expect(screen.queryByText('Question two')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Question two')).toBeTruthy();
  });

  it('falls back to the auto challenge when the stored challenge fails', async () => {
    vi.mocked(getDailyChallenge).mockRejectedValue(new Error('challenge offline'));

    renderDaily();

    await waitFor(() => expect(screen.getByText('Auto daily question')).toBeTruthy());
    expect(getAutoDailyChallenge).toHaveBeenCalledWith(todayKey());
    expect(screen.queryByText('challenge offline')).toBeNull();
  });
});
