/**
 * All Google Gemini calls live here (official @google/genai SDK).
 * The API key is read from .env on the server and never leaves it.
 */
const fs = require('fs/promises');
const { GoogleGenAI, Type, createPartFromUri } = require('@google/genai');
const config = require('../config');

// PDFs up to this size are sent inline; larger ones go through the Files API.
const INLINE_PDF_MAX_BYTES = 10 * 1024 * 1024;
const GENERATE_TIMEOUT_MS = 4 * 60 * 1000; // generating a whole test can be slow
const RETRY_DELAY_MS = 3000;

let client = null;
function getClient() {
  if (!config.geminiApiKey) {
    throw new GeminiError('GEMINI_API_KEY is not set in the server .env file.', 500);
  }
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

/** Error with a teacher-friendly message and HTTP status for the API response. */
class GeminiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Turn SDK / network errors into a clear message. */
function friendlyError(err) {
  if (err instanceof GeminiError) return err;
  const status = err && err.status;
  const name = err && err.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new GeminiError('The AI took too long to respond. Please try again.', 504);
  }
  if (status === 400 && /api key/i.test(err.message)) {
    return new GeminiError('The Gemini API key is not valid. Check GEMINI_API_KEY in .env.', 500);
  }
  if (status === 401 || status === 403) {
    return new GeminiError('The Gemini API key was rejected. Check GEMINI_API_KEY in .env.', 500);
  }
  if (status === 404) {
    return new GeminiError('The Gemini model was not found or is no longer available. Check GEMINI_MODEL in .env.', 500);
  }
  if (status === 429) {
    return new GeminiError('Gemini usage limit reached. Please wait a minute and try again.', 429);
  }
  if (status === 503 || status === 500) {
    return new GeminiError('Gemini is busy right now. Please try again in a moment.', 503);
  }
  if (status === 400) {
    return new GeminiError(`Gemini could not process the request: ${shorten(err.message)}`, 502);
  }
  return new GeminiError(`AI service error: ${shorten(err && err.message)}`, 502);
}

function shorten(msg) {
  const s = String(msg || 'unknown error');
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

/** Errors that will fail again no matter what – don't waste a retry on them. */
function isPermanent(err) {
  return [400, 401, 403, 404].includes(err && err.status) || (err instanceof GeminiError && err.status === 500);
}

/** Overloaded / rate-limited: worth trying a different model. */
function isBusy(err) {
  return [429, 500, 503].includes(err && err.status);
}

/**
 * Run fn(model). If it fails with a temporary error, wait and try exactly once
 * more – on the fallback model if the main one is busy.
 * Resolves to { result, model } so callers can record which model answered.
 */
async function withRetry(fn, label) {
  const main = config.geminiModel;
  try {
    return { result: await fn(main), model: main };
  } catch (err) {
    if (isPermanent(err)) throw friendlyError(err);
    const next = isBusy(err) && config.geminiFallbackModel && config.geminiFallbackModel !== main
      ? config.geminiFallbackModel
      : main;
    console.warn(`[gemini] ${label} on ${main} failed (${err.status || err.name}), retrying once on ${next}…`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      return { result: await fn(next), model: next };
    } catch (err2) {
      console.error(`[gemini] ${label} on ${next} failed again: ${err2.status || err2.name} ${shorten(err2.message)}`);
      throw friendlyError(err2);
    }
  }
}

/** Parse the model's JSON text output. */
function parseJson(response) {
  const text = response && response.text;
  if (!text) {
    const reason = response && response.candidates && response.candidates[0] && response.candidates[0].finishReason;
    throw new GeminiError(`The AI returned an empty answer${reason ? ` (${reason})` : ''}. Please try again.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError('The AI returned an answer in an unexpected format. Please try again.');
  }
}

/**
 * Build the Part for a file: inline base64 for small files, Files API for large ones.
 */
async function filePart(filePath, mimeType, sizeBytes) {
  if (sizeBytes <= INLINE_PDF_MAX_BYTES) {
    const data = await fs.readFile(filePath);
    return { inlineData: { mimeType, data: data.toString('base64') } };
  }
  const ai = getClient();
  let file = await ai.files.upload({ file: filePath, config: { mimeType } });
  // Large files are processed asynchronously; wait until ready (max ~2 min).
  for (let i = 0; file.state === 'PROCESSING' && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: file.name });
  }
  if (file.state === 'FAILED') throw new GeminiError('Gemini could not read this PDF. Try a different file.');
  if (file.state === 'PROCESSING') throw new GeminiError('Gemini is still processing the PDF. Please try again shortly.', 504);
  return createPartFromUri(file.uri, file.mimeType);
}

// ---------------------------------------------------------------------------
// Test generation
// ---------------------------------------------------------------------------

/** Structured-output schema for a generated test. */
const TEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    total_marks: { type: Type.NUMBER },
    time: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'A1..An for MCQs, B1..Bn for short, C1..Cn for long' },
          type: { type: Type.STRING, enum: ['mcq', 'short', 'long'] },
          question: { type: Type.STRING },
          options: {
            type: Type.OBJECT,
            description: 'Only for MCQs: four options a-d',
            properties: {
              a: { type: Type.STRING },
              b: { type: Type.STRING },
              c: { type: Type.STRING },
              d: { type: Type.STRING },
            },
            required: ['a', 'b', 'c', 'd'],
            propertyOrdering: ['a', 'b', 'c', 'd'],
          },
          marks: { type: Type.NUMBER },
          answer_key: { type: Type.STRING, description: 'MCQ: the correct letter (a-d). Short/long: key points that earn marks.' },
          model_answer: { type: Type.STRING },
        },
        required: ['id', 'type', 'question', 'marks', 'answer_key', 'model_answer'],
        propertyOrdering: ['id', 'type', 'question', 'options', 'marks', 'answer_key', 'model_answer'],
      },
    },
  },
  required: ['title', 'total_marks', 'time', 'questions'],
  propertyOrdering: ['title', 'total_marks', 'time', 'questions'],
};

const MARKS = { mcq: 1, short: 2, long: 6 };

function buildTestPrompt(p) {
  return `You are an experienced school teacher and paper setter in Pakistan.
The attached PDF is a textbook chapter. Create a test titled "${p.title}".

STRICT RULES
- Use ONLY the content of the attached chapter. Do not add facts, topics or examples that are not in it.
- Match the class level shown in the title and the chapter (vocabulary, difficulty, length).
- Write questions in the same language as the chapter (English or Urdu).
- Cover different parts of the chapter; do not repeat the same idea.

QUESTIONS (exact counts)
- ${p.mcqCount} MCQs, ids A1..A${p.mcqCount}, type "mcq", ${MARKS.mcq} mark each.
  Each has exactly four options a, b, c, d with one clearly correct answer.
  answer_key = the correct letter only (a, b, c or d). model_answer = the correct option text.
- ${p.shortCount} short questions, ids B1..B${p.shortCount}, type "short", ${MARKS.short} marks each.
  answer_key = the key points needed for full marks. model_answer = a complete 2-4 sentence answer.
- ${p.longCount} long questions, ids C1..C${p.longCount}, type "long", ${MARKS.long} marks each.
  answer_key = the marking points (about one point per mark). model_answer = a full answer a good student would write (about 150-250 words).
  Omit "options" for short and long questions.

Also set: title = "${p.title}", time = "${p.timeMinutes} minutes", total_marks = sum of all marks.`;
}

/**
 * Generate a test from a chapter PDF.
 * @param {{path:string,size:number}} pdf  stored PDF
 * @param {{title,mcqCount,shortCount,longCount,timeMinutes}} params
 * @returns {{result: object, model: string}} raw test from the model (normalise before saving)
 */
async function generateTest(pdf, params) {
  const ai = getClient();
  // Prepare the PDF once; both attempts reuse it.
  const part = await withRetry(() => filePart(pdf.path, 'application/pdf', pdf.size), 'uploadPdf');
  return withRetry(async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [part.result, { text: buildTestPrompt(params) }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: TEST_SCHEMA,
        abortSignal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      },
    });
    return parseJson(response);
  }, 'generateTest');
}

module.exports = { generateTest, GeminiError, withRetry, parseJson, filePart, getClient, MARKS };
