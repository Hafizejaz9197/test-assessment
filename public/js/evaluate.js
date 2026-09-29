/**
 * Evaluate Answer Sheets page.
 * Milestone 1: add/remove students (max 5) and check file uploads.
 */
(() => {
  const MAX_STUDENTS = 5;
  const studentsEl = document.getElementById('students');
  const tpl = document.getElementById('studentTpl');
  const addBtn = document.getElementById('addStudentBtn');
  const evalBtn = document.getElementById('evaluateBtn');
  const statusEl = document.getElementById('status');

  /** Renumber students and enable/disable the Add button. */
  function refresh() {
    const blocks = studentsEl.querySelectorAll('.student');
    blocks.forEach((b, i) => { b.querySelector('.num').textContent = i + 1; });
    addBtn.disabled = blocks.length >= MAX_STUDENTS;
    addBtn.textContent = blocks.length >= MAX_STUDENTS ? `Maximum ${MAX_STUDENTS} students` : '+ Add student';
  }

  function addStudent() {
    if (studentsEl.querySelectorAll('.student').length >= MAX_STUDENTS) return;
    const node = tpl.content.firstElementChild.cloneNode(true);
    const filesInput = node.querySelector('.student-files');
    const list = node.querySelector('.file-list');

    // Show chosen files in upload order (= page order).
    filesInput.addEventListener('change', () => {
      list.innerHTML = [...filesInput.files]
        .map((f) => `<li>${escapeHtml(f.name)} <small>(${Math.round(f.size / 1024)} KB)</small></li>`)
        .join('');
    });
    node.querySelector('.remove-student').addEventListener('click', () => {
      node.remove();
      refresh();
    });
    studentsEl.appendChild(node);
    refresh();
  }

  /** Validate every student block; returns an error message or null. */
  function validate() {
    const blocks = [...studentsEl.querySelectorAll('.student')];
    if (blocks.length === 0) return 'Please add at least one student.';
    for (const [i, b] of blocks.entries()) {
      const name = b.querySelector('.student-name').value.trim();
      const files = [...b.querySelector('.student-files').files];
      const who = name || `Student ${i + 1}`;
      if (!name) return `Please enter a name for Student ${i + 1}.`;
      if (files.length === 0) return `Please upload answer sheet pages for ${who}.`;
      for (const f of files) {
        if (!/\.(jpe?g|png|pdf)$/i.test(f.name)) return `"${f.name}" (${who}) is not allowed. Use JPG, PNG or PDF.`;
        if (f.size > MAX_SHEET_MB * 1024 * 1024) {
          return `"${f.name}" (${who}) is too big (${(f.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_SHEET_MB} MB per file.`;
        }
      }
    }
    return null;
  }

  async function uploadCheck() {
    const problem = validate();
    if (problem) return showStatus(statusEl, 'error', problem);

    const fd = new FormData();
    studentsEl.querySelectorAll('.student').forEach((b, i) => {
      for (const f of b.querySelector('.student-files').files) fd.append(`student${i}`, f);
    });

    evalBtn.disabled = true;
    showStatus(statusEl, 'loading', 'Uploading answer sheets…');
    try {
      const data = await apiFetch('/api/evaluate/upload-check', { method: 'POST', body: fd });
      showStatus(statusEl, 'success', data.message);
    } catch (err) {
      showStatus(statusEl, 'error', err.message, uploadCheck);
    } finally {
      evalBtn.disabled = false;
    }
  }

  addBtn.addEventListener('click', addStudent);
  evalBtn.addEventListener('click', uploadCheck);
  addStudent(); // start with one student block
})();
