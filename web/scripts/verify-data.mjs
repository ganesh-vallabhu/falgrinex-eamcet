import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const root = path.resolve(webDir, '..');
const htmlFile = path.join(root, 'public', 'index.html');
const catalogFile = path.join(webDir, 'src', 'data', 'catalog.generated.json');
const questionDir = path.join(webDir, 'public', 'questions');
const expectedTotals = { practice: 7067, mock: 16000, grand: 1600 };
const banks = ['practice', 'mock', 'grand'];
const bankCodes = { practice: 'P', mock: 'M', grand: 'G' };

function sliceDeclaration(html, name) {
  const marker = `const ${name} = [`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Missing declaration for ${name}`);
  const end = html.indexOf('\n];', start);
  if (end < 0) throw new Error(`Missing terminator for ${name}`);
  return html.slice(start, end + 3);
}

function questionId(bank, question) {
  const scope = bank === 'P' ? `${question.chapter || ''} · ${question.difficulty || ''}` : question.test || '';
  return [bank, scope, question.subject || '', question.chapter || '', question.difficulty || '', question.topic || '', question.question || '']
    .map((value) => String(value).trim().toLowerCase())
    .join('|');
}

function listJsonFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJsonFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(target);
  }
  return files;
}

function reportResult(report) {
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function main() {
  const issues = [];
  const report = {
    ok: false,
    files: {
      html: path.relative(root, htmlFile).replaceAll('\\', '/'),
      catalog: path.relative(root, catalogFile).replaceAll('\\', '/'),
      questions: path.relative(root, questionDir).replaceAll('\\', '/'),
    },
    source: {},
    catalog: {},
    chunks: {},
    totals: { expected: expectedTotals, actual: {} },
    duplicates: [],
    issues,
  };

  const names = ['SAMPLE_QUESTIONS', 'SAMPLE_MOCK_QUESTIONS', 'SAMPLE_GRAND_QUESTIONS'];
  const html = fs.readFileSync(htmlFile, 'utf8');
  const declarations = names.map((name) => sliceDeclaration(html, name)).join('\n');
  const source = vm.runInNewContext(
    `${declarations}\n;({ SAMPLE_QUESTIONS, SAMPLE_MOCK_QUESTIONS, SAMPLE_GRAND_QUESTIONS })`,
    { console },
    { timeout: 120000, filename: 'index.html-question-banks' },
  );
  report.source = {
    practice: source.SAMPLE_QUESTIONS.length,
    mock: source.SAMPLE_MOCK_QUESTIONS.length,
    grand: source.SAMPLE_GRAND_QUESTIONS.length,
  };

  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  const entries = {
    practice: catalog.practice || [],
    mock: (catalog.tests || []).filter((entry) => !entry.isGrand),
    grand: (catalog.tests || []).filter((entry) => entry.isGrand),
  };
  report.catalog = {
    practice: catalog.counts?.practice ?? null,
    mock: catalog.counts?.mock ?? null,
    grand: catalog.counts?.grand ?? null,
    practiceEntries: entries.practice.length,
    mockEntries: entries.mock.length,
    grandEntries: entries.grand.length,
  };

  for (const bank of banks) {
    if (report.source[bank] !== catalog.counts?.[bank]) {
      issues.push(`${bank}: index.html count ${report.source[bank]} does not match catalog count ${catalog.counts?.[bank]}`);
    }
  }

  const parsedFiles = new Map();
  for (const file of listJsonFiles(questionDir)) {
    const relative = path.relative(path.join(webDir, 'public'), file).replaceAll('\\', '/');
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(value)) {
        issues.push(`chunk ${relative}: expected an array of questions`);
      }
      parsedFiles.set(relative, Array.isArray(value) ? value : []);
    } catch (error) {
      issues.push(`chunk ${relative}: could not parse JSON (${error.message})`);
      parsedFiles.set(relative, []);
    }
  }

  for (const bank of banks) {
    const loaded = [];
    for (const entry of entries[bank]) {
      const file = String(entry.file || '').replaceAll('\\', '/');
      const absolute = path.join(webDir, 'public', file);
      if (!parsedFiles.has(file)) {
        issues.push(`${bank}: missing chunk ${file}`);
        continue;
      }
      const questions = parsedFiles.get(file);
      if (questions.length !== Number(entry.count)) {
        issues.push(`${bank}: ${file} catalog count ${entry.count} does not match chunk length ${questions.length}`);
      }
      loaded.push({ file, questions });
    }
    report.chunks[bank] = {
      files: loaded.length,
      questions: loaded.reduce((sum, item) => sum + item.questions.length, 0),
    };
    const seen = new Map();
    for (const { file, questions } of loaded) {
      for (const question of questions) {
        const id = questionId(bankCodes[bank], question);
        if (seen.has(id)) {
          report.duplicates.push({ bank, id, first: seen.get(id), duplicate: file });
        } else {
          seen.set(id, file);
        }
      }
    }
  }

  for (const bank of banks) {
    report.totals.actual[bank] = report.chunks[bank].questions;
    if (report.totals.actual[bank] !== expectedTotals[bank]) {
      issues.push(`${bank}: expected ${expectedTotals[bank]} questions in chunks, found ${report.totals.actual[bank]}`);
    }
  }

  for (const duplicate of report.duplicates) {
    issues.push(`${duplicate.bank}: duplicate question id ${duplicate.id} in ${duplicate.duplicate} (first in ${duplicate.first})`);
  }

  report.ok = issues.length === 0;
  reportResult(report);
}

try {
  main();
} catch (error) {
  reportResult({
    ok: false,
    issues: [`verification failed: ${error.stack || error.message || String(error)}`],
  });
}
