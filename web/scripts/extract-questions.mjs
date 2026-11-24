import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..', '..');
const sourceFile = path.join(root, 'public', 'index.html');
const webDir = path.join(root, 'web');
const questionDir = path.join(webDir, 'public', 'questions');
const catalogFile = path.join(webDir, 'src', 'data', 'catalog.generated.json');
const assetDir = path.join(webDir, 'public', 'assets');

const html = fs.readFileSync(sourceFile, 'utf8');

function extractImage(mime, name) {
  const match = html.match(new RegExp(`data:image/${mime};base64,([A-Za-z0-9+/=]+)`));
  if (!match) throw new Error(`Missing ${mime} image in source`);
  fs.mkdirSync(assetDir, { recursive: true });
  const file = path.join(assetDir, name);
  fs.writeFileSync(file, Buffer.from(match[1], 'base64'));
  return { file: `assets/${name}`, bytes: fs.statSync(file).size };
}

const assets = {
  brand: extractImage('png', 'brand.png'),
  hero: extractImage('webp', 'hero.webp'),
};

function sliceDeclaration(name, close) {
  const marker = `const ${name} = ${close === '};' ? '{' : '['}`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Missing declaration for ${name}`);
  const end = html.indexOf(`\n${close}`, start);
  if (end < 0) throw new Error(`Missing terminator for ${name}`);
  return html.slice(start, end + close.length + 1);
}

const declarations = [
  sliceDeclaration('SAMPLE_QUESTIONS', '];'),
  sliceDeclaration('SAMPLE_MOCK_QUESTIONS', '];'),
  sliceDeclaration('SAMPLE_GRAND_QUESTIONS', '];'),
  sliceDeclaration('MOCK_TEST_SETTINGS', '};'),
  sliceDeclaration('GRAND_TEST_SETTINGS', '};'),
  sliceDeclaration('SUBJECT_SECTIONS', '};'),
  sliceDeclaration('PLACEHOLDER_CHAPTERS', '};'),
  sliceDeclaration('CHAPTER_ORDER', '};'),
  sliceDeclaration('CHAPTER_WEIGHTAGE', '};'),
].join('\n');

const names = [
  'SAMPLE_QUESTIONS',
  'SAMPLE_MOCK_QUESTIONS',
  'SAMPLE_GRAND_QUESTIONS',
  'MOCK_TEST_SETTINGS',
  'GRAND_TEST_SETTINGS',
  'SUBJECT_SECTIONS',
  'PLACEHOLDER_CHAPTERS',
  'CHAPTER_ORDER',
  'CHAPTER_WEIGHTAGE',
];

const data = vm.runInNewContext(
  `${declarations}\n;({ ${names.join(', ')} })`,
  { console },
  { timeout: 120000, filename: 'index.html-question-banks' },
);

function normalizeSubject(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.startsWith('math')) return 'Mathematics';
  if (text.startsWith('phys')) return 'Physics';
  if (text.startsWith('chem')) return 'Chemistry';
  return 'Other';
}

function sectionFor(subject, chapter) {
  for (const section of data.SUBJECT_SECTIONS[subject] || []) {
    if ((data.CHAPTER_ORDER[subject]?.[section] || []).includes(chapter)) return section;
  }
  for (const section of Object.keys(data.PLACEHOLDER_CHAPTERS[subject] || {})) {
    if (data.PLACEHOLDER_CHAPTERS[subject][section].includes(chapter)) return section;
  }
  return 'Other';
}

function writeJson(file, value) {
  const body = JSON.stringify(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return { bytes: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body).digest('hex') };
}

const practiceGroups = new Map();
for (const question of data.SAMPLE_QUESTIONS) {
  const subject = normalizeSubject(question.subject);
  const chapter = question.chapter || 'General';
  const key = `${subject}::${chapter}`;
  if (!practiceGroups.has(key)) {
    practiceGroups.set(key, {
      key,
      subject,
      section: sectionFor(subject, chapter),
      chapter,
      questions: [],
    });
  }
  practiceGroups.get(key).questions.push(question);
}

const practice = [...practiceGroups.values()]
  .sort((a, b) => a.subject.localeCompare(b.subject) || a.chapter.localeCompare(b.chapter))
  .map((group, index) => {
    const file = `questions/practice/practice-${String(index).padStart(3, '0')}.json`;
    const difficulties = { Easy: 0, Medium: 0, Hard: 0 };
    group.questions.forEach((q) => {
      if (difficulties[q.difficulty] !== undefined) difficulties[q.difficulty] += 1;
    });
    const meta = writeJson(path.join(questionDir, 'practice', path.basename(file)), group.questions);
    return {
      key: group.key,
      subject: group.subject,
      section: group.section,
      chapter: group.chapter,
      count: group.questions.length,
      difficulties,
      file,
      sha256: meta.sha256,
      bytes: meta.bytes,
    };
  });

function buildTestList(questions, settings, isGrand) {
  const grouped = new Map();
  for (const question of questions) {
    if (!question.test) continue;
    if (!grouped.has(question.test)) grouped.set(question.test, []);
    grouped.get(question.test).push(question);
  }
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([title, rows], index) => {
    const override = settings[title] || {};
    const subjects = [...new Set(rows.map((q) => normalizeSubject(q.subject)).filter((s) => s !== 'Other'))];
    const file = `questions/${isGrand ? 'grand' : 'mock'}/${isGrand ? 'grand' : 'mock'}-${String(index + 1).padStart(3, '0')}.json`;
    const meta = writeJson(path.join(questionDir, isGrand ? 'grand' : 'mock', path.basename(file)), rows);
    return {
      title,
      type: override.type || 'Full-Length',
      subjectScope: subjects.length === 1 ? subjects[0] : 'Mixed',
      subjects,
      totalQuestions: isGrand ? override.totalQuestions || 160 : rows.length,
      durationMinutes: override.durationMinutes || (isGrand ? 180 : Math.max(10, Math.round(rows.length * 1.125))),
      isGrand: Boolean(isGrand),
      count: rows.length,
      file,
      sha256: meta.sha256,
      bytes: meta.bytes,
    };
  });
}

const mock = buildTestList(data.SAMPLE_MOCK_QUESTIONS, data.MOCK_TEST_SETTINGS, false);
const grand = buildTestList(data.SAMPLE_GRAND_QUESTIONS, data.GRAND_TEST_SETTINGS, true);

const catalog = {
  version: 1,
  source: 'index.html inline question banks',
  subjects: data.SUBJECT_SECTIONS,
  chapterOrder: data.CHAPTER_ORDER,
  placeholderChapters: data.PLACEHOLDER_CHAPTERS,
  chapterWeightage: data.CHAPTER_WEIGHTAGE,
  practice,
  tests: [...mock, ...grand],
  counts: {
    practice: data.SAMPLE_QUESTIONS.length,
    mock: data.SAMPLE_MOCK_QUESTIONS.length,
    grand: data.SAMPLE_GRAND_QUESTIONS.length,
  },
};
writeJson(catalogFile, catalog);

const practiceBytes = practice.reduce((sum, row) => sum + row.bytes, 0);
const mockBytes = mock.reduce((sum, row) => sum + row.bytes, 0);
const grandBytes = grand.reduce((sum, row) => sum + row.bytes, 0);

console.log(JSON.stringify({
  practiceChapters: practice.length,
  practiceQuestions: catalog.counts.practice,
  mockTests: mock.length,
  mockQuestions: catalog.counts.mock,
  grandTests: grand.length,
  grandQuestions: catalog.counts.grand,
  bytes: { practice: practiceBytes, mock: mockBytes, grand: grandBytes, total: practiceBytes + mockBytes + grandBytes },
  assets,
  catalog: path.relative(root, catalogFile).replaceAll('\\', '/'),
}, null, 2));
