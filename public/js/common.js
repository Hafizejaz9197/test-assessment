/**
 * Shared helpers for both pages (no framework, no build step).
 */
const MAX_PDF_MB = 25;
const MAX_SHEET_MB = 10;

/** Escape text before putting it into innerHTML. */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Show a status message. type: "info" | "success" | "error" | "loading".
 * If onRetry is given, a Retry button is shown next to the message.
 */
function showStatus(el, type, message, onRetry) {
  el.className = `status status-${type}`;
  el.innerHTML = (type === 'loading' ? '<span class="spinner"></span>' : '') +
    `<span>${escapeHtml(message)}</span>`;
  if (onRetry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small';
    btn.textContent = 'Retry';
    btn.addEventListener('click', onRetry);
    el.appendChild(btn);
  }
}

function hideStatus(el) {
  el.className = 'status hidden';
  el.innerHTML = '';
}

/**
 * fetch() wrapper that always returns parsed JSON or throws an Error
 * with a readable message.
 */
async function apiFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Could not reach the PaperCheck server. Is it running?');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (HTTP ${res.status}).`);
  }
  return data;
}

/** Warn at the top of the page if the server has no Gemini API key. */
async function checkApiKey() {
  const box = document.getElementById('keyWarning');
  if (!box) return;
  try {
    const health = await apiFetch('/api/health');
    if (!health.apiKeyConfigured) {
      box.textContent = 'GEMINI_API_KEY is not set in the server .env file. Uploads work, but AI features will fail until it is added.';
      box.classList.remove('hidden');
    }
  } catch (err) {
    box.textContent = err.message;
    box.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', checkApiKey);
