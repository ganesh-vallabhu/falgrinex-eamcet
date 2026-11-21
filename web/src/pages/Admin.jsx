import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Spinner } from '../components/Feedback.jsx';
import { DEFAULT_STUDENT_PASSWORD, PAGE_SIZE, todayKey } from '../config/constants.js';
import { errorMessage } from '../lib/errors.js';
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

const TABS = ['Students', 'Daily Challenges', 'Resources', 'Announcements'];

function Notice({ error, success }) {
  return (
    <>
      {error && <p className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {success && <p className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{success}</p>}
    </>
  );
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function StudentsTab() {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState({ name: '', username: '', email: '', password: DEFAULT_STUDENT_PASSWORD, institute: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load(nextCursor = null) {
    setLoading(true);
    setError('');
    try {
      const page = await listStudents({ pageSize: PAGE_SIZE, cursor: nextCursor });
      setRows((previous) => (nextCursor ? [...previous, ...page.rows] : page.rows));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load students.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !query || [row.name, row.username, row.email].some((value) => String(value || '').toLowerCase().includes(query));
      const disabled = Boolean(row.disabled || row.archived);
      const matchesStatus = status === 'all' || (status === 'disabled' ? disabled : !disabled);
      return matchesQuery && matchesStatus;
    });
  }, [rows, search, status]);

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function clearForm() {
    setForm({ name: '', username: '', email: '', password: DEFAULT_STUDENT_PASSWORD, institute: '' });
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.name.trim() || !form.username.trim() || !form.email.trim()) {
      setError('Name, username and email are required.');
      return;
    }
    setBusy(true);
    try {
      const uid = await createStudentAccount({
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password || DEFAULT_STUDENT_PASSWORD,
        institute: form.institute.trim(),
      });
      setSuccess(`Student created (${uid}). Default password: ${form.password || DEFAULT_STUDENT_PASSWORD}`);
      clearForm();
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create the student account.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(student) {
    if (!window.confirm(`Disable ${student.name || student.username}? Their records will be kept.`)) return;
    setError('');
    setSuccess('');
    try {
      await disableStudent(student);
      setSuccess(`${student.name || student.username} disabled.`);
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not disable the student.'));
    }
  }

  async function handleReset(student) {
    if (!student.email) {
      setError('This student has no email on file.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      await sendPasswordReset(student.email);
      setSuccess(`Password reset link sent to ${student.email}.`);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not send the reset link.'));
    }
  }

  return (
    <>
      <form className="card" onSubmit={handleCreate}>
        <h2 className="text-lg font-semibold text-white">Add student</h2>
        <p className="muted mt-1">Accounts are created with real Firebase Authentication logins.</p>
        <div className="mt-5">
          <Notice error={error} success={success} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="student-name">
            <input id="student-name" className="field" value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
          </Field>
          <Field label="Username" htmlFor="student-username">
            <input id="student-username" className="field" value={form.username} onChange={(event) => updateForm('username', event.target.value)} />
          </Field>
          <Field label="Email" htmlFor="student-email">
            <input id="student-email" className="field" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
          </Field>
          <Field label="Password" htmlFor="student-password">
            <input id="student-password" className="field" value={form.password} onChange={(event) => updateForm('password', event.target.value)} />
          </Field>
          <Field label="Institute" htmlFor="student-institute">
            <input id="student-institute" className="field" value={form.institute} onChange={(event) => updateForm('institute', event.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <><Spinner /> Creating…</> : 'Add student'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={clearForm}>Clear</button>
        </div>
      </form>

      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Students</h2>
            <p className="muted">{rows.length} loaded · search and filter this page only</p>
          </div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <input className="field sm:w-64" placeholder="Search loaded students" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="field sm:w-40" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Username</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Tests</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const disabled = Boolean(student.disabled || student.archived);
                return (
                  <tr key={student.id} className="border-t border-white/10">
                    <td className="px-5 py-3 font-semibold text-white">{student.name || '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{student.username || '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{student.email || '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{Number(student.totalScore || 0).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-slate-300">{Number(student.testsTaken || 0)}</td>
                    <td className="px-5 py-3"><span className="badge">{disabled ? 'Disabled' : 'Active'}</span></td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-ghost px-3 py-1.5 text-xs" type="button" onClick={() => handleReset(student)}>Send reset link</button>
                        <button className="btn btn-danger px-3 py-1.5 text-xs" type="button" onClick={() => handleDisable(student)} disabled={disabled}>Disable</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr><td className="px-5 py-8 text-center text-slate-400" colSpan={7}>{loading ? 'Loading…' : 'No students on this page.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="flex justify-center border-t border-white/10 p-4">
            <button className="btn btn-ghost" type="button" onClick={() => load(cursor)} disabled={loading}>
              {loading ? <><Spinner /> Loading…</> : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function DailyChallengesTab() {
  const [form, setForm] = useState({ date: todayKey(), topic: '', question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await listDailyChallenges());
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load daily challenges.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function updateOption(index, value) {
    setForm((previous) => ({ ...previous, options: previous.options.map((option, position) => (position === index ? value : option)) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.date || !form.question.trim() || form.options.some((option) => !option.trim())) {
      setError('Date, question and all four options are required.');
      return;
    }
    setBusy(true);
    try {
      await saveDailyChallenge({
        date: form.date,
        topic: form.topic.trim(),
        question: form.question.trim(),
        options: form.options.map((option) => option.trim()),
        correctIndex: Number(form.correctIndex),
        explanation: form.explanation.trim(),
      });
      setSuccess(`Daily challenge saved for ${form.date}.`);
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save the daily challenge.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={handleSubmit}>
        <h2 className="text-lg font-semibold text-white">Challenge details</h2>
        <p className="muted mt-1">Saved by date; students see the challenge for today.</p>
        <div className="mt-5"><Notice error={error} success={success} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="challenge-date">
            <input id="challenge-date" className="field" type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} />
          </Field>
          <Field label="Topic" htmlFor="challenge-topic">
            <input id="challenge-topic" className="field" value={form.topic} onChange={(event) => updateForm('topic', event.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Question" htmlFor="challenge-question">
              <textarea id="challenge-question" className="field" rows="2" value={form.question} onChange={(event) => updateForm('question', event.target.value)} />
            </Field>
          </div>
          {form.options.map((option, index) => (
            <Field key={index} label={`Option ${String.fromCharCode(65 + index)}`} htmlFor={`challenge-option-${index}`}>
              <input id={`challenge-option-${index}`} className="field" value={option} onChange={(event) => updateOption(index, event.target.value)} />
            </Field>
          ))}
          <Field label="Correct option" htmlFor="challenge-correct">
            <select id="challenge-correct" className="field" value={form.correctIndex} onChange={(event) => updateForm('correctIndex', event.target.value)}>
              {form.options.map((option, index) => (
                <option key={index} value={index}>{String.fromCharCode(65 + index)}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Explanation" htmlFor="challenge-explanation">
              <textarea id="challenge-explanation" className="field" rows="2" value={form.explanation} onChange={(event) => updateForm('explanation', event.target.value)} />
            </Field>
          </div>
        </div>
        <div className="mt-5">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <><Spinner /> Saving…</> : 'Save challenge'}
          </button>
        </div>
      </form>

      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold text-white">Recent challenges</h2>
          <p className="muted">{rows.length} saved</p>
        </div>
        <div className="divide-y divide-white/10">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge">{row.id}</span>
                  {row.topic && <span className="badge">{row.topic}</span>}
                </div>
                <p className="mt-2 text-sm text-slate-200">{row.question}</p>
                <p className="muted mt-1">Correct answer: {String.fromCharCode(65 + Number(row.correctIndex || 0))} · {row.options?.[Number(row.correctIndex || 0)] || '—'}</p>
              </div>
            </div>
          ))}
          {!rows.length && <p className="p-8 text-center text-sm text-slate-400">{loading ? 'Loading…' : 'No daily challenges yet.'}</p>}
        </div>
      </div>
    </>
  );
}

function ResourcesTab() {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', link: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load(nextCursor = null) {
    setLoading(true);
    setError('');
    try {
      const page = await listResources({ pageSize: PAGE_SIZE, cursor: nextCursor });
      setRows((previous) => (nextCursor ? [...previous, ...page.rows] : page.rows));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load resources.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function clearForm() {
    setEditingId(null);
    setForm({ title: '', link: '' });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.title.trim() || !form.link.trim()) {
      setError('Title and link are required.');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updateResource(editingId, { title: form.title.trim(), link: form.link.trim() });
        setSuccess('Resource updated.');
      } else {
        await createResource({ title: form.title.trim(), link: form.link.trim() });
        setSuccess('Resource added.');
      }
      clearForm();
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save the resource.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(resource) {
    if (!window.confirm(`Delete “${resource.title}”?`)) return;
    setError('');
    setSuccess('');
    try {
      await deleteResource(resource.id);
      setSuccess('Resource deleted.');
      if (editingId === resource.id) clearForm();
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not delete the resource.'));
    }
  }

  return (
    <>
      <form className="card" onSubmit={handleSubmit}>
        <h2 className="text-lg font-semibold text-white">{editingId ? 'Edit resource' : 'Add resource'}</h2>
        <div className="mt-5"><Notice error={error} success={success} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="resource-title">
            <input id="resource-title" className="field" value={form.title} onChange={(event) => updateForm('title', event.target.value)} />
          </Field>
          <Field label="File link" htmlFor="resource-link">
            <input id="resource-link" className="field" value={form.link} onChange={(event) => updateForm('link', event.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <><Spinner /> Saving…</> : editingId ? 'Update resource' : 'Add resource'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={clearForm}>Clear</button>
        </div>
      </form>

      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold text-white">Resources</h2>
          <p className="muted">{rows.length} loaded</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Link</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((resource) => (
                <tr key={resource.id} className="border-t border-white/10">
                  <td className="px-5 py-3 font-semibold text-white">{resource.title}</td>
                  <td className="max-w-md truncate px-5 py-3 text-slate-300">{resource.link}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-ghost px-3 py-1.5 text-xs" type="button" onClick={() => { setEditingId(resource.id); setForm({ title: resource.title || '', link: resource.link || '' }); }}>Edit</button>
                      <button className="btn btn-danger px-3 py-1.5 text-xs" type="button" onClick={() => handleDelete(resource)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td className="px-5 py-8 text-center text-slate-400" colSpan={3}>{loading ? 'Loading…' : 'No resources yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="flex justify-center border-t border-white/10 p-4">
            <button className="btn btn-ghost" type="button" onClick={() => load(cursor)} disabled={loading}>
              {loading ? <><Spinner /> Loading…</> : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function AnnouncementsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await listAnnouncements());
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load announcements.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.title.trim() || !form.message.trim()) {
      setError('Title and message are required.');
      return;
    }
    setBusy(true);
    try {
      await createAnnouncement({ title: form.title.trim(), message: form.message.trim() });
      setSuccess('Announcement posted.');
      setForm({ title: '', message: '' });
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not post the announcement.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(announcement) {
    if (!window.confirm(`Delete “${announcement.title}”?`)) return;
    setError('');
    setSuccess('');
    try {
      await deleteAnnouncement(announcement.id);
      setSuccess('Announcement deleted.');
      await load();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not delete the announcement.'));
    }
  }

  return (
    <>
      <form className="card" onSubmit={handleSubmit}>
        <h2 className="text-lg font-semibold text-white">New announcement</h2>
        <div className="mt-5"><Notice error={error} success={success} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="announcement-title">
            <input id="announcement-title" className="field" value={form.title} onChange={(event) => updateForm('title', event.target.value)} />
          </Field>
          <Field label="Message" htmlFor="announcement-message">
            <input id="announcement-message" className="field" value={form.message} onChange={(event) => updateForm('message', event.target.value)} />
          </Field>
        </div>
        <div className="mt-5">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <><Spinner /> Posting…</> : 'Post announcement'}
          </button>
        </div>
      </form>

      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold text-white">Announcements</h2>
          <p className="muted">{rows.length} posted</p>
        </div>
        <div className="divide-y divide-white/10">
          {rows.map((announcement) => (
            <div key={announcement.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="font-semibold text-white">{announcement.title}</p>
                <p className="muted mt-1">{announcement.message}</p>
              </div>
              <button className="btn btn-danger px-3 py-1.5 text-xs" type="button" onClick={() => handleDelete(announcement)}>Delete</button>
            </div>
          ))}
          {!rows.length && <p className="p-8 text-center text-sm text-slate-400">{loading ? 'Loading…' : 'No announcements yet.'}</p>}
        </div>
      </div>
    </>
  );
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState(TABS[0]);

  if (!isAdmin) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <h1 className="page-title">Access denied</h1>
        <p className="muted mt-2">You need admin access to open this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl animate-rise space-y-6">
      <div>
        <h1 className="page-title">Admin</h1>
        <p className="muted mt-1">Manage students, daily challenges, resources and announcements.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((name) => (
          <button key={name} type="button" className={`btn ${tab === name ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      {tab === 'Students' && <StudentsTab />}
      {tab === 'Daily Challenges' && <DailyChallengesTab />}
      {tab === 'Resources' && <ResourcesTab />}
      {tab === 'Announcements' && <AnnouncementsTab />}
    </div>
  );
}
