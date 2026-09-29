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

const app = express();

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
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`PaperCheck running at http://localhost:${config.port}`);
  if (!config.envFileExists) {
    console.warn(`Warning: no .env file found at ${config.envFile}`);
    console.warn('Copy .env.example to .env and put your GEMINI_API_KEY in it, then restart.');
  } else if (!config.geminiApiKey) {
    console.warn(`Warning: GEMINI_API_KEY is empty in ${config.envFile}`);
  } else {
    console.log(`Gemini key loaded from ${config.envFile} (model: ${config.geminiModel})`);
  }
});
