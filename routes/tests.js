/**
 * /api/tests – upload a chapter PDF and (from Milestone 2) generate tests.
 */
const express = require('express');
const fs = require('fs');
const { chapterPdfUpload, UserError } = require('../services/upload');

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
  return {
    title: title.slice(0, 200),
    mcqCount: intField(body.mcqCount, 5, 0, 50),
    shortCount: intField(body.shortCount, 5, 0, 30),
    longCount: intField(body.longCount, 1, 0, 10),
    timeMinutes: intField(body.timeMinutes, 45, 5, 300),
  };
}

// POST /api/tests/generate  (multipart: pdf + form fields)
// Milestone 1: validates and stores the upload, then echoes it back.
router.post('/generate', chapterPdfUpload, (req, res) => {
  if (!req.file) throw new UserError('Please choose a chapter PDF to upload.');
  let params;
  try {
    params = readTestParams(req.body);
  } catch (err) {
    fs.rm(req.file.path, { force: true }, () => {}); // don't keep orphan uploads
    throw err;
  }
  if (params.mcqCount + params.shortCount + params.longCount === 0) {
    throw new UserError('Please ask for at least one question.');
  }

  res.json({
    ok: true,
    message: 'PDF uploaded successfully. Test generation will be added in Milestone 2.',
    upload: {
      storedAs: req.file.filename,
      originalName: req.file.originalname,
      sizeKB: Math.round(req.file.size / 1024),
    },
    params,
  });
});

module.exports = router;
