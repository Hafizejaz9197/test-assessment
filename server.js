/**
 * PaperCheck – Express server entry point.
 * Serves the static frontend from public/ and the JSON API under /api.
 */
const express = require('express');
const path = require('path');
const config = require('./config');
const testsRouter = require('./routes/tests');
const evaluateRouter = require('./routes/evaluate');
const { uploadErrorHandler } = require('./services/upload');
const { requirePassword } = require('./services/auth');

const app = express();

app.use(requirePassword); // no-op unless APP_PASSWORD is set
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check – tells the UI whether the Gemini key is configured
// (never exposes the key itself).
app.get('/api/health', (req, res) => {
  res.json({ ok: true, model: config.geminiModel, apiKeyConfigured: Boolean(config.geminiApiKey) });
});

app.use('/api/tests', testsRouter);
app.use('/api/evaluate', evaluateRouter);

// Unknown API routes → JSON 404 (instead of HTML).
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Error handling: friendly upload errors first, then a generic fallback.
app.use(uploadErrorHandler);
app.use((err, req, res, next) => {
  if (err.status) console.warn(`[${req.method} ${req.path}] ${err.status}: ${err.message}`);
  else console.error(err); // unexpected – print the full stack
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server. Please try again.' });
});

const server = app.listen(config.port, () => {
  console.log(`PaperCheck running at http://localhost:${config.port}`);
  console.log(`Data folder: ${config.dirs.data}`);
  console.log(config.appPassword ? 'Password protection: ON' : 'Password protection: off (set APP_PASSWORD to enable)');
  if (config.geminiApiKey) {
    const from = config.envFileExists ? config.envFile : 'environment variables';
    console.log(`Gemini key loaded from ${from} (model: ${config.geminiModel})`);
  } else if (!config.envFileExists) {
    console.warn(`Warning: GEMINI_API_KEY is not set and there is no .env file at ${config.envFile}`);
    console.warn('Copy .env.example to .env and put your GEMINI_API_KEY in it, then restart.');
  } else {
    console.warn(`Warning: GEMINI_API_KEY is empty in ${config.envFile}`);
  }
});

// Most common startup problem: an older PaperCheck is still running.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use – PaperCheck (or another app) is probably already running.`);
    console.error('Close the other terminal running it (Ctrl+C), or set a different PORT in .env, then run npm start again.');
    process.exit(1);
  }
  throw err;
});
