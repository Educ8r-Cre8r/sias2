/**
 * Backfill Tools — Admin Dashboard Module
 * Auto-chaining batch execution with progress UI for exit tickets and rubrics.
 */

// ── State ──
let backfillState = {
  exitTicket: { running: false, cancelled: false, processed: 0, total: 0, pdfs: 0, errors: [], startTime: null },
  rubric:     { running: false, cancelled: false, processed: 0, total: 0, pdfs: 0, errors: [], cost: 0, startTime: null }
};

// ── Exit Ticket Backfill ──

async function startExitTicketBackfill() {
  const state = backfillState.exitTicket;
  if (state.running) {
    state.cancelled = true;
    document.getElementById('et-backfill-btn').disabled = true;
    document.getElementById('et-backfill-btn').textContent = 'Stopping...';
    return;
  }

  // Get total image count
  const images = metadataManager.getImages();
  if (!images || images.length === 0) {
    showToast('No images loaded. Wait for metadata to load.', 'error');
    return;
  }

  state.running = true;
  state.cancelled = false;
  state.processed = 0;
  state.total = images.length;
  state.pdfs = 0;
  state.errors = [];
  state.startTime = Date.now();

  const btn = document.getElementById('et-backfill-btn');
  btn.textContent = 'Stop';
  btn.classList.remove('btn-primary');
  btn.classList.add('btn-danger');

  const progressDiv = document.getElementById('et-backfill-progress');
  progressDiv.style.display = 'block';
  const log = document.getElementById('et-progress-log');
  log.innerHTML = '';

  const batchSize = 10;
  let batchStart = 0;

  try {
    const backfillFn = firebase.functions().httpsCallable('adminBackfillExitTickets');

    while (batchStart < state.total && !state.cancelled) {
      const logLine = `Batch ${Math.floor(batchStart / batchSize) + 1}: images ${batchStart}–${Math.min(batchStart + batchSize - 1, state.total - 1)}...`;
      appendLog(log, logLine);

      const result = await backfillFn({ batchStart, batchSize });
      const data = result.data;

      state.processed += data.processed;
      state.pdfs += data.pdfs;

      // Log per-file errors from this batch
      if (data.errors && data.errors.length > 0) {
        state.errors.push(...data.errors);
        data.errors.forEach(err => appendLog(log, `  ⚠️ ${err}`, 'warning'));
      }

      updateETProgress(state);
      appendLog(log, `  ✅ ${data.processed} images → ${data.pdfs} PDFs`);

      if (!data.hasMore) break;
      batchStart = data.nextBatch;
    }

    if (state.cancelled) {
      appendLog(log, `\n⏹ Stopped at image ${state.processed} of ${state.total}`);
      document.getElementById('et-backfill-status').textContent = `Stopped (${state.processed}/${state.total})`;
    } else {
      const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(0);
      const errSummary = state.errors.length > 0 ? ` (${state.errors.length} errors)` : '';
      appendLog(log, `\n✅ Complete! ${state.pdfs} PDFs in ${elapsed}s${errSummary}`);
      document.getElementById('et-backfill-status').textContent = `Done — ${state.pdfs} PDFs${errSummary}`;
      showToast(`Exit ticket backfill complete: ${state.pdfs} PDFs${errSummary}`, state.errors.length > 0 ? 'warning' : 'success');
    }
  } catch (err) {
    appendLog(log, `\n❌ Error: ${err.message}`);
    document.getElementById('et-backfill-status').textContent = 'Error';
    showToast('Exit ticket backfill failed: ' + err.message, 'error');
  } finally {
    state.running = false;
    btn.textContent = 'Start Backfill';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');
    btn.disabled = false;
  }
}

function updateETProgress(state) {
  const pct = Math.round((state.processed / state.total) * 100);
  document.getElementById('et-progress-bar').style.width = pct + '%';
  document.getElementById('et-progress-pct').textContent = pct + '%';
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(0);
  document.getElementById('et-progress-label').textContent =
    `${state.processed}/${state.total} images (${state.pdfs} PDFs, ${elapsed}s)`;
}

// ── Rubric Backfill ──

async function startRubricBackfill() {
  const state = backfillState.rubric;
  if (state.running) {
    state.cancelled = true;
    document.getElementById('rubric-backfill-btn').disabled = true;
    document.getElementById('rubric-backfill-btn').textContent = 'Stopping...';
    return;
  }

  const images = metadataManager.getImages();
  if (!images || images.length === 0) {
    showToast('No images loaded. Wait for metadata to load.', 'error');
    return;
  }

  // Confirm cost
  const totalCost = (images.length * 0.028).toFixed(2);
  if (!confirm(`Rubric backfill will make ~${images.length * 6} AI calls.\nEstimated cost: ~$${totalCost}\n\nContinue?`)) {
    return;
  }

  state.running = true;
  state.cancelled = false;
  state.processed = 0;
  state.total = images.length;
  state.pdfs = 0;
  state.errors = [];
  state.startTime = Date.now();

  const btn = document.getElementById('rubric-backfill-btn');
  btn.textContent = 'Stop';
  btn.classList.remove('btn-primary');
  btn.classList.add('btn-danger');

  const progressDiv = document.getElementById('rubric-backfill-progress');
  progressDiv.style.display = 'block';
  const log = document.getElementById('rubric-progress-log');
  log.innerHTML = '';

  const batchSize = 3;
  let batchStart = 0;

  try {
    const backfillFn = firebase.functions().httpsCallable('adminBackfillRubrics');

    while (batchStart < state.total && !state.cancelled) {
      const logLine = `Batch ${Math.floor(batchStart / batchSize) + 1}: images ${batchStart}–${Math.min(batchStart + batchSize - 1, state.total - 1)}...`;
      appendLog(log, logLine);

      const result = await backfillFn({ batchStart, batchSize });
      const data = result.data;

      state.processed += data.processed;
      state.pdfs += data.pdfs;

      // Log per-file errors from this batch
      if (data.errors && data.errors.length > 0) {
        state.errors.push(...data.errors);
        data.errors.forEach(err => appendLog(log, `  ⚠️ ${err}`, 'warning'));
      }

      updateRubricProgress(state);
      const costStr = data.cost ? ` ($${data.cost.toFixed(4)})` : '';
      appendLog(log, `  ✅ ${data.processed} images → ${data.pdfs} PDFs${costStr}`);

      if (!data.hasMore) break;
      batchStart = data.nextBatch;
    }

    if (state.cancelled) {
      appendLog(log, `\n⏹ Stopped at image ${state.processed} of ${state.total}`);
      document.getElementById('rubric-backfill-status').textContent = `Stopped (${state.processed}/${state.total})`;
    } else {
      const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(0);
      const errSummary = state.errors.length > 0 ? ` (${state.errors.length} errors)` : '';
      appendLog(log, `\n✅ Complete! ${state.pdfs} PDFs in ${elapsed}s${errSummary}`);
      document.getElementById('rubric-backfill-status').textContent = `Done — ${state.pdfs} PDFs${errSummary}`;
      showToast(`Rubric backfill complete: ${state.pdfs} PDFs${errSummary}`, state.errors.length > 0 ? 'warning' : 'success');
    }
  } catch (err) {
    appendLog(log, `\n❌ Error: ${err.message}`);
    document.getElementById('rubric-backfill-status').textContent = 'Error';
    showToast('Rubric backfill failed: ' + err.message, 'error');
  } finally {
    state.running = false;
    btn.textContent = 'Start Backfill';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');
    btn.disabled = false;
  }
}

function updateRubricProgress(state) {
  const pct = Math.round((state.processed / state.total) * 100);
  document.getElementById('rubric-progress-bar').style.width = pct + '%';
  document.getElementById('rubric-progress-pct').textContent = pct + '%';
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(0);
  document.getElementById('rubric-progress-label').textContent =
    `${state.processed}/${state.total} images (${state.pdfs} PDFs, ${elapsed}s)`;
}

// ── Shared Helpers ──

function appendLog(logEl, text, type) {
  const line = document.createElement('div');
  line.textContent = text;
  if (type === 'warning') line.style.color = '#e65100';
  if (type === 'error') line.style.color = '#c62828';
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function renderBackfillStats() {
  const images = metadataManager.getImages();
  if (!images) return;
  document.getElementById('backfill-total-images').textContent = images.length;
  // The exact counts from Storage would require an audit call — show expected counts instead
  document.getElementById('backfill-exit-ticket-count').textContent = '—';
  document.getElementById('backfill-rubric-count').textContent = '—';
}

// ── Expose globally ──
window.startExitTicketBackfill = startExitTicketBackfill;
window.startRubricBackfill = startRubricBackfill;
window.renderBackfillStats = renderBackfillStats;
