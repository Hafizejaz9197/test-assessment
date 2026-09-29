/**
 * Tiny JSON-file storage for tests and results (no database).
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// IDs are used in file names, so only allow a safe character set.
const ID_RE = /^[a-z0-9-]{6,64}$/;

function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/** New test id, e.g. "20260929-1432-a1b2c3". Sortable by creation time. */
function newTestId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Write JSON atomically (temp file + rename) so a crash never leaves half a file. */
async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

async function saveTest(test) {
  if (!isValidId(test.id)) throw new Error('Invalid test id');
  await writeJson(path.join(config.dirs.tests, `${test.id}.json`), test);
  return test;
}

/** Returns the test object, or null if it does not exist. */
async function getTest(id) {
  if (!isValidId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(config.dirs.tests, `${id}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Short summaries of all saved tests, newest first. */
async function listTests() {
  const files = (await fs.readdir(config.dirs.tests)).filter((f) => f.endsWith('.json'));
  const tests = [];
  for (const f of files) {
    try {
      const t = JSON.parse(await fs.readFile(path.join(config.dirs.tests, f), 'utf8'));
      tests.push({
        id: t.id,
        title: t.title,
        total_marks: t.total_marks,
        questionCount: (t.questions || []).length,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        sourceName: t.source && t.source.originalName,
      });
    } catch {
      /* skip unreadable files */
    }
  }
  return tests.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { isValidId, newTestId, saveTest, getTest, listTests, writeJson };
