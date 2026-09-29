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

/**
 * Apply a teacher's edits to a saved test. Only text fields and marks can
 * change; question ids, types and order stay as they are.
 * @returns updated copy of the test (throws Error with status 400 on bad input)
 */
function applyEdits(test, edits) {
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  const byId = new Map((Array.isArray(edits.questions) ? edits.questions : []).map((q) => [q && q.id, q]));

  const title = str(edits.title) || test.title;
  const time = str(edits.time) || test.time;

  const questions = test.questions.map((q) => {
    const e = byId.get(q.id);
    if (!e) return q;
    const next = { ...q };

    if (e.question !== undefined) {
      next.question = str(e.question);
      if (!next.question) throw bad(`Question ${q.id} cannot be empty.`);
    }
    if (e.marks !== undefined) {
      const m = Number(e.marks);
      if (!Number.isFinite(m) || m < 0 || m > 100 || Math.round(m * 2) !== m * 2) {
        throw bad(`Marks for ${q.id} must be a number from 0 to 100 (steps of 0.5).`);
      }
      next.marks = m;
    }
    if (e.answer_key !== undefined) next.answer_key = str(e.answer_key);
    if (e.model_answer !== undefined) next.model_answer = str(e.model_answer);
    // The answer key is needed later to mark answer sheets, so never allow it to be blank.
    if (q.type !== 'mcq' && (!next.answer_key || !next.model_answer)) {
      throw bad(`The key points and model answer for ${q.id} cannot be empty.`);
    }

    if (q.type === 'mcq') {
      const o = e.options || {};
      next.options = { ...q.options };
      for (const k of ['a', 'b', 'c', 'd']) if (o[k] !== undefined) next.options[k] = str(o[k]);
      next.answer_key = next.answer_key.toLowerCase();
      if (!['a', 'b', 'c', 'd'].includes(next.answer_key)) throw bad(`Correct option for ${q.id} must be a, b, c or d.`);
      next.model_answer = next.options[next.answer_key]; // keep in sync with the chosen option
    }
    return next;
  });

  return { ...test, title, time, questions, total_marks: totalMarks(questions) };
}

module.exports = { normalizeTest, countWarning, totalMarks, applyEdits };
