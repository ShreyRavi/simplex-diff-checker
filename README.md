# Simplex Diff Checker

Paste two versions of a document. See what changed, highlighted like Word's Track Changes. Runs entirely in your browser — no data leaves your tab.

**[Open the app →](https://shreyravi.github.io/simplex-diff-checker/)**

---

## Privacy Verification

No data leaves your browser. Verify yourself:

1. Open the app: https://shreyravi.github.io/simplex-diff-checker/
2. Open DevTools → Network tab
3. Paste text in both boxes and click Compare
4. Confirm: **zero network requests appear**

**Source files committed to this repo — nothing loaded from a CDN:**

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `app.js` | UI logic |
| `diff.js` | Diff algorithm wrapper |
| `diff.worker.js` | Web Worker (off-main-thread for large inputs) |
| `lib/diff_match_patch.js` | Google's diff library (MIT license, committed unmodified) |
| `style.css` | Styles |
| `fonts.css` | Font face declarations |
| `fonts/` | Self-hosted woff2 files (IBM Plex Mono + IBM Plex Sans) |
| `sw.js` | Service worker (caches app for offline use) |
| `manifest.json` | PWA manifest |

No analytics. No cookies. No server. No external font CDN.

---

## Using the App

Paste your original text in the left box and the revised version in the right box. Changes appear highlighted immediately — additions in green, removals in red. Use **Copy as HTML** or **Download .html** to share the result.

---

## Contributing

**Requirements:** Node.js 18+

```bash
git clone https://github.com/ShreyRavi/simplex-diff-checker.git
cd simplex-diff-checker
npm install
npx playwright install --with-deps chromium
```

**Local development** (required for service worker testing — `file://` disables SW registration):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

**Tests:**

```bash
npm test        # Vitest unit tests
npm run e2e     # Playwright E2E tests (starts server automatically)
```

---

## License

MIT — see [LICENSE](LICENSE)
