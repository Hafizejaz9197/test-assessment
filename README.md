# PaperCheck

A lightweight web app for teachers:

1. **Create Test** – upload a textbook chapter PDF and generate a printable test (MCQs, short and long questions) with an answer key.
2. **Evaluate Answer Sheets** – upload photos/scans of handwritten student answer sheets and get AI-suggested marks and feedback.

Built with Node.js + Express, plain HTML/JS/CSS (no build step) and the Google Gemini API.
No database, no login – everything is stored in local folders under `data/`.

## Setup

Requirements: **Node.js 20 LTS or newer**.

```bash
npm install
cp .env.example .env      # then edit .env and paste your Gemini API key
npm start
```

Open <http://localhost:3000>.

### `.env` settings

| Variable         | Meaning                                         | Default            |
|------------------|-------------------------------------------------|--------------------|
| `GEMINI_API_KEY` | Your key from https://aistudio.google.com/apikey | *(required)*       |
| `GEMINI_MODEL`   | Gemini model name                               | `gemini-3.8-flash` |
| `PORT`           | Port for the web server                         | `3000`             |

The API key stays on the server; it is never sent to the browser.

## Project layout

```
server.js            Express app entry point
config.js            Paths, limits, env settings
routes/tests.js      /api/tests    – upload chapter PDF, generate & manage tests
routes/evaluate.js   /api/evaluate – upload answer sheets, evaluate
services/upload.js   Multer upload rules (file type / size) + friendly errors
services/gemini.js   Gemini API calls (added in Milestone 2)
public/              Frontend: index.html, evaluate.html, css/, js/
data/
  uploads/           Chapter PDFs
  tests/             Generated tests (<testId>.json)
  sheets/            Uploaded answer-sheet files
  results/           Evaluation results (<testId>-<timestamp>.json)
```

## Limits

- Chapter PDF: 25 MB
- Answer sheets: JPG / PNG / PDF, 10 MB per file, up to 5 students per evaluation
