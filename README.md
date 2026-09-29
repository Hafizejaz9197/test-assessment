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
| `GEMINI_FALLBACK_MODEL` | Model used for the one retry if the main model is busy (`none` = off) | `gemini-3.6-flash` |
| `PORT`           | Port for the web server                         | `3000`             |

The API key stays on the server; it is never sent to the browser.

## Project layout

```
server.js            Express app entry point
config.js            Paths, limits, env settings
routes/tests.js      /api/tests    – upload chapter PDF, generate & manage tests
routes/evaluate.js   /api/evaluate – upload answer sheets, evaluate
services/upload.js   Multer upload rules (file type / size) + friendly errors
services/gemini.js   Gemini API calls: retry once (fallback model if busy), timeouts, friendly errors
services/testFormat.js  Cleans the AI's test: IDs A1/B1/C1, marks per type, recomputed total
services/storage.js  JSON file storage for tests
public/              Frontend: index.html, evaluate.html, css/, js/
data/
  uploads/           Chapter PDFs
  tests/             Generated tests (<testId>.json)
  sheets/            Uploaded answer-sheet files
  results/           Evaluation results (<testId>-<timestamp>.json)
```

## How test generation works

- PDFs up to 10 MB are sent to Gemini inline; bigger PDFs (up to 25 MB) go through the Gemini Files API.
- Gemini returns structured JSON (`responseSchema`). The server then fixes IDs, sets marks
  (MCQ 1, short 2, long 6) and recomputes the total itself.
- If Gemini fails (busy, timeout, bad output) the call is retried once automatically.
- Tests are saved to `data/tests/<testId>.json`; the chapter PDF stays in `data/uploads/`.

## Editing and printing a test

- Click any question, option, answer or mark on screen to edit it. Totals update as you type;
  press **Save changes** (or **Discard**). Marks accept steps of 0.5.
- **Print Question Paper** – A4 paper for students: name / roll no / class / date lines, time,
  total marks, sections with marks per question. No answers.
- **Print Answer Key** – the same test with MCQ answers table, key points and model answers.
- To share digitally (e.g. WhatsApp), choose **Save as PDF** as the printer in the print dialog.

## Limits

- Chapter PDF: 25 MB
- Answer sheets: JPG / PNG / PDF, 10 MB per file, up to 5 students per evaluation
