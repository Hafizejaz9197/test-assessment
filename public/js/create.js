/**
 * Create Test page.
 * Milestone 1: validates and uploads the chapter PDF + settings.
 */
(() => {
  const form = document.getElementById('createForm');
  const pdfInput = document.getElementById('pdf');
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('generateBtn');

  /** Client-side checks so teachers get instant feedback. */
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

  async function submit() {
    const problem = validate();
    if (problem) return showStatus(statusEl, 'error', problem);

    btn.disabled = true;
    showStatus(statusEl, 'loading', 'Uploading PDF…');
    try {
      const data = await apiFetch('/api/tests/generate', { method: 'POST', body: new FormData(form) });
      const u = data.upload;
      showStatus(statusEl, 'success', `${data.message} (${u.originalName}, ${u.sizeKB} KB)`);
    } catch (err) {
      showStatus(statusEl, 'error', err.message, submit);
    } finally {
      btn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
})();
