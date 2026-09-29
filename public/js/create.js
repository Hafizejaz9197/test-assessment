/**
 * Create Test page:
 *  - upload chapter PDF → generate test → show it (Milestone 2)
 *  - inline editing + Save, print question paper / answer key (Milestone 3)
 *  - list saved tests so they can be reopened (?id=<testId>)
 */
(() => {
  const form = document.getElementById('createForm');
  const pdfInput = document.getElementById('pdf');
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('generateBtn');
  const output = document.getElementById('output');
  const testList = document.getElementById('testList');
  const printArea = document.getElementById('printArea');

  let currentTest = null; // last saved version from the server
  let dirty = false;      // unsaved inline edits?

  const LETTERS = ['a', 'b', 'c', 'd'];
  const SECTIONS = [
    { type: 'mcq', title: 'Section A – Multiple Choice Questions', note: 'Choose the correct option and write its letter (a, b, c or d).' },
    { type: 'short', title: 'Section B – Short Questions', note: 'Answer each question briefly.' },
    { type: 'long', title: 'Section C – Long Questions', note: 'Answer in detail.' },
  ];

  const sumMarks = (qs) => Math.round(qs.reduce((s, q) => s + (Number(q.marks) || 0), 0) * 2) / 2;

  // ---------------- Validation ----------------

  function validate() {
    const file = pdfInput.files[0];
    if (!file) return 'Please choose a chapter PDF to upload.';
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      return `"${file.name}" is not a PDF. Please upload the chapter as a .pdf file.`;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      return `The PDF is too big (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_PDF_MB} MB.`;
    }
    if (!form.title.value.trim()) return 'Please enter a test title.';
    return null;
  }

  // ---------------- Long-running request with elapsed timer ----------------

  /** Show a loading message with a running seconds counter while promise runs. */
  async function withProgress(message, promise) {
    const start = Date.now();
    const tick = () => showStatus(statusEl, 'loading', `${message} (${Math.round((Date.now() - start) / 1000)}s)`);
    tick();
    const timer = setInterval(tick, 1000);
    try {
      return await promise;
    } finally {
      clearInterval(timer);
    }
  }

  function setBusy(busy) {
    btn.disabled = busy;
    output.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
    if (!busy) updateSaveBar();
  }

  /** Ask before throwing away unsaved edits. */
  function okToDiscard() {
    return !dirty || confirm('You have unsaved changes to this test. Discard them?');
  }

  // ---------------- Generate / regenerate ----------------

  async function generate() {
    const problem = validate();
    if (problem) return showStatus(statusEl, 'error', problem);
    if (!okToDiscard()) return;

    setBusy(true);
    try {
      const data = await withProgress(
        'Reading the chapter and writing questions… this usually takes 30–90 seconds',
        apiFetch('/api/tests/generate', { method: 'POST', body: new FormData(form) }),
      );
      showTest(data.test);
      finished(data.warning, 'Test created and saved.');
    } catch (err) {
      showStatus(statusEl, 'error', err.message, generate);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!currentTest) return;
    const msg = dirty
      ? 'You have unsaved changes. Regenerating will replace ALL questions with a new set. Continue?'
      : 'Replace this test with a new set of questions from the same chapter?';
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const data = await withProgress(
        'Generating a new version of the test',
        apiFetch(`/api/tests/${currentTest.id}/regenerate`, { method: 'POST' }),
      );
      showTest(data.test);
      finished(data.warning, 'New version generated and saved.');
    } catch (err) {
      showStatus(statusEl, 'error', err.message, regenerate);
    } finally {
      setBusy(false);
    }
  }

  function finished(warning, okMessage) {
    if (warning) showStatus(statusEl, 'info', warning);
    else showStatus(statusEl, 'success', okMessage);
    loadTestList();
  }

  // ---------------- On-screen (editable) view ----------------

  function showTest(test) {
    if (!test || !Array.isArray(test.questions)) {
      // Usually means an older server version is still running.
      throw new Error('The server sent an unexpected reply. Please restart it (Ctrl+C, then npm start) and try again.');
    }
    currentTest = test;
    dirty = false;
    history.replaceState(null, '', `?id=${encodeURIComponent(test.id)}`);
    output.innerHTML = renderEditor(test);
    output.classList.remove('hidden');
    updateSaveBar();
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** An editable piece of text. field = name used by collectEdits(). */
  function editable(field, value, cls = '') {
    return `<span class="editable ${cls}" contenteditable="plaintext-only" spellcheck="true"
      data-field="${field}">${escapeHtml(value)}</span>`;
  }

  function renderEditor(test) {
    const sections = SECTIONS.map((sec) => {
      const qs = test.questions.filter((q) => q.type === sec.type);
      if (!qs.length) return '';
      return `
        <h3 class="section-title">${escapeHtml(sec.title)}
          <span class="muted">(<span data-section-marks="${sec.type}">${sumMarks(qs)}</span> marks)</span></h3>
        <ol class="questions">${qs.map(renderEditableQuestion).join('')}</ol>`;
    }).join('');

    return `
      <div class="card">
        <div class="test-actions no-print">
          <button type="button" class="btn btn-primary" data-action="print-paper">Print Question Paper</button>
          <button type="button" class="btn" data-action="print-key">Print Answer Key</button>
          <button type="button" class="btn" data-action="regenerate">Regenerate</button>
          <label class="check"><input type="checkbox" id="withSpace" ${withSpacePref() ? 'checked' : ''}>
            With answer space <small class="muted">(students answer on the paper)</small></label>
        </div>
        <p class="edit-hint no-print">Tip: click any question, option, answer or mark to edit it, then press <b>Save changes</b>.</p>

        <h2 class="test-title">${editable('title', test.title)}</h2>
        <p class="test-meta">Time: ${editable('time', test.time)} &nbsp;·&nbsp;
          Total marks: <span data-total>${escapeHtml(test.total_marks)}</span></p>
        ${sections}

        <div class="save-bar no-print hidden">
          <span>You have unsaved changes.</span>
          <button type="button" class="btn" data-action="discard">Discard</button>
          <button type="button" class="btn btn-primary" data-action="save">Save changes</button>
        </div>
      </div>`;
  }

  function renderEditableQuestion(q) {
    let body;
    if (q.type === 'mcq') {
      const opts = LETTERS.map((k) => `
        <li class="${q.answer_key === k ? 'correct' : ''}" data-letter="${k}">
          <b>(${k})</b> ${editable(`opt-${k}`, q.options ? q.options[k] : '')}</li>`).join('');
      const choices = LETTERS.map((k) =>
        `<option value="${k}" ${q.answer_key === k ? 'selected' : ''}>(${k})</option>`).join('');
      body = `
        <ol class="options">${opts}</ol>
        <p class="answer"><label><b>Correct option:</b>
          <select data-field="answer_key">${choices}</select></label></p>`;
    } else {
      body = `
        <details class="answer">
          <summary>Answer key</summary>
          <p><b>Key points:</b> ${editable('answer_key', q.answer_key, 'block')}</p>
          <p><b>Model answer:</b> ${editable('model_answer', q.model_answer, 'block')}</p>
        </details>`;
    }
    return `
      <li class="question" data-qid="${escapeHtml(q.id)}" data-type="${q.type}">
        <div class="q-head">
          <span class="q-id">${escapeHtml(q.id)}</span>
          <span class="q-text">${editable('question', q.question)}</span>
          <span class="q-marks">[${editable('marks', q.marks, 'marks')}]</span>
        </div>
        ${body}
      </li>`;
  }

  /** Read the current (possibly edited) values back out of the page. */
  function collectEdits() {
    const text = (root, field) => {
      const el = root.querySelector(`[data-field="${field}"]`);
      if (!el) return undefined;
      if (el.tagName === 'SELECT') return el.value;
      // innerText keeps line breaks but is empty for hidden elements (e.g. inside a
      // closed "Answer key" section), so fall back to textContent there.
      const hidden = el.closest('details:not([open])');
      return (hidden ? el.textContent : el.innerText).trim();
    };
    const questions = [...output.querySelectorAll('.question[data-qid]')].map((li) => {
      const q = {
        id: li.dataset.qid,
        question: text(li, 'question'),
        marks: text(li, 'marks'),
        answer_key: text(li, 'answer_key'),
      };
      if (li.dataset.type === 'mcq') {
        q.options = Object.fromEntries(LETTERS.map((k) => [k, text(li, `opt-${k}`)]));
      } else {
        q.model_answer = text(li, 'model_answer');
      }
      return q;
    });
    return { title: text(output, 'title'), time: text(output, 'time'), questions };
  }

  /** Current test with on-screen edits applied (used for live totals and printing). */
  function workingTest() {
    const edits = collectEdits();
    const byId = new Map(edits.questions.map((q) => [q.id, q]));
    const questions = currentTest.questions.map((q) => {
      const e = byId.get(q.id) || {};
      const next = { ...q, ...e, marks: Number(e.marks) };
      if (q.type === 'mcq') next.model_answer = (next.options || {})[next.answer_key] || '';
      if (!Number.isFinite(next.marks)) next.marks = q.marks;
      return next;
    });
    return { ...currentTest, title: edits.title || currentTest.title, time: edits.time || currentTest.time,
      questions, total_marks: sumMarks(questions) };
  }

  /** Update section/overall totals as marks are edited. */
  function refreshTotals() {
    const t = workingTest();
    output.querySelector('[data-total]').textContent = t.total_marks;
    for (const sec of SECTIONS) {
      const el = output.querySelector(`[data-section-marks="${sec.type}"]`);
      if (el) el.textContent = sumMarks(t.questions.filter((q) => q.type === sec.type));
    }
  }

  function updateSaveBar() {
    const bar = output.querySelector('.save-bar');
    if (bar) bar.classList.toggle('hidden', !dirty);
  }

  function markDirty() {
    dirty = true;
    updateSaveBar();
  }

  async function save() {
    const edits = collectEdits();
    // Quick client-side check for marks; the server validates again.
    for (const q of edits.questions) {
      const m = Number(q.marks);
      if (q.marks === '' || !Number.isFinite(m) || m < 0 || m > 100 || m * 2 !== Math.round(m * 2)) {
        return showStatus(statusEl, 'error', `Marks for ${q.id} must be a number from 0 to 100 (steps of 0.5).`);
      }
      if (!q.question) return showStatus(statusEl, 'error', `Question ${q.id} cannot be empty.`);
    }
    setBusy(true);
    showStatus(statusEl, 'loading', 'Saving changes…');
    try {
      const { test } = await apiFetch(`/api/tests/${currentTest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      });
      const scrollY = window.scrollY;
      showTest(test);
      window.scrollTo(0, scrollY); // stay where the teacher was editing
      showStatus(statusEl, 'success', 'Changes saved.');
      loadTestList();
    } catch (err) {
      showStatus(statusEl, 'error', err.message, save);
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (!confirm('Discard your unsaved changes?')) return;
    const scrollY = window.scrollY;
    showTest(currentTest);
    window.scrollTo(0, scrollY);
    hideStatus(statusEl);
  }

  // Editing events (delegated).
  output.addEventListener('input', (e) => {
    if (!e.target.closest('[data-field]')) return;
    markDirty();
    if (e.target.closest('[data-field="marks"]')) refreshTotals();
  });
  output.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-field="answer_key"]');
    if (!sel) return;
    // Move the green "correct" highlight to the chosen option.
    sel.closest('.question').querySelectorAll('.options li').forEach((li) => {
      li.classList.toggle('correct', li.dataset.letter === sel.value);
    });
    markDirty();
  });
  // Enter in single-line fields (title, question, marks…) finishes editing instead of adding a line.
  output.addEventListener('keydown', (e) => {
    const el = e.target.closest('.editable');
    if (el && e.key === 'Enter' && !el.classList.contains('block')) {
      e.preventDefault();
      el.blur();
    }
  });
  output.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const handlers = {
      'print-paper': () => printTest('paper'),
      'print-key': () => printTest('key'),
      regenerate,
      save,
      discard,
    };
    handlers[action.dataset.action]();
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  // ---------------- Printing ----------------

  /** kind: "paper" (for students, no answers) or "key" (for the teacher). */
  /** "With answer space" choice, remembered in this browser (default on). */
  function withSpacePref() {
    try {
      return localStorage.getItem('papercheck.withSpace') !== '0';
    } catch {
      return true;
    }
  }
  output.addEventListener('change', (e) => {
    if (e.target.id !== 'withSpace') return;
    try {
      localStorage.setItem('papercheck.withSpace', e.target.checked ? '1' : '0');
    } catch { /* ignore */ }
  });

  function printTest(kind) {
    const t = workingTest(); // prints exactly what is on screen, including unsaved edits
    const withSpace = document.getElementById('withSpace').checked;
    printArea.innerHTML = kind === 'key' ? renderAnswerKey(t) : renderQuestionPaper(t, withSpace);
    const oldTitle = document.title;
    document.title = `${t.title} – ${kind === 'key' ? 'Answer Key' : 'Question Paper'}`; // default PDF file name
    window.print();
    document.title = oldTitle;
  }

  function paperHeader(t, subtitle) {
    return `
      <header class="p-header">
        <h1>${escapeHtml(t.title)}</h1>
        ${subtitle ? `<div class="p-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        <div class="p-meta"><span>Time allowed: ${escapeHtml(t.time)}</span><span>Total marks: ${escapeHtml(t.total_marks)}</span></div>
      </header>`;
  }

  /** Number of ruled answer lines for a question, based on its marks. */
  function answerLines(q) {
    return Math.min(30, Math.max(3, Math.round((Number(q.marks) || 1) * 2.5))); // ~2.5 lines per mark
  }

  /**
   * Question paper for students.
   * withSpace = true: question-cum-answer paper (MCQ circles + ruled lines under
   * each question). false: questions only, answers on separate sheets.
   */
  function renderQuestionPaper(t, withSpace) {
    const sections = SECTIONS.map((sec) => {
      const qs = t.questions.filter((q) => q.type === sec.type);
      if (!qs.length) return '';
      const items = qs.map((q) => {
        let body = '';
        if (q.type === 'mcq') {
          const twoCol = LETTERS.some((k) => String(q.options[k]).length > 22);
          body = `<div class="p-options ${twoCol ? 'two-col' : ''} ${withSpace ? 'bubbles' : ''}">${LETTERS.map((k) =>
            `<span>${withSpace ? '<i class="p-bubble"></i>' : ''}(${k}) ${escapeHtml(q.options[k])}</span>`).join('')}</div>`;
        } else if (withSpace) {
          body = `<div class="p-lines" style="--lines:${answerLines(q)}"></div>`;
        }
        return `
        <div class="p-q ${q.type === 'long' && withSpace ? 'p-q-long' : ''}">
          <div class="p-q-head"><b class="p-q-id">${escapeHtml(q.id)}.</b>
            <span class="p-q-text">${escapeHtml(q.question)}</span>
            <span class="p-q-marks">(${escapeHtml(q.marks)})</span></div>
          ${body}
        </div>`;
      }).join('');
      const note = sec.type === 'mcq' && withSpace ? 'Fill in the circle of the correct option. Fill only one circle.' : sec.note;
      return `
        <section class="p-section">
          <h2>${escapeHtml(sec.title)} <span class="p-sec-marks">[${sumMarks(qs)} marks]</span></h2>
          <p class="p-note">${escapeHtml(note)}</p>
          ${items}
        </section>`;
    }).join('');

    const instructions = withSpace
      ? 'Attempt all questions. Write each answer in the space given below its question, in blue or black pen. '
        + 'If you need more space, use an extra sheet and write the question number (e.g. B2) and your roll number on it.'
      : 'Attempt all questions. Write your answers on the answer sheet and write the question number '
        + '(e.g. A1, B2, C1) with each answer.';

    return `<div class="p-paper">
      <div class="p-student">
        <span>Name: <i></i></span><span>Roll No: <i></i></span>
        <span>Class/Section: <i></i></span><span>Date: <i></i></span>
      </div>
      ${paperHeader(t)}
      <p class="p-instructions"><b>Instructions:</b> ${instructions}</p>
      ${sections}
      <p class="p-end">— End of Paper —</p></div>`;
  }

  function renderAnswerKey(t) {
    const mcqs = t.questions.filter((q) => q.type === 'mcq');
    const written = t.questions.filter((q) => q.type !== 'mcq');
    const mcqTable = mcqs.length ? `
      <section class="p-section">
        <h2>Section A – MCQ Answers</h2>
        <table class="p-table">
          <thead><tr><th>Q</th><th>Answer</th><th>Marks</th></tr></thead>
          <tbody>${mcqs.map((q) => `<tr><td>${escapeHtml(q.id)}</td>
            <td>(${escapeHtml(q.answer_key)}) ${escapeHtml(q.model_answer)}</td><td>${escapeHtml(q.marks)}</td></tr>`).join('')}</tbody>
        </table>
      </section>` : '';
    const writtenSections = SECTIONS.filter((s) => s.type !== 'mcq').map((sec) => {
      const qs = written.filter((q) => q.type === sec.type);
      if (!qs.length) return '';
      return `
        <section class="p-section">
          <h2>${escapeHtml(sec.title)}</h2>
          ${qs.map((q) => `
            <div class="p-q">
              <div class="p-q-head"><b class="p-q-id">${escapeHtml(q.id)}.</b>
                <span class="p-q-text">${escapeHtml(q.question)}</span>
                <span class="p-q-marks">(${escapeHtml(q.marks)})</span></div>
              <div class="p-key"><b>Key points:</b> ${escapeHtml(q.answer_key)}</div>
              <div class="p-key"><b>Model answer:</b> ${escapeHtml(q.model_answer)}</div>
            </div>`).join('')}
        </section>`;
    }).join('');

    return `${paperHeader(t, 'ANSWER KEY – for teacher use only')}${mcqTable}${writtenSections}`;
  }

  // ---------------- Saved tests ----------------

  async function loadTestList() {
    try {
      const { tests } = await apiFetch('/api/tests');
      if (!tests.length) {
        testList.innerHTML = '<li class="muted">No tests yet. Create your first one above.</li>';
        return;
      }
      testList.innerHTML = tests.map((t) => `
        <li>
          <a href="?id=${encodeURIComponent(t.id)}" data-id="${escapeHtml(t.id)}">${escapeHtml(t.title)}</a>
          <small class="muted">${escapeHtml(t.questionCount)} questions · ${escapeHtml(t.total_marks)} marks ·
            ${escapeHtml(new Date(t.createdAt).toLocaleString())}</small>
        </li>`).join('');
    } catch (err) {
      testList.innerHTML = `<li class="status-error">${escapeHtml(err.message)}</li>`;
    }
  }

  async function openTest(id) {
    if (!okToDiscard()) return;
    showStatus(statusEl, 'loading', 'Opening test…');
    try {
      const { test } = await apiFetch(`/api/tests/${encodeURIComponent(id)}`);
      showTest(test);
      hideStatus(statusEl);
    } catch (err) {
      showStatus(statusEl, 'error', err.message, () => openTest(id));
    }
  }

  testList.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-id]');
    if (!link) return;
    e.preventDefault();
    openTest(link.dataset.id);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    generate();
  });

  loadTestList();
  const idFromUrl = new URLSearchParams(location.search).get('id');
  if (idFromUrl) openTest(idFromUrl);
})();
