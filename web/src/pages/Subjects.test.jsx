import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthProvider.jsx';
import { chapterCountForSubject, chapterStatsFor, loadCatalog, subjectQuestionCount } from '../lib/questionBank.js';
import Subjects from './Subjects.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/questionBank.js', () => ({
  loadCatalog: vi.fn(),
  chapterStatsFor: vi.fn(),
  chapterCountForSubject: vi.fn(),
  subjectQuestionCount: vi.fn(),
}));

let profile;
let catalog;

function renderSubjects() {
  return render(
    <MemoryRouter>
      <Subjects />
    </MemoryRouter>,
  );
}

describe('Subjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profile = { id: 'profile-1', name: 'Arya' };
    catalog = {
      subjects: {
        Mathematics: ['2027'],
        Physics: ['2027'],
        Chemistry: ['2027'],
      },
      chapterOrder: {
        Mathematics: { '2027': ['Algebra', 'Calculus'] },
        Physics: { '2027': ['Motion'] },
        Chemistry: { '2027': [] },
      },
      practice: [
        { subject: 'Mathematics', chapter: 'Algebra', count: 20 },
      ],
    };
    vi.mocked(useAuth).mockReturnValue({ loading: false, profile });
    vi.mocked(loadCatalog).mockResolvedValue(catalog);
    vi.mocked(chapterStatsFor).mockReturnValue({ best: null, attempts: 0, accuracy: 0 });
    vi.mocked(chapterCountForSubject).mockReturnValue(10);
    vi.mocked(subjectQuestionCount).mockReturnValue(100);
  });

  it('filters chapters by search text', async () => {
    const user = userEvent.setup();
    renderSubjects();

    await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy());
    expect(screen.getByText('Motion')).toBeTruthy();

    await user.type(screen.getByLabelText('Filter chapters'), 'motion');

    expect(screen.getByText('Motion')).toBeTruthy();
    expect(screen.queryByText('Algebra')).toBeNull();
    expect(screen.queryByText('Calculus')).toBeNull();
  });

  it('passes the subject into chapter stats and shows the badge', async () => {
    vi.mocked(chapterStatsFor).mockImplementation((student, chapter, difficulty, subject) => (
      subject === 'Physics' && chapter === 'Motion' && difficulty === 'Easy'
        ? { best: '19/20', attempts: 2, accuracy: 95 }
        : { best: null, attempts: 0, accuracy: 0 }
    ));
    renderSubjects();

    await waitFor(() => expect(screen.getByText('Easy 19/20')).toBeTruthy());
    expect(chapterStatsFor).toHaveBeenCalledWith(profile, 'Motion', 'Easy', 'Physics');
    expect(subjectQuestionCount).toHaveBeenCalledWith('Physics');
  });

  it('shows an empty state and clears the filter', async () => {
    const user = userEvent.setup();
    renderSubjects();

    await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy());
    await user.type(screen.getByLabelText('Filter chapters'), 'unknown chapter');

    expect(screen.getByText('No chapters found')).toBeTruthy();
    expect(screen.getByText('Nothing matches “unknown chapter”. Try a different chapter name.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));

    expect(screen.getByText('Algebra')).toBeTruthy();
    expect(screen.getByText('Motion')).toBeTruthy();
  });

  it('retries after a catalog error', async () => {
    const user = userEvent.setup();
    vi.mocked(loadCatalog)
      .mockRejectedValueOnce(new Error('catalog broken'))
      .mockResolvedValueOnce(catalog);
    renderSubjects();

    await waitFor(() => expect(screen.getByText('catalog broken')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Algebra')).toBeTruthy());
    expect(loadCatalog).toHaveBeenCalledTimes(2);
  });
});
