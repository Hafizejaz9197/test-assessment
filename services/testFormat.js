/**
 * Clean up a test returned by the model so the rest of the app can trust it:
 * fixed IDs (A1.., B1.., C1..), marks per type, MCQ options a-d, total recomputed.
 */
const { MARKS } = require('./gemini');

const PREFIX = { mcq: 'A', short: 'B', long: 'C' };
const TYPES = ['mcq', 'short', 'long'];

function str(v) {
  return v == null ? '' : String(v).trim();
}

/** Sum of question marks, rounded to 0.5. */
function totalMarks(questions) {
  return Math.round(questions.reduce((s, q) => s + (Number(q.marks) || 0), 0) * 2) / 2;
}

/**
 * @param raw    model output ({ title, total_marks, time, questions })
 * @param params form settings ({ title, timeMinutes, ... })
 * @returns { title, total_marks, time, questions } – clean
 */
function normalizeTest(raw, params) {
  const list = Array.isArray(raw && raw.questions) ? raw.questions : [];
  const questions = [];

  for (const type of TYPES) {
    list
      .filter((q) => q && str(q.type).toLowerCase() === type && str(q.question))
      .forEach((q, i) => {
        const clean = {
          id: `${PREFIX[type]}${i + 1}`,
          type,
          question: str(q.question),
          marks: MARKS[type],
          answer_key: str(q.answer_key),
          model_answer: str(q.model_answer),
        };
        if (type === 'mcq') {
          const o = q.options || {};
          clean.options = { a: str(o.a), b: str(o.b), c: str(o.c), d: str(o.d) };
          // Keep only the letter, e.g. "(b) Oxygen" -> "b".
          const m = clean.answer_key.toLowerCase().match(/^\(?([a-d])\b/);
          if (m) clean.answer_key = m[1];
        }
        questions.push(clean);
      });
  }

  if (questions.length === 0) {
    const err = new Error('The AI did not return any questions. Please try again.');
    err.status = 502;
    throw err;
  }

  return {
    title: params.title,
    total_marks: totalMarks(questions),
    time: `${params.timeMinutes} minutes`,
    questions,
  };
}

/** Human-readable note if the model returned a different number of questions than asked. */
function countWarning(questions, params) {
  const got = (t) => questions.filter((q) => q.type === t).length;
  const wanted = { mcq: params.mcqCount, short: params.shortCount, long: params.longCount };
  const off = TYPES.filter((t) => got(t) !== wanted[t]).map((t) => `${got(t)} of ${wanted[t]} ${t === 'mcq' ? 'MCQs' : `${t} questions`}`);
  return off.length ? `The AI returned ${off.join(', ')}. You can regenerate to try again.` : null;
}

module.exports = { normalizeTest, countWarning, totalMarks };
