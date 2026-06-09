// diff.js — word-level diff engine
// IMPORTANT: var/function declarations ONLY — file loaded via importScripts() in diff.worker.js,
// which requires all identifiers to land on the global scope. const/let/class/arrow fns are blocked.

var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;

// PUA range used by diff-match-patch for tokenization (U+E000–U+F8FF)
var PUA_RE = /[-]/g;

function hasPUA(text) {
  PUA_RE.lastIndex = 0;
  return PUA_RE.test(text);
}

function stripPUA(text) {
  return text.replace(/[-]/g, '');
}

function normalizeText(text) {
  return text
    // Smart single quotes → apostrophe
    .replace(/[‘’‚‛′‵]/g, "'")
    // Smart double quotes → straight double
    .replace(/[“”„‟″‶]/g, '"')
    // Non-breaking space → regular space
    .replace(/ /g, ' ')
    // En dash → hyphen
    .replace(/–/g, '-')
    // Em dash → double hyphen
    .replace(/—/g, '--')
    // Common ligatures
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    // Ellipsis → three dots
    .replace(/…/g, '...');
}

// Abbreviations that contain internal periods and should not trigger sentence splits.
// Two-pass: first protect, then split, then restore.
var ABBREV_RE = /\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|Inc|Ltd|Corp|Co|vs|etc|approx|est|Fig|vol|pp|ch|No|Dept|Univ|Assoc|Mgr|Asst|Bros|Blvd|Ave|St|Rd|Apt|e\.g|i\.e|cf|et al|U\.S\.A|U\.S|U\.K|P\.O)\./gi;
var ABBREV_PLACEHOLDER = '\x00ABB\x00';

function protectAbbreviations(text) {
  return text.replace(ABBREV_RE, function(m) { return m.slice(0, -1) + '\x00DOT\x00'; });
}

function restoreAbbreviations(text) {
  return text.replace(/\x00DOT\x00/g, '.');
}

// Split text into tokens: words + whitespace/punctuation as separate tokens.
// emoji and CJK characters are treated as individual tokens.
function tokenize(text) {
  var tokens = [];
  // Match: word chars (including CJK ranges), or emoji sequences, or single non-word chars
  // CJK Unified: 一-鿿, CJK Ext A: 㐀-䶿, Hiragana/Katakana: ぀-ヿ
  // Emoji: \uD83C-\uD83E (surrogate pairs for emoji), or ☀-➿ (misc symbols)
  var re = /[一-鿿㐀-䶿぀-ヿ가-힯]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[☀-➿⌀-⏿]|\w+|[^\w]/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

// Token encoding base — Latin Extended-A (U+0100). Safe for internal use since:
// - The encoded strings are never displayed or compared to user text
// - Avoids U+E000–U+F8FF (stripped from user input, reserving that range for diff-match-patch)
// - 54,783 slots (U+0100 to U+D7FF) handles documents with large unique-token counts
var TOKEN_BASE = 0x0100;
var TOKEN_MAX  = 0xD7FF; // Before surrogate range

// Main word-level diff function.
// Returns array of [op, text] pairs where op is DIFF_DELETE, DIFF_INSERT, or DIFF_EQUAL.
function wordLevelDiff(original, revised) {
  var dmp = new diff_match_patch();
  dmp.Diff_Timeout = 1.0;

  var origTokens = tokenize(original);
  var revTokens = tokenize(revised);

  var allTokenArr = [];
  var tokenToChar = {};

  function encodeToken(token) {
    if (!(token in tokenToChar)) {
      var idx = allTokenArr.length;
      var code = TOKEN_BASE + idx;
      if (code > TOKEN_MAX) {
        // Overflow: more unique tokens than encoding slots — wrap and reuse.
        // Reduces diff quality on very large diverse docs, but never crashes.
        code = TOKEN_BASE + (idx % (TOKEN_MAX - TOKEN_BASE + 1));
      }
      tokenToChar[token] = String.fromCharCode(code);
      allTokenArr.push(token);
    }
    return tokenToChar[token];
  }

  var origCharsStr = '';
  for (var oi = 0; oi < origTokens.length; oi++) {
    origCharsStr += encodeToken(origTokens[oi]);
  }

  var revCharsStr = '';
  for (var ri = 0; ri < revTokens.length; ri++) {
    revCharsStr += encodeToken(revTokens[ri]);
  }

  var diffs = dmp.diff_main(origCharsStr, revCharsStr, false);
  dmp.diff_cleanupSemantic(diffs);

  // Decode back to tokens
  var result = [];
  for (var d = 0; d < diffs.length; d++) {
    var op = diffs[d][0];
    var encoded = diffs[d][1];
    var text = '';
    for (var c = 0; c < encoded.length; c++) {
      var idx = encoded.charCodeAt(c) - TOKEN_BASE;
      if (idx >= 0 && idx < allTokenArr.length) {
        text += allTokenArr[idx];
      }
    }
    if (text) result.push([op, text]);
  }

  return result;
}

// Merge consecutive same-op runs that belong to the same sentence.
// Prevents splitting across sentence boundaries for readability.
function sentenceBoundaryMerge(ops) {
  if (!ops || ops.length === 0) return ops;

  // Merge consecutive same-op entries first
  var merged = [];
  for (var i = 0; i < ops.length; i++) {
    if (merged.length > 0 && merged[merged.length - 1][0] === ops[i][0]) {
      merged[merged.length - 1] = [ops[i][0], merged[merged.length - 1][1] + ops[i][1]];
    } else {
      merged.push([ops[i][0], ops[i][1]]);
    }
  }

  return merged;
}

// Convert ops array to HTML string with <ins>/<del> markup.
function opsToHTML(ops) {
  var html = '';
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i][0];
    var text = ops[i][1]
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (op === DIFF_INSERT) {
      html += '<ins>' + text + '</ins>';
    } else if (op === DIFF_DELETE) {
      html += '<del>' + text + '</del>';
    } else {
      html += text;
    }
  }
  return html;
}

// Main entry: normalize, strip PUA, diff, render.
// Returns { html: string, puaStripped: bool, capped: bool }
var CHAR_CAP = 200000;

function computeDiff(original, revised) {
  var puaStripped = false;

  if (hasPUA(original) || hasPUA(revised)) {
    original = stripPUA(original);
    revised = stripPUA(revised);
    puaStripped = true;
  }

  original = normalizeText(original);
  revised = normalizeText(revised);

  if (original.length > CHAR_CAP || revised.length > CHAR_CAP) {
    return { html: '', puaStripped: puaStripped, capped: true };
  }

  if (!original && !revised) {
    return { html: '', puaStripped: puaStripped, capped: false };
  }

  var ops = wordLevelDiff(original, revised);
  ops = sentenceBoundaryMerge(ops);
  var html = opsToHTML(ops);

  return { html: html, puaStripped: puaStripped, capped: false };
}

// Node.js compat for tests
if (typeof module !== 'undefined') {
  module.exports = {
    normalizeText: normalizeText,
    stripPUA: stripPUA,
    hasPUA: hasPUA,
    tokenize: tokenize,
    wordLevelDiff: wordLevelDiff,
    sentenceBoundaryMerge: sentenceBoundaryMerge,
    opsToHTML: opsToHTML,
    computeDiff: computeDiff,
    DIFF_DELETE: DIFF_DELETE,
    DIFF_INSERT: DIFF_INSERT,
    DIFF_EQUAL: DIFF_EQUAL,
  };
}
