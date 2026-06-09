# DESIGN.md — Simplex Diff Checker

Generated from /plan-design-review on 2026-06-08.
Source of truth for all UI/UX decisions. Update when design decisions change.

## Product Classification

**APP UI** — workspace-driven, task-focused, single-page tool.
No marketing sections, no hero, no landing page patterns.

---

## Typography

| Context | Typeface | Size | Weight | Line height |
|---------|----------|------|--------|------------|
| Product name (header) | IBM Plex Sans | 20px | 600 (SemiBold) | — |
| Labels (Original / Revised) | IBM Plex Sans | 13px | 500 | — |
| Button text | IBM Plex Sans | 14px | 500 | — |
| Notice / badge text | IBM Plex Sans | 13px | 400 | — |
| Textarea input text | IBM Plex Mono | 15px | 400 | 1.5 |
| Diff output prose | IBM Plex Mono | 15px | 400 | 1.6 |

Fonts loaded: self-hosted woff2 only (no JS tracker). Subset to latin. Two font requests total.

---

## Color System

```css
/* Light mode (default) */
:root {
  --color-bg:                #FAFAFA;
  --color-text:              #1a1a1a;
  --color-border:            #e5e7eb;
  --color-btn-fill:          #1a1a1a;
  --color-btn-text:          #FFFFFF;
  --color-btn-outline:       #1a1a1a;
  --color-btn-disabled:      rgba(26,26,26,0.4);

  /* Diff markup */
  --color-ins-text:          #1a7f37;
  --color-ins-bg:            #d4f0d8;
  --color-del-text:          #b91c1c;
  --color-del-bg:            #fde8e8;

  /* Notices */
  --color-notice-pua-border: #d97706;
  --color-notice-cap-border: #ea580c;
  --color-notice-bg:         #FFFFFF;
}

/* Dark mode (auto, OS preference only — no manual toggle) */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:                #0f172a;
    --color-text:              #e2e8f0;
    --color-border:            #334155;
    --color-btn-fill:          #e2e8f0;
    --color-btn-text:          #0f172a;
    --color-btn-outline:       #e2e8f0;
    --color-btn-disabled:      rgba(226,232,240,0.4);
    --color-ins-text:          #4ade80;
    --color-ins-bg:            #052e16;
    --color-del-text:          #f87171;
    --color-del-bg:            #450a0a;
    --color-notice-pua-border: #fbbf24;
    --color-notice-cap-border: #fb923c;
    --color-notice-bg:         #1e293b;
  }
}
```

All text/background combinations ≥ WCAG AA (4.5:1 body, 3:1 UI components).

---

## Component Specs

### `<ins>` / `<del>` Markup

```css
ins {
  text-decoration: underline;
  color: var(--color-ins-text);
  background: var(--color-ins-bg);
  padding: 0 2px;
  border-radius: 2px;
  font-style: normal;
}
del {
  text-decoration: line-through;
  color: var(--color-del-text);
  background: var(--color-del-bg);
  padding: 0 2px;
  border-radius: 2px;
  font-style: normal;
}
```

Color is never the ONLY differentiator — underline and strikethrough provide shape-based cues for color-blind users.

### Buttons

**Primary (filled):** `background: var(--color-btn-fill)`, `color: var(--color-btn-text)`, `padding: 8px 16px`, `border-radius: 4px`, `font: 14px/1 IBM Plex Sans 500`, `min-height: 44px` (touch target), `border: none`

**Secondary (outlined):** `background: transparent`, `color: var(--color-btn-outline)`, `border: 1.5px solid var(--color-btn-outline)`, same padding/radius/font as primary

**Disabled state:** `opacity: 0.4`, `cursor: not-allowed`, `pointer-events: none`

**Copy success:** label changes to "✓ Copied!" for 2 seconds, then reverts. No toast.

### Textareas

`font-family: IBM Plex Mono`, `font-size: 15px`, `line-height: 1.5`, `padding: 12px`, `border: 1.5px solid var(--color-border)`, `border-radius: 4px`, `background: var(--color-bg)`, `color: var(--color-text)`, `resize: none` (height is set by layout, not user-resizable)

### Notices / Banners

Placement: above the action bar, below the input zone. Stack if multiple active.

```css
.notice {
  border-left: 3px solid <accent-color>;
  background: var(--color-notice-bg);
  padding: 10px 14px;
  border-radius: 0 4px 4px 0;
  font: 13px IBM Plex Sans;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

PUA notice: `border-left-color: var(--color-notice-pua-border)`. Auto-dismisses after 5s.
Cap notice: `border-left-color: var(--color-notice-cap-border)`. Persists until input drops below cap.
Each has a `✕` close button (16px, 44px touch target).

### Privacy Badge Popover

Trigger: click or Enter/Space on the 🔒 badge.
Content: two lines + repo link.
Dimensions: max-width 240px. Style: white/dark bg, 1px border `var(--color-border)`, 4px radius, `box-shadow: 0 4px 12px rgba(0,0,0,0.1)`.
Dismiss: click outside, Escape, or ✕ button.
ARIA: `role="dialog"`, `aria-label="Privacy information"`, focus trap while open.

### Empty State

```
     [SVG: two overlapping pages, 32×32px, --color-border]

     Paste text in both boxes to see changes.
```

Centered in the output zone. SVG inline (no external request). Text: 14px IBM Plex Sans, `var(--color-border)`.

### Loading State (Worker path)

```
     [CSS spinner, 24px, --color-border, border-top: --color-text]
     Calculating changes...
```

Centered in the output zone. CSS-only animation, no JS library.

---

## Layout

### Desktop (≥1025px)

```
+--------------------------------------------------+ 48px
| Simplex            [Install App]  🔒 In browser  |
+------------------------+-------------------------+ 40vh
| Original               | Revised                 |
| [textarea]             | [textarea]              |
+------------------------+-------------------------+ 48px
| [Copy as HTML]  [Download .html]                 |
+--------------------------------------------------+ 40vh
| Diff output (scrollable, max-height 40vh)        |
| or empty state                                   |
+--------------------------------------------------+
```

### Tablet (641–1024px)

Same as desktop. Min textarea width: 280px.

### Phone (≤640px)

```
+--------------------------------------------------+
| Simplex                       🔒 In browser      |
+--------------------------------------------------+ 30vh
| Original [textarea, full width]                  |
+--------------------------------------------------+ 30vh
| Revised [textarea, full width]                   |
+--------------------------------------------------+ 48px
| [Copy]  [Download]                               |
+--------------------------------------------------+ 50vh
| Diff output (scrollable)                         |
+--------------------------------------------------+
```

On phone ≤360px wide: Copy and Download stack vertically in action bar.

---

## Accessibility

### Keyboard Navigation

Tab order (must match DOM order):
1. Original textarea
2. Revised textarea
3. Copy as HTML button
4. Download .html button
5. Privacy badge (focusable — Enter/Space opens popover)
6. Install App button (if visible)

Keyboard shortcut: `Cmd/Ctrl + Shift + C` → triggers Copy as HTML.
Tooltip on Copy button hover: "Cmd+Shift+C" (Mac) / "Ctrl+Shift+C" (Windows/Linux).

### Touch Targets

Minimum 44×44px for all interactive elements.

### ARIA

```html
<main>
  <section aria-label="Original text input">
    <label for="original">Original</label>
    <textarea id="original" ...>
  </section>
  <section aria-label="Revised text input">
    <label for="revised">Revised</label>
    <textarea id="revised" ...>
  </section>
  <div role="region" aria-label="Diff output" aria-live="polite">
    <!-- injected diff HTML — aria-live announces changes to screen readers -->
  </div>
</main>
```

Notices use `role="alert"` — announced immediately on appearance.

---

## PWA

- `manifest.json`: `display: standalone`, `start_url: /simplex-diff-checker/`, icons at 192×192 and 512×512
- `sw.js`: pre-cache all static assets on install, cache-first strategy
- `icons/`: 192×192 PNG, 512×512 PNG, 180×180 PNG (Apple touch icon)
- Apple meta tags in `<head>`: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
- Install App button in header: visible only when `beforeinstallprompt` fires (JS conditional); hidden if already installed or browser doesn't support

---

## Design Principles Applied

1. **App UI rules** (not landing page): calm surface, utility language, no decorative elements
2. **Document feel**: IBM Plex Mono for text content — feels like a precision tool, not a website
3. **Color never sole differentiator**: `<ins>` underlined, `<del>` strikethrough — accessible to color-blind users
4. **Trust at the pixel level**: privacy badge with verifiable popover, not just a label
5. **Subtraction default**: no sidebar, no nav, no footer, no marketing chrome — single task, single page
