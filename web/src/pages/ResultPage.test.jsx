import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthProvider.jsx';
import { getResultById } from '../lib/repository.js';
import ResultPage from './ResultPage.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/repository.js', () => ({
  getResultById: vi.fn(),
}));

function renderResult(entry = '/app/result/u1/attempt-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/result/:uid/:attemptId" element={<ResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ loading: false, profile: null, user: { uid: 'u1' } });
    vi.mocked(getResultById).mockResolvedValue(null);
  });

  it('shows a loading state', async () => {
    let resolveResult;
    vi.mocked(getResultById).mockReturnValue(new Promise((resolve) => { resolveResult = resolve; }));
    renderResult('/app/result/u1/attempt%201');

    expect(screen.getByText(/Loading result/)).toBeTruthy();
    expect(getResultById).toHaveBeenCalledWith('u1', 'attempt 1');
    await act(async () => { resolveResult(null); });
  });

  it('shows a load error and retries', async () => {
    const user = userEvent.setup();
    vi.mocked(getResultById)
      .mockRejectedValueOnce(new Error('result offline'))
      .mockResolvedValueOnce({ title: 'Recovered quiz', score: 10 });
    renderResult();

    await waitFor(() => expect(screen.getByText('result offline')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Recovered quiz')).toBeTruthy());
    expect(getResultById).toHaveBeenCalledTimes(2);
  });

  it('shows a not-found state', async () => {
    renderResult();

    await waitFor(() => expect(screen.getByText('This result could not be found.')).toBeTruthy());
    expect(screen.getByText('Result unavailable')).toBeTruthy();
  });

  it('renders the full review list', async () => {
    vi.mocked(getResultById).mockResolvedValue({
      title: 'Mock One',
      attemptId: 'attempt-1',
      bank: 'M',
      review: [
        {
          questionId: 'q1',
          topic: 'Algebra',
          status: 'Wrong',
          question: 'What is 3 squared?',
          options: ['Six', 'Eight', 'Nine'],
          selectedIndex: 0,
          correctIndex: 2,
          explanation: 'Three times three is nine.',
        },
        {
          questionId: 'q2',
          status: 'Correct',
          question: 'What is 4 squared?',
          options: ['Twelve', 'Sixteen'],
          selectedIndex: 1,
          correctIndex: 1,
        },
      ],
    });
    renderResult();

    await waitFor(() => expect(screen.getByText('What is 3 squared?')).toBeTruthy());
    expect(screen.getByText('What is 4 squared?')).toBeTruthy();
    const firstArticle = screen.getByText('What is 3 squared?').closest('article');
    const secondArticle = screen.getByText('What is 4 squared?').closest('article');
    expect(within(firstArticle).getByText('Algebra')).toBeTruthy();
    expect(within(firstArticle).getByText('Wrong')).toBeTruthy();
    expect(within(secondArticle).getByText('Correct')).toBeTruthy();
    expect(within(firstArticle).getByText('A. Six')).toBeTruthy();
    expect(within(firstArticle).getByText('C. Nine')).toBeTruthy();
    expect(within(firstArticle).getByText('Three times three is nine.')).toBeTruthy();
  });

  it('links Retry to a practice page', async () => {
    vi.mocked(getResultById).mockResolvedValue({
      title: 'Mathematics · Quadratic Equations',
      bank: 'P',
      score: 42,
      accuracy: 70,
      correct: 7,
      wrong: 2,
      skipped: 1,
      retryTo: '/app/practice/Mathematics/Algebra/Quadratic%20Equations',
    });
    renderResult();

    await waitFor(() => expect(screen.getByText('Mathematics · Quadratic Equations')).toBeTruthy());
    const retry = screen.getByRole('link', { name: 'Retry' });
    expect(retry.getAttribute('href')).toBe('/app/practice/Mathematics/Algebra/Quadratic%20Equations');
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
  });

  it('derives a practice retry link from a practice result', async () => {
    vi.mocked(getResultById).mockResolvedValue({
      title: 'Mathematics · Quadratic Equations',
      bank: 'P',
      subjectTotals: { Mathematics: { total: 10, correct: 7 } },
      score: 70,
    });
    renderResult();

    await waitFor(() => expect(screen.getByText('Mathematics · Quadratic Equations')).toBeTruthy());
    const retry = screen.getByRole('link', { name: 'Retry' });
    expect(retry.getAttribute('href')).toBe('/app/practice/Mathematics/Mathematics/Quadratic%20Equations');
  });
});
