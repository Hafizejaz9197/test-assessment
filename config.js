/**
 * Central configuration: paths, limits and env settings.
 * Loaded once by server.js; every other module imports from here.
 */
const path = require('path');
const fs = require('fs');

// Always load .env from the project folder, even if the server is
// started from a different working directory.
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE, quiet: true });

const DATA_DIR = path.join(__dirname, 'data');

const config = {
  envFile: ENV_FILE,
  envFileExists: fs.existsSync(ENV_FILE),
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
