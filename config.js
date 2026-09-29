/**
 * Central configuration: paths, limits and env settings.
 * Loaded once by server.js; every other module imports from here.
 */
const path = require('path');
const fs = require('fs');

// Always load .env from the project folder, even if the server is
// started from a different working directory.
const ENV_FILE = path.join(__dirname, '.env');
loadEnvFile(ENV_FILE);

/**
 * Load KEY=value pairs from .env into process.env.
 * Unlike plain dotenv this also accepts files saved as UTF-16 or with a
 * BOM (common when the file is created with Notepad or PowerShell on Windows).
 */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const buf = fs.readFileSync(file);
  let text;
  if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le');
  else if (buf[0] === 0xfe && buf[1] === 0xff) text = Buffer.from(buf).swap16().toString('utf16le');
  else text = buf.toString('utf8');
  text = text.replace(/^\uFEFF/, '');
  const parsed = require('dotenv').parse(text);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value.trim();
  }
}

const DATA_DIR = path.join(__dirname, 'data');

const config = {
  envFile: ENV_FILE,
  envFileExists: fs.existsSync(ENV_FILE),
  port: Number(process.env.PORT) || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  // Used for the retry when the main model is overloaded (503/429). "none" disables it.
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL === 'none'
    ? ''
    : process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash',

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
