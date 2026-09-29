/**
 * Central configuration: paths, limits and env settings.
 * Loaded once by server.js; every other module imports from here.
 */
require('dotenv').config({ quiet: true });
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');

const config = {
  port: Number(process.env.PORT) || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',

  dirs: {
    data: DATA_DIR,
    tests: path.join(DATA_DIR, 'tests'),     // generated test JSON
    uploads: path.join(DATA_DIR, 'uploads'), // chapter PDFs
    sheets: path.join(DATA_DIR, 'sheets'),   // student answer sheet files
    results: path.join(DATA_DIR, 'results'), // evaluation results JSON
  },

  limits: {
    chapterPdfBytes: 25 * 1024 * 1024, // 25 MB
    sheetFileBytes: 10 * 1024 * 1024,  // 10 MB per answer-sheet file
    maxStudents: 5,
    maxSheetFilesPerStudent: 20,
  },
};

// Make sure all data folders exist on startup.
for (const dir of Object.values(config.dirs)) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = config;
