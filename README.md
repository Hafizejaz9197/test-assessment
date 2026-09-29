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
| `APP_PASSWORD`   | If set, the app asks for this password (any username) | *(off)*      |
| `DATA_DIR`       | Folder for tests, PDFs and results              | `./data`           |

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
  With **"With answer space"** ticked (default) it is a question-cum-answer paper: circles to fill
  for MCQs and ruled lines under each question (about 2.5 lines per mark), roll number and page
  number on every page. Untick it to print questions only (answers on separate sheets).
- **Print Answer Key** – the same test with MCQ answers table, key points and model answers.
- To share digitally (e.g. WhatsApp), choose **Save as PDF** as the printer in the print dialog.

## Limits

- Chapter PDF: 25 MB
- Answer sheets: JPG / PNG / PDF, 10 MB per file, up to 5 students per evaluation

## Putting it online (Render.com)

The repo includes `render.yaml`, so Render can set everything up.

1. Sign up at <https://render.com> with your GitHub account.
2. **New → Blueprint**, pick this repository and branch, then **Apply**.
3. When asked, enter:
   - `GEMINI_API_KEY` – your Gemini key
   - `APP_PASSWORD` – a password teachers will type to open the app (**set this**, otherwise
     anyone with the link can use your Gemini quota and see your tests)
4. Wait for the first deploy (2–4 minutes). Your URL looks like `https://papercheck-xxxx.onrender.com`.

`render.yaml` uses the paid **Starter** instance with a 1 GB persistent disk mounted at `/var/data`,
so saved tests and results survive restarts and redeploys. The Free instance type works too
(change `plan: starter` to `plan: free` and delete the `disk:` block) but **free instances
lose all saved tests whenever they restart or redeploy**, and they sleep after ~15 minutes idle
(the first visit then takes about a minute).

Pushing new commits to the chosen branch redeploys automatically.

