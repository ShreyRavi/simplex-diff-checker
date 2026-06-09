// Vitest unit tests for diff.js
// Run: npm test

const { createRequire } = await import('module');
const require = createRequire(import.meta.url);

// Load diff_match_patch into global scope (mirrors importScripts behaviour)
const dmpModule = require('../lib/diff_match_patch.js');
global.diff_match_patch = dmpModule;

const {
  normalizeText,
  stripPUA,
  hasPUA,
  tokenize,
  wordLevelDiff,
  sentenceBoundaryMerge,
  opsToHTML,
  computeDiff,
  DIFF_DELETE,
  DIFF_INSERT,
  DIFF_EQUAL,
} = require('../diff.js');

import { describe, it, expect } from 'vitest';

// ── normalizeText ─────────────────────────────────────────────────────────

describe('normalizeText', () => {
  it('replaces smart single quotes', () => {
    expect(normalizeText('‘hello’')).toBe("'hello'");
  });

  it('replaces smart double quotes', () => {
    expect(normalizeText('“hello”')).toBe('"hello"');
  });

  it('replaces NBSP with space', () => {
    expect(normalizeText('hello world')).toBe('hello world');
  });

  it('replaces en dash with hyphen', () => {
    expect(normalizeText('2020–2021')).toBe('2020-2021');
  });

  it('replaces em dash with double hyphen', () => {
    expect(normalizeText('well—done')).toBe('well--done');
  });

  it('replaces fi ligature', () => {
    expect(normalizeText('ﬁne')).toBe('fine');
  });

  it('replaces ellipsis', () => {
    expect(normalizeText('wait…')).toBe('wait...');
  });

  it('leaves plain ASCII unchanged', () => {
    expect(normalizeText('hello world')).toBe('hello world');
  });
});

// ── PUA handling ──────────────────────────────────────────────────────────

describe('hasPUA', () => {
  it('returns false for clean text', () => {
    expect(hasPUA('hello world')).toBe(false);
  });

  it('returns true when PUA char present', () => {
    expect(hasPUA('helloworld')).toBe(true);
  });
});

describe('stripPUA', () => {
  it('leaves clean text unchanged', () => {
    expect(stripPUA('clean text')).toBe('clean text');
  });

  it('strips PUA characters', () => {
    expect(stripPUA('textcontaminated')).toBe('textcontaminated');
  });
});

// ── tokenize ──────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('empty string → empty array', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('simple words and spaces', () => {
    expect(tokenize('hello world')).toEqual(['hello', ' ', 'world']);
  });

  it('punctuation is separate token', () => {
    const tokens = tokenize('Hello, world.');
    expect(tokens).toContain('Hello');
    expect(tokens).toContain(',');
    expect(tokens).toContain('.');
  });

  it('very long word — no crash', () => {
    const long = 'a'.repeat(10000);
    expect(() => tokenize(long)).not.toThrow();
    expect(tokenize(long)[0]).toBe(long);
  });

  it('emoji — no crash', () => {
    expect(() => tokenize('hello 😀 world')).not.toThrow();
  });

  it('CJK characters tokenized', () => {
    const tokens = tokenize('日本語');
    expect(tokens.length).toBeGreaterThan(0);
    expect(() => tokenize('日本語')).not.toThrow();
  });
});

// ── wordLevelDiff ─────────────────────────────────────────────────────────

describe('wordLevelDiff', () => {
  it('identical text → no DELETE or INSERT ops', () => {
    const ops = wordLevelDiff('hello', 'hello');
    const changed = ops.filter(([op]) => op !== DIFF_EQUAL);
    expect(changed).toHaveLength(0);
  });

  it('complete substitution', () => {
    const ops = wordLevelDiff('hello', 'world');
    const del = ops.filter(([op]) => op === DIFF_DELETE);
    const ins = ops.filter(([op]) => op === DIFF_INSERT);
    expect(del.length).toBeGreaterThan(0);
    expect(ins.length).toBeGreaterThan(0);
  });

  it('empty original → all INSERT', () => {
    const ops = wordLevelDiff('', 'hello');
    const del = ops.filter(([op]) => op === DIFF_DELETE);
    expect(del).toHaveLength(0);
    expect(ops.some(([op]) => op === DIFF_INSERT)).toBe(true);
  });

  it('empty revised → all DELETE', () => {
    const ops = wordLevelDiff('hello', '');
    const ins = ops.filter(([op]) => op === DIFF_INSERT);
    expect(ins).toHaveLength(0);
    expect(ops.some(([op]) => op === DIFF_DELETE)).toBe(true);
  });

  it('no crash on emoji input', () => {
    expect(() => wordLevelDiff('hello 😀', 'hello 🎉')).not.toThrow();
  });

  it('no crash on CJK input', () => {
    expect(() => wordLevelDiff('日本語のテスト', '日本語テスト')).not.toThrow();
  });
});

// ── sentenceBoundaryMerge ─────────────────────────────────────────────────

describe('sentenceBoundaryMerge', () => {
  it('empty array → empty array', () => {
    expect(sentenceBoundaryMerge([])).toEqual([]);
  });

  it('merges consecutive same-op entries', () => {
    const ops = [[DIFF_INSERT, 'hello'], [DIFF_INSERT, ' world']];
    const merged = sentenceBoundaryMerge(ops);
    expect(merged).toHaveLength(1);
    expect(merged[0][1]).toBe('hello world');
  });

  it('does not merge different ops', () => {
    const ops = [[DIFF_INSERT, 'hello'], [DIFF_DELETE, 'world']];
    const merged = sentenceBoundaryMerge(ops);
    expect(merged).toHaveLength(2);
  });
});

// ── opsToHTML ─────────────────────────────────────────────────────────────

describe('opsToHTML', () => {
  it('EQUAL op → plain text', () => {
    expect(opsToHTML([[DIFF_EQUAL, 'hello']])).toBe('hello');
  });

  it('INSERT op → <ins> tag', () => {
    expect(opsToHTML([[DIFF_INSERT, 'hello']])).toBe('<ins>hello</ins>');
  });

  it('DELETE op → <del> tag', () => {
    expect(opsToHTML([[DIFF_DELETE, 'hello']])).toBe('<del>hello</del>');
  });

  it('escapes HTML in content', () => {
    const html = opsToHTML([[DIFF_EQUAL, '<script>']]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ── computeDiff ───────────────────────────────────────────────────────────

describe('computeDiff', () => {
  it('both empty → empty html', () => {
    const { html } = computeDiff('', '');
    expect(html).toBe('');
  });

  it('identical text → no ins/del in html', () => {
    const { html } = computeDiff('same text', 'same text');
    expect(html).not.toContain('<ins>');
    expect(html).not.toContain('<del>');
  });

  it('different text → html contains ins/del', () => {
    const { html } = computeDiff('hello', 'world');
    expect(html).toContain('<ins>');
    expect(html).toContain('<del>');
  });

  it('PUA chars → puaStripped flag set', () => {
    const { puaStripped } = computeDiff('hello', 'world');
    expect(puaStripped).toBe(true);
  });

  it('input over 200k chars → capped flag', () => {
    const big = 'a'.repeat(200001);
    const { capped } = computeDiff(big, big);
    expect(capped).toBe(true);
  });

  it('Dr. abbreviation does not crash', () => {
    expect(() => computeDiff('Dr. Smith joined.', 'Dr. Jones joined.')).not.toThrow();
  });

  it('Inc. abbreviation does not crash', () => {
    expect(() => computeDiff('Acme Inc. filed.', 'Beta Inc. filed.')).not.toThrow();
  });

  it('U.S.A. abbreviation does not crash', () => {
    expect(() => computeDiff('U.S.A. policy changed.', 'U.S.A. rules updated.')).not.toThrow();
  });
});
