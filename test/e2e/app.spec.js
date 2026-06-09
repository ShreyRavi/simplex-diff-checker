import { test, expect } from '@playwright/test';

// ── Privacy: zero network requests ────────────────────────────────────────
test('PRIVACY: zero external network requests during full session', async ({ page }) => {
  const requests = [];
  page.on('request', req => {
    const url = req.url();
    // Only flag requests that aren't to localhost
    if (!url.startsWith('http://localhost')) {
      requests.push(url);
    }
  });

  await page.goto('/');
  await page.fill('#original', 'The quick brown fox');
  await page.fill('#revised', 'The slow brown fox');

  // Wait for diff to render
  await expect(page.locator('#diff-output ins, #diff-output del').first()).toBeVisible();

  // Copy
  await page.click('#copy-btn');

  expect(requests).toHaveLength(0);
});

// ── Basic diff rendering ───────────────────────────────────────────────────
test('shows <ins> and <del> markup for changed words', async ({ page }) => {
  await page.goto('/');
  await page.fill('#original', 'The quick brown fox');
  await page.fill('#revised', 'The slow brown fox');

  await expect(page.locator('#diff-output ins')).toBeVisible();
  await expect(page.locator('#diff-output del')).toBeVisible();

  const insText = await page.locator('#diff-output ins').first().textContent();
  const delText = await page.locator('#diff-output del').first().textContent();
  expect(insText).toContain('slow');
  expect(delText).toContain('quick');
});

test('identical text → no ins/del markup', async ({ page }) => {
  await page.goto('/');
  await page.fill('#original', 'The quick brown fox');
  await page.fill('#revised', 'The quick brown fox');

  await page.waitForTimeout(300); // allow debounce

  const insCount = await page.locator('#diff-output ins').count();
  const delCount = await page.locator('#diff-output del').count();
  expect(insCount).toBe(0);
  expect(delCount).toBe(0);
});

test('empty both boxes → empty state shown', async ({ page }) => {
  await page.goto('/');

  const emptyState = page.locator('.empty-state');
  await expect(emptyState).toBeVisible();
  await expect(page.locator('#copy-btn')).toBeDisabled();
  await expect(page.locator('#download-btn')).toBeDisabled();
});

test('one box empty → shows diff (full content as addition or removal)', async ({ page }) => {
  await page.goto('/');
  await page.fill('#original', '');
  await page.fill('#revised', 'Hello world');

  await expect(page.locator('#diff-output ins')).toBeVisible();
  const insText = await page.locator('#diff-output ins').allTextContents();
  expect(insText.join('')).toContain('Hello');
});

// ── Action buttons ────────────────────────────────────────────────────────
test('Copy button disabled before diff, enabled after', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#copy-btn')).toBeDisabled();

  await page.fill('#original', 'before');
  await page.fill('#revised', 'after');
  await expect(page.locator('#diff-output ins, #diff-output del').first()).toBeVisible();

  await expect(page.locator('#copy-btn')).toBeEnabled();
});

test('Download button triggers file download', async ({ page }) => {
  await page.goto('/');
  await page.fill('#original', 'hello');
  await page.fill('#revised', 'world');
  await expect(page.locator('#diff-output del')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-btn'),
  ]);

  expect(download.suggestedFilename()).toBe('simplex-diff.html');
});

// ── Cap notice ────────────────────────────────────────────────────────────
test('200k+ char input → cap notice shown', async ({ page }) => {
  await page.goto('/');
  const big = 'word '.repeat(40001); // ~200005 chars
  await page.fill('#original', big);
  await page.fill('#revised', big + 'extra');

  await expect(page.locator('.notice-cap')).toBeVisible({ timeout: 5000 });
});

// ── Privacy popover ───────────────────────────────────────────────────────
test('privacy badge opens and closes popover', async ({ page }) => {
  await page.goto('/');

  const popover = page.locator('#privacy-popover');
  await expect(popover).toBeHidden();

  await page.click('#privacy-btn');
  await expect(popover).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
});

test('privacy popover contains GitHub link', async ({ page }) => {
  await page.goto('/');
  await page.click('#privacy-btn');

  const link = page.locator('#privacy-popover a');
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toContain('github.com');
});

// ── Keyboard shortcut ─────────────────────────────────────────────────────
test('Cmd+Shift+C triggers copy', async ({ page }) => {
  await page.goto('/');
  await page.fill('#original', 'old');
  await page.fill('#revised', 'new');
  await expect(page.locator('#diff-output ins')).toBeVisible();

  await page.keyboard.press('Meta+Shift+C');
  // Button should flash success
  await expect(page.locator('#copy-btn')).toContainText('Copied', { timeout: 2000 });
});

// ── Accessibility: ARIA labels ────────────────────────────────────────────
test('ARIA: output region has aria-live=polite', async ({ page }) => {
  await page.goto('/');
  const ariaLive = await page.locator('#diff-output').getAttribute('aria-live');
  expect(ariaLive).toBe('polite');
});

test('ARIA: textareas have associated labels', async ({ page }) => {
  await page.goto('/');
  const origLabel = await page.locator('label[for="original"]').textContent();
  const revLabel  = await page.locator('label[for="revised"]').textContent();
  expect(origLabel).toBeTruthy();
  expect(revLabel).toBeTruthy();
});

// ── HR workflow golden path ────────────────────────────────────────────────
test('HR workflow: realistic 500-word doc diff renders in <1000ms', async ({ page }) => {
  const original = `
    Position: Senior Software Engineer
    Location: San Francisco, CA
    Salary: $150,000 - $180,000

    We are looking for a Senior Software Engineer to join our growing team.
    The ideal candidate will have 5+ years of experience with distributed systems.
    You will be responsible for designing, building, and maintaining large-scale
    infrastructure that serves millions of users. Strong communication skills required.

    Requirements: Bachelor's degree in Computer Science or related field.
    Experience with Go, Python, or Java. Familiarity with Kubernetes and Docker.
    Strong problem-solving skills. Experience with SQL and NoSQL databases.
    Ability to work in a fast-paced environment. Excellent written communication.
  `.trim();

  const revised = `
    Position: Staff Software Engineer
    Location: Remote (US)
    Salary: $175,000 - $220,000

    We are looking for a Staff Software Engineer to join our growing platform team.
    The ideal candidate will have 7+ years of experience with distributed systems.
    You will be responsible for designing, building, and maintaining large-scale
    infrastructure that serves hundreds of millions of users. Leadership skills required.

    Requirements: Bachelor's degree in Computer Science or related field preferred.
    Experience with Go, Rust, Python, or Java. Familiarity with Kubernetes and Docker.
    Strong problem-solving skills and technical mentorship experience.
    Experience with SQL and NoSQL databases. Ability to thrive in a fast-paced environment.
  `.trim();

  await page.goto('/');

  const start = Date.now();
  await page.fill('#original', original);
  await page.fill('#revised', revised);
  await expect(page.locator('#diff-output ins, #diff-output del').first()).toBeVisible();
  const elapsed = Date.now() - start;

  expect(elapsed).toBeLessThan(1000);
  await expect(page.locator('#copy-btn')).toBeEnabled();
});
