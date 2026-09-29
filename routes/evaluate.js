/**
 * /api/evaluate – answer-sheet upload (evaluation arrives in Milestone 4).
 */
const express = require('express');
const fs = require('fs');
const { sheetUpload, UserError } = require('../services/upload');

const router = express.Router();

// POST /api/evaluate/upload-check  (multipart: any files)
// Milestone 1: confirms answer-sheet files pass type/size validation.
router.post('/upload-check', sheetUpload, (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new UserError('Please choose at least one answer-sheet file.');
  }
  const files = req.files.map((f) => ({
    field: f.fieldname,
    originalName: f.originalname,
    sizeKB: Math.round(f.size / 1024),
  }));
  // This is only an upload check, so don't keep the files.
  for (const f of req.files) fs.rm(f.path, { force: true }, () => {});
  res.json({
    ok: true,
    message: `${req.files.length} file(s) uploaded successfully. Evaluation will be added in Milestone 4.`,
    files,
  });
});

module.exports = router;
