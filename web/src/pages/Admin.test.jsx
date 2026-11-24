import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthProvider.jsx';
import { DEFAULT_STUDENT_PASSWORD, todayKey } from '../config/constants.js';
import {
  createAnnouncement,
  createResource,
  createStudentAccount,
  deleteAnnouncement,
  deleteResource,
  disableStudent,
  listAnnouncements,
  listDailyChallenges,
  listResources,
  listStudents,
  saveDailyChallenge,
  sendPasswordReset,
  updateResource,
} from '../lib/repository.js';
import Admin from './Admin.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/repository.js', () => ({
  createAnnouncement: vi.fn(),
  createResource: vi.fn(),
  createStudentAccount: vi.fn(),
  deleteAnnouncement: vi.fn(),
  deleteResource: vi.fn(),
  disableStudent: vi.fn(),
  listAnnouncements: vi.fn(),
  listDailyChallenges: vi.fn(),
  listResources: vi.fn(),
  listStudents: vi.fn(),
  saveDailyChallenge: vi.fn(),
  sendPasswordReset: vi.fn(),
  updateResource: vi.fn(),
}));

function renderAdmin() {
  return render(<Admin />);
}

describe('Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: true,
      user: { uid: 'admin-1' },
      profile: { name: 'Admin' },
    });
    vi.mocked(listStudents).mockResolvedValue({ rows: [], cursor: null, hasMore: false });
    vi.mocked(listDailyChallenges).mockResolvedValue([]);
    vi.mocked(listResources).mockResolvedValue({ rows: [], cursor: null, hasMore: false });
    vi.mocked(listAnnouncements).mockResolvedValue([]);
    vi.mocked(createStudentAccount).mockResolvedValue('student-1');
    vi.mocked(saveDailyChallenge).mockResolvedValue(undefined);
    vi.mocked(createResource).mockResolvedValue('resource-1');
    vi.mocked(createAnnouncement).mockResolvedValue(undefined);
    vi.mocked(disableStudent).mockResolvedValue(undefined);
    vi.mocked(sendPasswordReset).mockResolvedValue(undefined);
    vi.mocked(updateResource).mockResolvedValue(undefined);
    vi.mocked(deleteResource).mockResolvedValue(undefined);
    vi.mocked(deleteAnnouncement).mockResolvedValue(undefined);
  });

  it('navigates between tabs', async () => {
    const user = userEvent.setup();
    renderAdmin();

    expect(screen.getByRole('button', { name: 'Add student' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Daily Challenges' }));
    expect(screen.getByText('Challenge details')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Resources' }));
    expect(screen.getByRole('button', { name: 'Add resource' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Announcements' }));
    expect(screen.getByText('New announcement')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Students' }));
    expect(screen.getByRole('button', { name: 'Add student' })).toBeTruthy();
  });

  it('validates the student form and creates once with a safe payload', async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: 'Add student' }));
    expect(screen.getByText('Name, username and email are required.')).toBeTruthy();
    expect(createStudentAccount).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Name'), '  Arya  ');
    await user.type(screen.getByLabelText('Username'), '  arya01  ');
    await user.type(screen.getByLabelText('Email'), 'arya@example.com');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), DEFAULT_STUDENT_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Add student' }));

    await waitFor(() => expect(createStudentAccount).toHaveBeenCalledTimes(1));
    expect(createStudentAccount).toHaveBeenCalledWith({
      name: 'Arya',
      username: 'arya01',
      email: 'arya@example.com',
      password: DEFAULT_STUDENT_PASSWORD,
      institute: '',
    });
    expect(screen.getByText(`Student created (student-1). Default password: ${DEFAULT_STUDENT_PASSWORD}`)).toBeTruthy();
    expect(screen.getByLabelText('Name').value).toBe('');
  });

  it('rejects javascript resource links and accepts relative links', async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: 'Resources' }));
    await user.type(screen.getByLabelText('Title'), 'Notes');
    await user.type(screen.getByLabelText('File link'), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Add resource' }));

    expect(screen.getByText('Title and a valid http(s) or relative link are required.')).toBeTruthy();
    expect(createResource).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('File link'));
    await user.type(screen.getByLabelText('File link'), '/notes/maths.pdf');
    await user.click(screen.getByRole('button', { name: 'Add resource' }));

    await waitFor(() => expect(createResource).toHaveBeenCalledWith({ title: 'Notes', link: '/notes/maths.pdf' }));
    expect(createResource).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Resource added.')).toBeTruthy();
  });

  it('validates the daily challenge form before saving', async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: 'Daily Challenges' }));
    await user.click(screen.getByRole('button', { name: 'Save challenge' }));

    expect(screen.getByText('Date, question and all four options are required.')).toBeTruthy();
    expect(saveDailyChallenge).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Question'), 'What is 2 + 2?');
    for (const option of ['Two', 'Four', 'Six', 'Eight']) {
      await user.type(screen.getByLabelText(`Option ${option === 'Two' ? 'A' : option === 'Four' ? 'B' : option === 'Six' ? 'C' : 'D'}`), option);
    }
    await user.click(screen.getByRole('button', { name: 'Save challenge' }));

    await waitFor(() => expect(saveDailyChallenge).toHaveBeenCalledTimes(1));
    expect(saveDailyChallenge).toHaveBeenCalledWith({
      date: todayKey(),
      topic: '',
      question: 'What is 2 + 2?',
      options: ['Two', 'Four', 'Six', 'Eight'],
      correctIndex: 0,
      explanation: '',
    });
  });

  it('validates the announcement form before posting', async () => {
    const user = userEvent.setup();
    renderAdmin();

    await user.click(screen.getByRole('button', { name: 'Announcements' }));
    await user.click(screen.getByRole('button', { name: 'Post announcement' }));

    expect(screen.getByText('Title and message are required.')).toBeTruthy();
    expect(createAnnouncement).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Title'), 'Exam update');
    await user.type(screen.getByLabelText('Message'), 'Results are live.');
    await user.click(screen.getByRole('button', { name: 'Post announcement' }));

    await waitFor(() => expect(createAnnouncement).toHaveBeenCalledWith({ title: 'Exam update', message: 'Results are live.' }));
    expect(screen.getByText('Announcement posted.')).toBeTruthy();
  });

  it('shows load errors for each admin tab', async () => {
    const user = userEvent.setup();
    vi.mocked(listStudents).mockRejectedValueOnce(new Error('students offline'));
    vi.mocked(listDailyChallenges).mockRejectedValueOnce(new Error('challenges offline'));
    vi.mocked(listResources).mockRejectedValueOnce(new Error('resources offline'));
    vi.mocked(listAnnouncements).mockRejectedValueOnce(new Error('announcements offline'));

    renderAdmin();

    await waitFor(() => expect(screen.getByText('students offline')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Daily Challenges' }));
    await waitFor(() => expect(screen.getByText('challenges offline')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Resources' }));
    await waitFor(() => expect(screen.getByText('resources offline')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Announcements' }));
    await waitFor(() => expect(screen.getByText('announcements offline')).toBeTruthy());
  });

  it('denies access to non-admins', () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: false,
      user: { uid: 'student-1' },
      profile: { name: 'Student' },
    });

    renderAdmin();

    expect(screen.getByText('Access denied')).toBeTruthy();
    expect(screen.getByText('You need admin access to open this page.')).toBeTruthy();
    expect(listStudents).not.toHaveBeenCalled();
  });
});
