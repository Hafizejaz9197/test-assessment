/**
 * Create Test page: upload chapter PDF → generate test → show it.
 * Also lists saved tests so they can be reopened (?id=<testId>).
 */
(() => {
  const form = document.getElementById('createForm');
  const pdfInput = document.getElementById('pdf');
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('generateBtn');
  const output = document.getElementById('output');
  const testList = document.getElementById('testList');

  let currentTest = null;

  const SECTIONS = [
    { type: 'mcq', title: 'Section A – Multiple Choice Questions', note: 'Choose the correct option.' },
    { type: 'short', title: 'Section B – Short Questions', note: 'Answer briefly.' },
    { type: 'long', title: 'Section C – Long Questions', note: 'Answer in detail.' },
  ];

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
  }

  // ---------------- Generate / regenerate ----------------

  async function generate() {
    const problem = validate();
    if (problem) return showStatus(statusEl, 'error', problem);

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
    if (!confirm('Replace this test with a new set of questions from the same chapter?')) return;
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

  // ---------------- Rendering ----------------

  function showTest(test) {
    if (!test || !Array.isArray(test.questions)) {
      // Usually means an older server version is still running.
      throw new Error('The server sent an unexpected reply. Please restart it (Ctrl+C, then npm start) and try again.');
    }
    currentTest = test;
    history.replaceState(null, '', `?id=${encodeURIComponent(test.id)}`);
    output.innerHTML = renderTest(test);
    output.classList.remove('hidden');
    output.querySelector('[data-action=regenerate]').addEventListener('click', regenerate);
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTest(test) {
    const sections = SECTIONS.map((sec) => {
      const qs = test.questions.filter((q) => q.type === sec.type);
      if (!qs.length) return '';
      const marks = qs.reduce((s, q) => s + Number(q.marks || 0), 0);
      return `
        <h3 class="section-title">${escapeHtml(sec.title)} <span class="muted">(${marks} marks)</span></h3>
        <ol class="questions">${qs.map(renderQuestion).join('')}</ol>`;
    }).join('');

    return `
      <div class="card">
        <div class="test-actions no-print">
          <button type="button" class="btn" data-action="regenerate">Regenerate</button>
        </div>
        <h2 class="test-title">${escapeHtml(test.title)}</h2>
        <p class="test-meta">Time: ${escapeHtml(test.time)} &nbsp;·&nbsp; Total marks: ${escapeHtml(test.total_marks)}</p>
        ${sections}
      </div>`;
  }

  function renderQuestion(q) {
    const options = q.type === 'mcq' && q.options
      ? `<ol class="options">${['a', 'b', 'c', 'd'].map((k) => `
          <li class="${q.answer_key === k ? 'correct' : ''}"><b>(${k})</b> ${escapeHtml(q.options[k])}</li>`).join('')}
        </ol>`
      : '';
    const key = q.type === 'mcq'
      ? `<p class="answer"><b>Answer:</b> (${escapeHtml(q.answer_key)}) ${escapeHtml(q.model_answer)}</p>`
      : `<details class="answer">
           <summary>Answer key</summary>
           <p><b>Key points:</b> ${escapeHtml(q.answer_key)}</p>
           <p><b>Model answer:</b> ${escapeHtml(q.model_answer)}</p>
         </details>`;
    return `
      <li class="question">
        <div class="q-head">
          <span class="q-id">${escapeHtml(q.id)}</span>
          <span class="q-text">${escapeHtml(q.question)}</span>
          <span class="q-marks">[${escapeHtml(q.marks)}]</span>
        </div>
        ${options}
        ${key}
      </li>`;
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
