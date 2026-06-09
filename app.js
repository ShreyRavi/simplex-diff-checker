// app.js — UI logic for Simplex Diff Checker

(function () {
  'use strict';

  // ── Elements ──────────────────────────────────────────────────────────────
  var originalTA  = document.getElementById('original');
  var revisedTA   = document.getElementById('revised');
  var diffOutput  = document.getElementById('diff-output');
  var emptyState  = document.getElementById('empty-state');
  var copyBtn     = document.getElementById('copy-btn');
  var downloadBtn = document.getElementById('download-btn');
  var noticeZone  = document.getElementById('notice-zone');
  var privacyBtn  = document.getElementById('privacy-btn');
  var privacyPop  = document.getElementById('privacy-popover');
  var installBtn  = document.getElementById('install-btn');

  // ── State ─────────────────────────────────────────────────────────────────
  var currentHTML    = '';
  var workerReady    = false;
  var worker         = null;
  var pendingSeqId   = 0;       // last seq ID sent to worker
  var activeSeqId    = 0;       // seq ID of the result we last rendered
  var workerFailed   = false;   // true if Worker constructor threw
  var noticePUA      = false;
  var noticeCap      = false;
  var deferredPrompt = null;    // beforeinstallprompt event

  // ── Worker init (eager — on DOMContentLoaded) ─────────────────────────────
  function initWorker() {
    if (workerFailed || worker) return;
    try {
      worker = new Worker('diff.worker.js');
      worker.onmessage = function (e) {
        var data = e.data;
        if (data.id !== pendingSeqId) return; // stale — discard
        activeSeqId = data.id;
        hideLoading();
        if (data.error) {
          renderError(data.error);
        } else {
          renderResult(data.html, data.puaStripped, data.capped);
        }
      };
      worker.onerror = function () {
        workerFailed = true;
        worker = null;
        // Fall back to sync diff with current inputs
        runSyncDiff(originalTA.value, revisedTA.value);
      };
      workerReady = true;
    } catch (e) {
      workerFailed = true;
      worker = null;
    }
  }

  // ── Debounced diff trigger ─────────────────────────────────────────────────
  var debounceTimer = null;
  var DEBOUNCE_MS = 120;
  var WORKER_THRESHOLD = 10000; // combined word count to use worker

  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runDiff, DEBOUNCE_MS);
  }

  function runDiff() {
    var original = originalTA.value;
    var revised  = revisedTA.value;

    if (!original && !revised) {
      clearNotices();
      clearResult();
      return;
    }

    // Rough word count estimate for routing decision
    var combinedLen = original.length + revised.length;

    if (!workerFailed && worker && combinedLen > WORKER_THRESHOLD) {
      runWorkerDiff(original, revised);
    } else {
      runSyncDiff(original, revised);
    }
  }

  function runWorkerDiff(original, revised) {
    pendingSeqId++;
    showLoading();
    worker.postMessage({ id: pendingSeqId, original: original, revised: revised });
  }

  function runSyncDiff(original, revised) {
    // Load diff engine synchronously (only loaded once)
    if (typeof computeDiff === 'undefined') {
      loadSyncEngine(function () { runSyncDiff(original, revised); });
      return;
    }
    var result = computeDiff(original, revised);
    renderResult(result.html, result.puaStripped, result.capped);
  }

  var syncEngineLoaded = false;
  function loadSyncEngine(cb) {
    if (syncEngineLoaded) { cb(); return; }
    var s1 = document.createElement('script');
    s1.src = 'lib/diff_match_patch.js';
    s1.onload = function () {
      var s2 = document.createElement('script');
      s2.src = 'diff.js';
      s2.onload = function () { syncEngineLoaded = true; cb(); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function clearResult() {
    currentHTML = '';
    diffOutput.innerHTML = '';
    diffOutput.appendChild(buildEmptyState());
    updateButtons(false);
    // NOTE: does not clear notices — caller is responsible
  }

  function buildEmptyState() {
    var div = document.createElement('div');
    div.className = 'empty-state';
    div.id = 'empty-state';
    div.innerHTML =
      '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<rect x="4" y="6" width="16" height="20" rx="2" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="12" y="10" width="16" height="20" rx="2" fill="var(--color-bg)" stroke="currentColor" stroke-width="1.5"/>' +
      '</svg>' +
      '<p>Paste text in both boxes to see changes.</p>';
    return div;
  }

  function showLoading() {
    diffOutput.innerHTML =
      '<div class="loading-state" role="status" aria-label="Calculating changes">' +
        '<div class="spinner" aria-hidden="true"></div>' +
        '<p>Calculating changes…</p>' +
      '</div>';
    updateButtons(false);
  }

  function hideLoading() {
    // Content will be replaced by renderResult
  }

  function renderError(msg) {
    diffOutput.textContent = 'Error: ' + msg;
    updateButtons(false);
  }

  function renderResult(html, puaStripped, capped) {
    clearNotices();

    if (capped) {
      clearResult();
      showNotice('cap', 'Input exceeds 200,000 characters — diff suppressed to prevent browser slowdown. Shorten your text to compare.');
      return;
    }

    if (puaStripped) {
      showNotice('pua', 'Some special characters were removed before comparison (they interfere with the diff algorithm).');
      autoDismissNotice('pua', 5000);
    }

    currentHTML = html;

    if (!html) {
      diffOutput.innerHTML = '';
      diffOutput.appendChild(buildEmptyState());
      updateButtons(false);
      return;
    }

    diffOutput.innerHTML = html;
    updateButtons(true);
  }

  function updateButtons(hasResult) {
    copyBtn.disabled     = !hasResult;
    downloadBtn.disabled = !hasResult;
  }

  // ── Notices ───────────────────────────────────────────────────────────────
  var noticeTimers = {};

  function showNotice(type, text) {
    removeNotice(type);
    var el = document.createElement('div');
    el.className = 'notice notice-' + type;
    el.setAttribute('role', 'alert');
    el.dataset.noticeType = type;

    var msg = document.createElement('span');
    msg.textContent = text;

    var btn = document.createElement('button');
    btn.className = 'notice-dismiss';
    btn.setAttribute('aria-label', 'Dismiss notice');
    btn.textContent = '✕';
    btn.onclick = function () { removeNotice(type); };

    el.appendChild(msg);
    el.appendChild(btn);
    noticeZone.appendChild(el);
  }

  function removeNotice(type) {
    var existing = noticeZone.querySelector('[data-notice-type="' + type + '"]');
    if (existing) existing.remove();
    if (noticeTimers[type]) { clearTimeout(noticeTimers[type]); delete noticeTimers[type]; }
  }

  function autoDismissNotice(type, ms) {
    noticeTimers[type] = setTimeout(function () { removeNotice(type); }, ms);
  }

  function clearNotices() {
    var notices = noticeZone.querySelectorAll('.notice');
    for (var i = 0; i < notices.length; i++) notices[i].remove();
    Object.keys(noticeTimers).forEach(function (k) { clearTimeout(noticeTimers[k]); });
    noticeTimers = {};
  }

  // ── Copy as HTML ──────────────────────────────────────────────────────────
  function copyAsHTML() {
    if (!currentHTML) return;

    var htmlBlob = buildCopyHTML(currentHTML);
    var plainText = buildPlainText();

    if (navigator.clipboard && navigator.clipboard.write) {
      var items = {};
      items['text/html']  = new Blob([htmlBlob], { type: 'text/html' });
      items['text/plain'] = new Blob([plainText], { type: 'text/plain' });
      navigator.clipboard.write([new ClipboardItem(items)])
        .then(function () { flashCopySuccess(); })
        .catch(function () { copyFallback(plainText); });
    } else {
      copyFallback(plainText);
    }
  }

  function copyFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    flashCopySuccess();
  }

  function flashCopySuccess() {
    var orig = copyBtn.textContent;
    copyBtn.textContent = '✓ Copied!';
    copyBtn.disabled = true;
    setTimeout(function () {
      copyBtn.textContent = orig;
      copyBtn.disabled = !currentHTML;
    }, 2000);
  }

  function buildCopyHTML(diffHTML) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
      'body{font-family:monospace;font-size:14px;line-height:1.6;padding:16px;}' +
      'ins{text-decoration:underline;color:#1a7f37;background:#d4f0d8;padding:0 2px;border-radius:2px;}' +
      'del{text-decoration:line-through;color:#b91c1c;background:#fde8e8;padding:0 2px;border-radius:2px;}' +
      '</style></head><body>' + diffHTML + '</body></html>';
  }

  function buildPlainText() {
    // Strip tags, convert <ins>[…]</ins> and <del>[…]</del> to text markers
    return currentHTML
      .replace(/<ins>([\s\S]*?)<\/ins>/g, '[+$1+]')
      .replace(/<del>([\s\S]*?)<\/del>/g, '[-$1-]')
      .replace(/<[^>]+>/g, '');
  }

  // ── Download .html ────────────────────────────────────────────────────────
  function downloadHTML() {
    if (!currentHTML) return;
    var content = buildCopyHTML(currentHTML);
    var blob = new Blob([content], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'simplex-diff.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ── Privacy Popover ───────────────────────────────────────────────────────
  var firstFocusableInPopover = null;

  function openPopover() {
    privacyPop.hidden = false;
    privacyBtn.setAttribute('aria-expanded', 'true');

    var focusable = privacyPop.querySelectorAll('button, a[href]');
    firstFocusableInPopover = focusable[0] || null;
    if (firstFocusableInPopover) firstFocusableInPopover.focus();
  }

  function closePopover() {
    privacyPop.hidden = true;
    privacyBtn.setAttribute('aria-expanded', 'false');
    privacyBtn.focus();
  }

  privacyBtn.addEventListener('click', function () {
    if (!privacyPop.hidden) closePopover(); else openPopover();
  });

  privacyBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!privacyPop.hidden) closePopover(); else openPopover();
    }
  });

  var popoverClose = privacyPop.querySelector('.popover-close');
  if (popoverClose) {
    popoverClose.addEventListener('click', closePopover);
  }

  // Close on outside click (check ancestors so clicking child spans of privacyBtn doesn't re-close)
  document.addEventListener('click', function (e) {
    if (!privacyPop.hidden && !privacyPop.contains(e.target) && !privacyBtn.contains(e.target)) {
      closePopover();
    }
  });

  // Close on Escape; trap focus within popover
  document.addEventListener('keydown', function (e) {
    if (privacyPop.hidden) return;
    if (e.key === 'Escape') { closePopover(); return; }
    if (e.key === 'Tab') {
      var focusable = Array.prototype.slice.call(privacyPop.querySelectorAll('button, a[href]'));
      if (!focusable.length) return;
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });

  // ── PWA Install ───────────────────────────────────────────────────────────
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', function () {
    installBtn.hidden = true;
    deferredPrompt = null;
  });

  installBtn.addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      installBtn.hidden = true;
    });
  });

  // ── Keyboard shortcut: Cmd/Ctrl+Shift+C ──────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      if (!copyBtn.disabled) copyAsHTML();
    }
  });

  // ── Wire up buttons ───────────────────────────────────────────────────────
  copyBtn.addEventListener('click', copyAsHTML);
  downloadBtn.addEventListener('click', downloadHTML);

  // ── Input listeners ───────────────────────────────────────────────────────
  originalTA.addEventListener('input', onInput);
  revisedTA.addEventListener('input', onInput);

  // ── Boot ──────────────────────────────────────────────────────────────────
  initWorker();
}());
