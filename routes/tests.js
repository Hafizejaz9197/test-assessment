/**
 * /api/tests – create tests from a chapter PDF, list, open and regenerate them.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { chapterPdfUpload, UserError } = require('../services/upload');
const gemini = require('../services/gemini');
const storage = require('../services/storage');
const { normalizeTest, countWarning } = require('../services/testFormat');

const router = express.Router();

/** Parse an integer form field, falling back to a default and clamping to a range. */
function intField(value, def, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Read and validate the Create Test form fields. */
function readTestParams(body) {
  const title = String(body.title || '').trim();
  if (!title) throw new UserError('Please enter a test title.');
  const params = {
    title: title.slice(0, 200),
    mcqCount: intField(body.mcqCount, 5, 0, 50),
    shortCount: intField(body.shortCount, 5, 0, 30),
    longCount: intField(body.longCount, 1, 0, 10),
    timeMinutes: intField(body.timeMinutes, 45, 5, 300),
  };
  if (params.mcqCount + params.shortCount + params.longCount === 0) {
    throw new UserError('Please ask for at least one question.');
  }
  return params;
}

/** Ask Gemini for a test and turn it into the saved shape. */
async function buildTest(pdfInfo, params) {
  const pdfPath = path.join(config.dirs.uploads, pdfInfo.storedAs);
  if (!fs.existsSync(pdfPath)) {
    throw new UserError('The original chapter PDF is missing from data/uploads. Please create the test again.', 404);
  }
  const { result, model } = await gemini.generateTest({ path: pdfPath, size: pdfInfo.size }, params);
  const test = normalizeTest(result, params);
  return { test, model, warning: countWarning(test.questions, params) };
}

// GET /api/tests – list saved tests (newest first)
router.get('/', async (req, res) => {
  res.json({ tests: await storage.listTests() });
});

// GET /api/tests/:id – one full test
router.get('/:id', async (req, res) => {
  const test = await storage.getTest(req.params.id);
  if (!test) throw new UserError('Test not found.', 404);
  res.json({ test });
});

// POST /api/tests/generate – multipart: pdf + title + counts + time
router.post('/generate', chapterPdfUpload, async (req, res) => {
  if (!req.file) throw new UserError('Please choose a chapter PDF to upload.');
  const removeUpload = () => fs.rm(req.file.path, { force: true }, () => {});

  try {
    const params = readTestParams(req.body);
    const source = { storedAs: req.file.filename, originalName: req.file.originalname, size: req.file.size };
    const { test, model, warning } = await buildTest(source, params);

    const now = new Date().toISOString();
    const saved = await storage.saveTest({
      id: storage.newTestId(),
      ...test,
      params,
      source,
      model,
      createdAt: now,
      updatedAt: now,
    });
    res.json({ test: saved, warning });
  } catch (err) {
    removeUpload(); // don't keep PDFs for tests that were never created
    throw err;
  }
});

// POST /api/tests/:id/regenerate – make a fresh test from the same PDF & settings
router.post('/:id/regenerate', async (req, res) => {
  const existing = await storage.getTest(req.params.id);
  if (!existing) throw new UserError('Test not found.', 404);

  const { test, model, warning } = await buildTest(existing.source, existing.params);
  const saved = await storage.saveTest({
    ...existing,
    ...test,
    model,
    updatedAt: new Date().toISOString(),
  });
  res.json({ test: saved, warning });
});

module.exports = router;
