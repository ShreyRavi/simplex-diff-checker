// diff.worker.js — Web Worker for off-main-thread diff computation
// Loaded via new Worker('diff.worker.js') from app.js.
// importScripts requires diff.js to use var/function declarations only.

importScripts('lib/diff_match_patch.js', 'diff.js');

self.onmessage = function(e) {
  var id = e.data.id;
  var original = e.data.original;
  var revised = e.data.revised;

  try {
    var result = computeDiff(original, revised);
    self.postMessage({ id: id, html: result.html, puaStripped: result.puaStripped, capped: result.capped });
  } catch (err) {
    self.postMessage({ id: id, error: err.message || 'Worker error', html: '', puaStripped: false, capped: false });
  }
};
