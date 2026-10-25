import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const screenshotDir = process.env.SCREENSHOT_DIR || 'artifacts/source';
await fs.mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

function screenshotName(name) {
  return `${screenshotDir}/${name}.png`;
}

async function positions(rows) {
  const boxes = [];
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    boxes.push(await rows.nth(i).boundingBox());
  }
  return boxes;
}

function assertSameLine(a, b, message) {
  assert.ok(Math.abs(a.y - b.y) < 3, message);
}

function assertSameColumn(a, b, message) {
  assert.ok(Math.abs(a.x - b.x) < 3, message);
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1300 },
    deviceScaleFactor: 1
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(baseUrl).origin
  }).catch(() => {});
  const page = await context.newPage();
  const isProduction = new URL(baseUrl).hostname === 'backerfee.vercel.app';
  const fontResponses = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      fontResponses.push({ url: response.url(), status: response.status() });
    }
  });

  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.equal(response?.status(), 200, `App returned HTTP ${response?.status()}`);
  assert.equal(await page.locator('[role="dialog"], [aria-modal]').count(), 0,
    'No dialog or modal semantics should be present on initial page load');
  assert.doesNotMatch(await page.locator('body').innerText(), /Tampermonkey|Install Tampermonkey|Open Backer Fee on Minted/i,
    'No Tampermonkey installation or bridge instructions should appear on load');
  await page.waitForTimeout(5100);
  assert.equal(await page.locator('[role="dialog"], [aria-modal]').count(), 0,
    'No delayed onboarding dialog should appear after five seconds');
  assert.doesNotMatch(await page.locator('body').innerText(), /Tampermonkey|Install Tampermonkey|Open Backer Fee on Minted/i,
    'No delayed Tampermonkey or Minted bridge text should appear');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.equal(await page.locator('[role="dialog"], [aria-modal]').count(), 0,
    'Reload should not display a bridge dialog or modal');

  // Desktop Single-mode layout should place results after details and give the tax rate its own gap.
  const singleSpacing = await page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    };
    const details = bounds('.field-grid');
    const results = bounds('#results');
    const rate = bounds('.tax-rate-setting');
    return {
      detailsToResults: results.top - details.bottom,
      resultsToRate: rate.top - results.bottom
    };
  });
  assert.ok(singleSpacing.detailsToResults >= 8 && singleSpacing.detailsToResults <= 28,
    `Results should follow the detail fields with a deliberate gap, got ${singleSpacing.detailsToResults}px`);
  assert.ok(singleSpacing.resultsToRate >= 12 && singleSpacing.resultsToRate <= 28,
    `Tax rate should have a deliberate gap below results, got ${singleSpacing.resultsToRate}px`);

  // The same approval callout exists in Single and Batch modes.
  const callouts = page.locator('.adjustment-callout');
  assert.equal(await callouts.count(), 2, 'Single and Batch should share the same approval notice');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  const lightCalloutStyles = await callouts.evaluateAll((els) => els.map((el) => {
    const icon = el.querySelector('.adjustment-callout-icon');
    const style = getComputedStyle(el);
    const iconStyle = getComputedStyle(icon);
    return {
      background: style.backgroundColor,
      color: style.color,
      borderColor: style.borderTopColor,
      borderLeftWidth: style.borderLeftWidth,
      iconBackground: iconStyle.backgroundColor,
      iconColor: iconStyle.color,
      animationName: iconStyle.animationName
    };
  }));
  for (const styles of lightCalloutStyles) {
    assert.equal(styles.background, 'rgb(255, 241, 214)', 'Light callout should use a warm cream background');
    assert.equal(styles.color, 'rgb(122, 42, 5)', 'Light callout text should be dark brown');
    assert.equal(styles.borderColor, 'rgb(245, 158, 11)', 'Light callout should use an amber border');
    assert.equal(styles.borderLeftWidth, '8px', 'Light callout should have the thick amber left bar');
    assert.equal(styles.iconBackground, 'rgb(220, 38, 38)', 'Light callout icon should use red');
    assert.equal(styles.iconColor, 'rgb(255, 255, 255)', 'Light callout icon should have white text');
    assert.equal(styles.animationName, 'callout-pulse', 'Light callout icon should pulse');
  }

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const darkCalloutStyles = await callouts.evaluateAll((els) => els.map((el) => {
    const icon = el.querySelector('.adjustment-callout-icon');
    const style = getComputedStyle(el);
    const iconStyle = getComputedStyle(icon);
    return {
      backgroundImage: style.backgroundImage,
      color: style.color,
      borderColor: style.borderTopColor,
      iconBackground: iconStyle.backgroundColor,
      iconColor: iconStyle.color,
      animationName: iconStyle.animationName
    };
  }));
  for (const styles of darkCalloutStyles) {
    assert.ok(styles.backgroundImage.includes('linear-gradient'), 'Dark callout should use an amber-red gradient');
    assert.equal(styles.color, 'rgb(255, 243, 214)', 'Dark callout text should use warm white');
    assert.equal(styles.borderColor, 'rgb(251, 191, 36)', 'Dark callout should use a brighter amber border');
    assert.equal(styles.iconBackground, 'rgb(245, 158, 11)', 'Dark callout icon should use amber');
    assert.equal(styles.iconColor, 'rgb(31, 19, 0)', 'Dark callout icon should use dark text');
    assert.equal(styles.animationName, 'callout-pulse-dark', 'Dark callout icon should use the amber pulse');
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.adjustment-callout-icon').first().evaluate((el) => getComputedStyle(el).animationName),
    'none', 'Reduced-motion preference should disable the callout pulse');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length >= 2, null, { timeout: 15000 });

  // Batch Amount and Estimated tax are read-only displays; totals and copy require exact Minted confirmation.
  await page.locator('#modeBatchBtn').click();
  const draftRows = page.locator('#batchRows .batch-row');
  const invitationDraft = draftRows.nth(0);
  await invitationDraft.locator('.batch-name').fill('Invitation');
  await invitationDraft.locator('.batch-price').fill('50.55');
  await invitationDraft.locator('.batch-discount').fill('0');
  await invitationDraft.locator('.batch-adj-ship').fill('0');
  const draftAmount = invitationDraft.locator('.batch-adj-amount');
  const draftTax = invitationDraft.locator('.batch-adj-tax');
  assert.equal(await draftAmount.evaluate((el) => el.tagName), 'OUTPUT',
    'Batch Amount must be a plain output, not an input');
  assert.equal(await draftAmount.evaluate((el) => el.tagName === 'INPUT'), false, 'Batch Amount must not accept typing');
  assert.ok((await draftAmount.evaluate((el) => el.tabIndex)) < 0, 'Batch Amount must not be keyboard-focusable');
  assert.equal(await draftTax.evaluate((el) => el.tagName), 'OUTPUT',
    'Batch Estimated tax must be a plain output, not an input');
  assert.equal(await draftTax.evaluate((el) => el.tagName === 'INPUT'), false, 'Batch Estimated tax must not accept typing');
  assert.ok((await draftTax.evaluate((el) => el.tabIndex)) < 0, 'Batch Estimated tax must not be keyboard-focusable');
  assert.equal(await page.locator('#batchRows .adj-copy-btn[aria-label="Copy Amount"]').count(), 0,
    'No Amount Copy button may appear in Batch');
  assert.equal(await draftAmount.textContent(), '50.55');
  assert.equal(await draftTax.textContent(), '3.92');
  assert.equal(await invitationDraft.locator('.batch-adj-total').inputValue(), '54.47');
  assert.equal(await invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'Unconfirmed Batch totals must not be copyable');
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true,
    'Batch Copy Note must remain disabled until each row matches Minted');

  await invitationDraft.locator('.batch-adj-minted-total').fill('54.47');
  assert.equal(await invitationDraft.locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), false,
    'A cent-exact Batch total must enable Total Adjustment Copy');
  const confirmedBatchTotalCopy = invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await confirmedBatchTotalCopy.click();
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '54.47',
    'Confirmed Batch Total Adjustment Copy should copy a plain number');

  await invitationDraft.locator('.batch-adj-minted-total').fill('54.48');
  assert.match(await invitationDraft.locator('.batch-adj-total-check').innerText(),
    /Mismatch: app \$54\.47, Minted \$54\.48, difference \$0\.01/,
    'Batch should report a one-cent mismatch and the difference');
  assert.equal(await invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'A one-cent Batch mismatch must disable Total Adjustment Copy');
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true,
    'A one-cent Batch mismatch must block Copy Note');
  assert.match(await invitationDraft.locator('.batch-adj-total-check').innerText(), /adjust Tax rate %/,
    'A Batch mismatch with tax included must explain that the rate can be adjusted');

  // Include Tax off uses $0.00 tax and still requires an exact final-total match.
  await invitationDraft.locator('.batch-adj-ship').fill('5.00');
  await invitationDraft.locator('.batch-adj-use-tax').uncheck();
  assert.equal(await draftTax.textContent(), '0.00', 'Include Tax off must display zero tax');
  assert.equal(await invitationDraft.locator('.batch-adj-total').inputValue(), '55.55');
  assert.doesNotMatch(await invitationDraft.locator('.batch-adj-status').innerText(), /estimate/i,
    'Include Tax off must not show an estimate warning');
  await invitationDraft.locator('.batch-adj-minted-total').fill('55.55');
  assert.equal(await invitationDraft.locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), false);
  await invitationDraft.locator('.batch-adj-use-tax').check();
  await invitationDraft.locator('.batch-adj-ship').fill('0');
  await page.locator('#taxRate').fill('8');
  assert.equal(await draftTax.textContent(), '4.04', 'Changing Tax rate % should update Batch Estimated tax');
  assert.equal(await invitationDraft.locator('.batch-adj-total').inputValue(), '54.59');
  assert.equal(await invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'Changing the rate must invalidate an old total confirmation');
  await invitationDraft.locator('.batch-adj-minted-total').fill('54.59');
  assert.equal(await invitationDraft.locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  await page.locator('#taxRate').fill('7.75');
  assert.equal(await draftTax.textContent(), '3.92');
  assert.equal(await invitationDraft.locator('.batch-adj-total').inputValue(), '54.47');
  assert.match(await invitationDraft.locator('.batch-adj-total-check').innerText(), /Mismatch: app \$54\.47, Minted \$54\.59/);

  await page.locator('#taxRate').fill('0');
  assert.equal(await page.locator('#taxRate').getAttribute('aria-invalid'), 'true',
    'A zero rate should be rejected in Batch mode');
  assert.equal(await invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'Invalid tax rate must block Batch Total Adjustment Copy');
  assert.match(await invitationDraft.locator('.batch-adj-total-check').innerText(), /valid Tax rate %/,
    'Invalid rate feedback should explain why the total cannot be confirmed');
  await page.locator('#taxRate').evaluate((el) => el.blur());
  assert.equal(await page.locator('#taxRate').inputValue(), '7.75',
    'Invalid Batch rate should recover to the documented 7.75% default');
  await invitationDraft.locator('.batch-adj-minted-total').fill('54.47');
  assert.equal(await invitationDraft.locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await invitationDraft.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), false);

  await draftRows.nth(1).locator('.batch-name').fill('Draft RSVP');
  await draftRows.nth(1).locator('.batch-price').fill('100');
  await draftRows.nth(1).locator('.batch-discount').fill('20');
  await draftRows.nth(1).locator('.batch-adj-ship').fill('5.00');
  await draftRows.nth(1).locator('.batch-adj-use-tax').uncheck();
  await draftRows.nth(1).locator('.batch-adj-minted-total').fill('85.00');
  assert.equal(await draftRows.nth(1).locator('.batch-adj-total').inputValue(), '85.00');
  assert.equal(await draftRows.nth(1).locator('.batch-adj-total-check').innerText(), 'Matches Minted');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();
  const restoredDraftRows = page.locator('#batchRows .batch-row');
  assert.equal(await restoredDraftRows.count(), 2, 'Refresh should preserve the number of Batch rows');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-name').inputValue(), 'Invitation',
    'Refresh should restore each card name');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-price').inputValue()), 50.55);
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-discount').inputValue()), 0);
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-amount').textContent(), '50.55',
    'Refresh should recalculate the Amount display from the fee');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-tax').textContent(), '3.92',
    'Refresh should recalculate Estimated tax from Amount and Tax rate %');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-ship').inputValue()), 0,
    'Refresh should preserve Shipping Adjustment');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-subtotal').inputValue()), 54.47);
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 54.47);
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-minted-total').inputValue()), 54.47);
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await restoredDraftRows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), false);
  assert.ok((await page.locator('#batchNoteText').inputValue()).includes('"Invitation" cards: $54.47'),
    'The restored customer note should use the confirmed estimated total');
  assert.equal(await restoredDraftRows.nth(1).locator('.batch-adj-tax').textContent(), '0.00',
    'Restored Include Tax off should keep the tax display at zero');
  assert.equal(await restoredDraftRows.nth(1).locator('.batch-adj-use-tax').isChecked(), false);
  assert.equal(await restoredDraftRows.nth(1).locator('.batch-adj-total').inputValue(), '85.00');
  assert.equal(await restoredDraftRows.nth(1).locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false,
    'Every row has a matching total after the draft reload');

  // Reset opens a centered modal; closing it without confirmation leaves the current Batch data untouched.
  const resetButton = page.locator('#resetBtn');
  const resetModal = page.locator('#resetConfirmation');
  const beforeResetData = await page.evaluate(() => ({
    names: Array.from(document.querySelectorAll('#batchRows .batch-name')).map((el) => el.value),
    prices: Array.from(document.querySelectorAll('#batchRows .batch-price')).map((el) => el.value),
    discounts: Array.from(document.querySelectorAll('#batchRows .batch-discount')).map((el) => el.value),
    note: document.querySelector('#batchNoteText').value
  }));
  const layoutBeforeModal = await page.locator('.dashboard-card').boundingBox();
  await resetButton.click();
  assert.equal(await resetModal.isVisible(), true, 'Reset should open the modal');
  assert.equal(await resetModal.getAttribute('role'), 'dialog');
  assert.equal(await resetModal.getAttribute('aria-modal'), 'true');
  assert.equal(await resetModal.getAttribute('aria-labelledby'), 'resetConfirmTitle');
  assert.equal(await page.locator('[role="dialog"], [aria-modal]').count(), 1,
    'The Reset modal should be the only dialog while open');
  assert.equal(await page.locator('#cancelResetBtn').evaluate((el) => document.activeElement === el),
    true, 'Opening the modal should move focus to Cancel');
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('modal-open')), true,
    'Opening the modal should lock background scrolling');
  assert.equal(await page.locator('.page-shell').evaluate((el) => el.inert), true,
    'The page behind the modal should be inert while open');
  const modalCss = await resetModal.evaluate((el) => ({
    position: getComputedStyle(el).position,
    backdropDisplay: getComputedStyle(el).display,
    panelPosition: getComputedStyle(el.querySelector('.reset-modal')).position
  }));
  assert.equal(modalCss.position, 'fixed', 'Modal backdrop should be fixed to the viewport');
  const layoutWhileModal = await page.locator('.dashboard-card').boundingBox();
  assert.ok(Math.abs(layoutBeforeModal.y - layoutWhileModal.y) < 1 &&
    Math.abs(layoutBeforeModal.height - layoutWhileModal.height) < 1,
    'Opening Reset should not shift the page layout');

  await page.locator('#cancelResetBtn').press('Shift+Tab');
  assert.equal(await page.locator('#confirmResetBtn').evaluate((el) => document.activeElement === el),
    true, 'Shift+Tab from Cancel should wrap to Confirm reset');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#cancelResetBtn').evaluate((el) => document.activeElement === el),
    true, 'Tab from Confirm reset should wrap to Cancel');

  await page.locator('#cancelResetBtn').click();
  assert.equal(await resetModal.isVisible(), false, 'Cancel should close the modal');
  assert.equal(await resetModal.getAttribute('role'), null, 'Dialog role should be removed on close');
  assert.equal(await resetModal.getAttribute('aria-modal'), null, 'aria-modal should be removed on close');
  assert.equal(await resetModal.getAttribute('aria-labelledby'), null, 'aria-labelledby should be removed on close');
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('modal-open')), false,
    'Closing the modal should unlock background scrolling');
  assert.equal(await page.locator('.page-shell').evaluate((el) => el.inert), false);
  assert.equal(await resetButton.evaluate((el) => document.activeElement === el), true,
    'Closing Reset should return focus to the Reset button');

  const assertBatchDataIntact = async (reason) => {
    const current = await page.evaluate(() => ({
      names: Array.from(document.querySelectorAll('#batchRows .batch-name')).map((el) => el.value),
      prices: Array.from(document.querySelectorAll('#batchRows .batch-price')).map((el) => el.value),
      discounts: Array.from(document.querySelectorAll('#batchRows .batch-discount')).map((el) => el.value),
      note: document.querySelector('#batchNoteText').value
    }));
    assert.deepEqual(current, beforeResetData, reason);
  };
  await assertBatchDataIntact('Cancel must preserve every Batch field and the generated note');

  await resetButton.click();
  await resetModal.click({ position: { x: 4, y: 4 } });
  assert.equal(await resetModal.isVisible(), false, 'Clicking the backdrop should close the modal');
  assert.equal(await resetButton.evaluate((el) => document.activeElement === el), true,
    'Backdrop close should return focus to Reset');
  await assertBatchDataIntact('Backdrop close must preserve Batch data');

  await page.locator('#batchRows .batch-price').first().focus();
  await page.keyboard.press('Escape');
  assert.equal(await resetModal.isVisible(), true, 'Escape from the page should open Reset');
  assert.equal(await page.locator('#cancelResetBtn').evaluate((el) => document.activeElement === el), true);
  await page.keyboard.press('Escape');
  assert.equal(await resetModal.isVisible(), false, 'Escape while the modal is open should close it, not reset');
  await assertBatchDataIntact('Escape close must preserve Batch data');
  assert.equal(await resetButton.evaluate((el) => document.activeElement === el), true);

  await page.setViewportSize({ width: 320, height: 900 });
  await resetButton.click();
  const narrowModalBox = await page.locator('.reset-modal').boundingBox();
  const narrowModalMetrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    backdrop: (() => { const r = document.querySelector('#resetConfirmation').getBoundingClientRect(); return { left: r.left, right: r.right }; })(),
    panel: (() => { const r = document.querySelector('.reset-modal').getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; })(),
    buttons: Array.from(document.querySelectorAll('.reset-modal-actions button')).map((el) => {
      const r = el.getBoundingClientRect(); return { left: r.left, right: r.right };
    })
  }));
  assert.ok(narrowModalBox && narrowModalBox.width <= 296,
    'Reset modal should fit within 320px with surrounding padding');
  assert.ok(narrowModalMetrics.panel.left >= 0 && narrowModalMetrics.panel.right <= 320,
    'Reset modal panel must stay inside the 320px viewport');
  assert.ok(narrowModalMetrics.buttons.every((box) => box.left >= narrowModalMetrics.panel.left && box.right <= narrowModalMetrics.panel.right),
    'Cancel and Confirm reset must fit inside the 320px modal');
  assert.ok(narrowModalMetrics.document <= narrowModalMetrics.viewport + 1,
    'Reset modal must not cause horizontal overflow at 320px');
  await page.keyboard.press('Escape');
  assert.equal(await resetModal.isVisible(), false, 'Reset modal should close with Escape at 320px');
  await page.setViewportSize({ width: 1440, height: 1300 });

  await resetButton.click();
  await page.locator('#confirmResetBtn').click();
  assert.equal(await resetModal.isVisible(), false, 'Confirm reset should close the modal');
  assert.equal(await page.locator('[role="dialog"], [aria-modal]').count(), 0,
    'No dialog semantics should remain after closing');
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('modal-open')), false);
  assert.equal(await resetButton.evaluate((el) => document.activeElement === el), true,
    'Confirm reset should return focus to Reset');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();
  const resetRows = page.locator('#batchRows .batch-row');
  assert.equal(await resetRows.count(), 2, 'Reset should leave the default two empty rows');
  assert.equal(await resetRows.nth(0).locator('.batch-name').inputValue(), '', 'Reset should clear saved card names');
  assert.equal(await resetRows.nth(0).locator('.batch-price').inputValue(), '', 'Reset should clear saved prices');
  assert.equal(await resetRows.nth(0).locator('.batch-discount').inputValue(), '', 'Reset should clear saved discounts');
  assert.deepEqual(await resetRows.locator('.batch-name').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Reset should clear names in every Batch row');
  assert.equal(await resetRows.count(), 2, 'Reset should leave the default two empty rows');
  assert.equal(await resetRows.nth(0).locator('.batch-name').inputValue(), '', 'Reset should clear saved card names');
  assert.equal(await resetRows.nth(0).locator('.batch-price').inputValue(), '', 'Reset should clear saved prices');
  assert.equal(await resetRows.nth(0).locator('.batch-discount').inputValue(), '', 'Reset should clear saved discounts');
  assert.deepEqual(await resetRows.locator('.batch-name').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Reset should clear names in every Batch row');
  assert.deepEqual(await resetRows.locator('.batch-price').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Reset should clear prices in every Batch row');
  assert.deepEqual(await resetRows.locator('.batch-discount').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Reset should clear discounts in every Batch row');
  assert.deepEqual(await resetRows.locator('.batch-adj-tax').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Reset should clear the Estimated tax output in every empty Batch row');
  assert.deepEqual(await resetRows.locator('.batch-adj-use-tax').evaluateAll((els) => els.map((el) => el.checked)), [true, true],
    'Reset should restore Include Tax checked in empty Batch rows');
  assert.equal(await page.locator('#batchNoteState').innerText(), 'Waiting for valid details',
    'Reset should clear the generated customer note');

  // Adding a row preserves the exact row count after refresh.
  await resetRows.nth(0).locator('.batch-name').fill('Keep first');
  await resetRows.nth(0).locator('.batch-price').fill('50');
  await resetRows.nth(0).locator('.batch-discount').fill('15');
  await resetRows.nth(1).locator('.batch-name').fill('Delete me');
  await resetRows.nth(1).locator('.batch-price').fill('100');
  await resetRows.nth(1).locator('.batch-discount').fill('20');
  await page.locator('#addBatchRowBtn').click();
  const threeDraftRows = page.locator('#batchRows .batch-row');
  await threeDraftRows.nth(2).locator('.batch-name').fill('Keep third');
  await threeDraftRows.nth(2).locator('.batch-price').fill('75');
  await threeDraftRows.nth(2).locator('.batch-discount').fill('10');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 3, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();
  const afterAddRows = page.locator('#batchRows .batch-row');
  assert.equal(await afterAddRows.count(), 3, 'A newly added third row should survive refresh');
  assert.equal(await afterAddRows.nth(2).locator('.batch-name').inputValue(), 'Keep third',
    'The added row data should survive refresh');

  // Removing a row also persists, without restoring the removed entry.
  await afterAddRows.nth(1).locator('.batch-remove').click();
  assert.equal(await page.locator('#batchRows .batch-row').count(), 2, 'Removing one of three rows should leave two');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();
  const afterRemoveRows = page.locator('#batchRows .batch-row');
  assert.deepEqual(await afterRemoveRows.locator('.batch-name').evaluateAll((els) => els.map((el) => el.value)),
    ['Keep first', 'Keep third'], 'Refresh should not bring back the removed row');

  // Single-mode settings persist separately from Batch draft data.
  await page.locator('#modeSingleBtn').click();
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('20');
  await page.locator('#adjShip').fill('2.00');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  assert.equal(Number(await page.locator('#backer').inputValue()), 100, 'Single original price should restore after refresh');
  assert.equal(await page.locator('#discount').inputValue(), '20', 'Single discount should restore after refresh');
  assert.equal(Number(await page.locator('#adjShip').inputValue()), 2, 'Single Shipping Adjustment should restore separately');
  await page.locator('#modeBatchBtn').click();
  const afterSingleRestoreRows = page.locator('#batchRows .batch-row');
  assert.deepEqual(await afterSingleRestoreRows.locator('.batch-name').evaluateAll((els) => els.map((el) => el.value)),
    ['Keep first', 'Keep third'], 'Restoring Single mode must not overwrite the saved Batch draft');

  // Invalid saved data must be discarded without breaking page startup.
  const errorsBeforeBadDraft = errors.length;
  await page.evaluate(() => localStorage.setItem('backerfee-batch-draft-v1', 'garbage'));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();
  const afterBadDraftRows = page.locator('#batchRows .batch-row');
  assert.equal(await afterBadDraftRows.count(), 2, 'Invalid saved data should fall back to two empty rows');
  assert.equal(await afterBadDraftRows.nth(0).locator('.batch-name').inputValue(), '',
    'Invalid saved data should not restore old names');
  assert.equal(await afterBadDraftRows.nth(0).locator('.batch-price').inputValue(), '',
    'Invalid saved data should not restore old prices');
  assert.deepEqual(await afterBadDraftRows.locator('.batch-name').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Invalid saved data should produce empty names in every row');
  assert.deepEqual(await afterBadDraftRows.locator('.batch-price').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Invalid saved data should produce empty prices in every row');
  assert.deepEqual(await afterBadDraftRows.locator('.batch-discount').evaluateAll((els) => els.map((el) => el.value)), ['', ''],
    'Invalid saved data should produce empty discounts in every row');
  assert.equal(await page.locator('#batchNoteState').innerText(), 'Waiting for valid details',
    'Invalid saved data should not break note initialization');
  assert.equal(errors.length, errorsBeforeBadDraft, 'Invalid saved data should not create a browser runtime error');
  const repairedDraft = await page.evaluate(() => {
    try { return Array.isArray(JSON.parse(localStorage.getItem('backerfee-batch-draft-v1'))); }
    catch (_) { return false; }
  });
  assert.equal(repairedDraft, true, 'The malformed draft should be replaced by valid saved data');

  // An unnamed card's warning and generated note survive refresh.
  await afterBadDraftRows.nth(0).locator('.batch-price').fill('50');
  await afterBadDraftRows.nth(0).locator('.batch-discount').fill('15');
  assert.equal(await page.locator('#batchNoteState').innerText(), '1 card name missing',
    'A calculated card with no name should show the missing-name warning');
  assert.match(await page.locator('#batchNoteText').inputValue(), /"Card 1" cards: \$45\.79/,
    'The generated note should include the fallback card name and recomputed Total');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();
  assert.equal(await page.locator('#batchNoteState').innerText(), '1 card name missing',
    'The missing-name warning should return after refresh');
  assert.equal(await page.locator('#batchRows .batch-row').first().locator('.batch-name').evaluate((el) =>
    el.classList.contains('needs-name')), true, 'The restored unnamed card should be highlighted');
  assert.match(await page.locator('#batchNoteText').inputValue(), /"Card 1" cards: \$45\.79/,
    'The restored note should contain the recomputed fee after refresh');

  // Keep the rest of the layout suite's state clean.
  await page.evaluate(() => {
    localStorage.removeItem('backerfee-batch-draft-v1');
    localStorage.removeItem('backerfee-settings-v3');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });

  if (isProduction) {
    for (const path of ['mascots/afro-directions.webp', 'mascots/afro-reactions.webp']) {
      const asset = await page.request.get(new URL(path, baseUrl).toString(), { timeout: 20000 });
      assert.equal(asset.status(), 200, `Production mascot asset should load: ${path}`);
      assert.match(asset.headers()['content-type'] || '', /image\/webp/i,
        `Production mascot asset should be served as WebP: ${path}`);
      assert.ok((await asset.body()).byteLength > 1000, `Production mascot asset should not be empty: ${path}`);
    }
    await page.evaluate(() => document.fonts.ready);
    const loadedPoppins = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => /Poppins/i.test(face.family))
        .map((face) => ({ family: face.family, status: face.status }))
    );
    assert.ok(fontResponses.some((item) => item.url.includes('fonts.googleapis.com') && item.status === 200),
      'Production Google Fonts stylesheet should load successfully');
    assert.ok(fontResponses.some((item) => item.url.includes('fonts.gstatic.com') && item.status === 200),
      'Production Poppins font file should load successfully');
    assert.ok(loadedPoppins.some((face) => face.status === 'loaded'),
      `Production Poppins font face should finish loading: ${JSON.stringify(loadedPoppins)}`);
  }

  // Invalid values show the error immediately, but only shake on blur.
  const singlePrice = page.locator('#backer');
  await singlePrice.fill('12.345');
  assert.equal(await singlePrice.getAttribute('aria-invalid'), 'true',
    'Invalid Single price should remain identified accessibly while typing');
  assert.ok((await page.locator('#backerError').textContent()).trim(),
    'The invalid-price message should appear before blur');
  assert.equal(await singlePrice.evaluate((el) => el.classList.contains('is-shaking')), false,
    'Invalid Single price must not shake during typing');
  await singlePrice.evaluate((el) => el.blur());
  assert.equal(await singlePrice.evaluate((el) => el.classList.contains('is-shaking')), true,
    'Invalid Single price should shake when it loses focus');
  await singlePrice.fill('100');
  await page.locator('#discount').fill('20');
  assert.equal(await page.locator('#result').textContent(), '$20.00',
    'Discount Amount text should update immediately without waiting for animation');
  assert.equal(await page.locator('#total').textContent(), '$80.00',
    'Final Backer Fee text should update immediately without waiting for animation');
  assert.equal(await page.locator('#result .t-digit-group').count(), 0,
    'Discount Amount should not animate while input changes are in the debounce window');
  assert.equal(await page.locator('#total .t-digit-group').count(), 0,
    'Final Backer Fee should not animate while input changes are in the debounce window');
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.20',
    'Total Adjustment should update immediately while its pop-in waits for a pause');
  assert.equal(await page.locator('#adjTotal').evaluate((el) => el.classList.contains('t-number-field-pop')), false,
    'Total Adjustment should not pop while input changes are still arriving');
  await page.waitForTimeout(240);
  assert.ok(await page.locator('#result .t-digit-group').count(),
    'Discount Amount should animate after the typing pause');
  assert.ok(await page.locator('#total .t-digit-group').count(),
    'Final Backer Fee should animate after the typing pause');
  assert.equal(await page.locator('#adjTotal').evaluate((el) => el.classList.contains('t-number-field-pop')), true,
    'Total Adjustment input should pop after the typing pause');
  await page.waitForTimeout(400);

  // Rapid changes produce at most one pop-in per visible amount.
  await page.evaluate(() => {
    const counts = { result: 0, total: 0, adjustment: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1 || !node.matches('.t-digit-group.is-animating')) continue;
            if (record.target.id === 'result') counts.result += 1;
            if (record.target.id === 'total') counts.total += 1;
          }
        }
      }
    });
    observer.observe(document.querySelector('#results'), {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true
    });
    document.querySelector('#adjTotal').addEventListener('animationstart', (event) => {
      if (event.animationName === 't-digit-pop-in') counts.adjustment += 1;
    });
    window.__singleMotionCounts = counts;
    window.__singleMotionObserver = observer;
  });
  await singlePrice.focus();
  await singlePrice.press('Control+A');
  await singlePrice.pressSequentially('12345', { delay: 20 });
  assert.equal(await page.locator('#result').textContent(), '$2,469.00',
    'Discount Amount should recalculate live during a rapid five-digit price entry');
  assert.equal(await page.locator('#total').textContent(), '$9,876.00',
    'Final Backer Fee should recalculate live during a rapid five-digit price entry');
  assert.equal(await page.locator('#result .t-digit-group').count(), 0,
    'Discount Amount stays unwrapped during rapid typing');
  assert.equal(await page.locator('#total .t-digit-group').count(), 0,
    'Final Backer Fee stays unwrapped during rapid typing');
  await page.waitForFunction(() => {
    const counts = window.__singleMotionCounts;
    return counts?.result === 1 && counts?.total === 1 && counts?.adjustment === 1;
  }, null, { timeout: 1500 });
  const singleMotionCounts = await page.evaluate(() => {
    window.__singleMotionObserver.disconnect();
    return { ...window.__singleMotionCounts };
  });
  assert.deepEqual(singleMotionCounts, { result: 1, total: 1, adjustment: 1 },
    'Five quick digits should cause one animation per Single result after the pause: ' + JSON.stringify(singleMotionCounts));

  await singlePrice.fill('100');
  await page.locator('#discount').fill('20');
  await page.waitForTimeout(240);
  // Guard against digit spans being restyled as the result label and making the boxes multi-line.
  await page.waitForTimeout(360);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const singleResultMetrics = {};
  for (const selector of ['#result', '#total']) {
    singleResultMetrics[selector] = await page.locator(selector).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const styles = getComputedStyle(el);
      const group = el.querySelector('.t-digit-group');
      const digit = el.querySelector('.t-digit');
      const groupStyles = group ? getComputedStyle(group) : null;
      const digitStyles = digit ? getComputedStyle(digit) : null;
      return {
        height: rect.height,
        fontSize: parseFloat(styles.fontSize),
        lineHeight: styles.lineHeight,
        whiteSpace: styles.whiteSpace,
        text: el.textContent,
        groupDisplay: groupStyles?.display,
        digitDisplay: digitStyles?.display,
        digitFontSize: digitStyles?.fontSize,
        digitColor: digitStyles?.color,
        digitWebkitTextFillColor: digitStyles?.webkitTextFillColor,
        digitBackgroundImage: digitStyles?.backgroundImage,
        parentBackgroundImage: styles.backgroundImage,
        parentColor: styles.color,
        parentWebkitTextFillColor: styles.webkitTextFillColor
      };
    });
    const metrics = singleResultMetrics[selector];
    assert.ok(metrics.height <= Math.max(metrics.fontSize * 1.8, 48),
      `${selector} should remain one line tall, got ${JSON.stringify(metrics)}`);
    assert.equal(metrics.whiteSpace, 'nowrap', `${selector} must prevent animated digits from wrapping`);
    assert.equal(metrics.groupDisplay, 'inline-block', `${selector} digit group should stay inline`);
    assert.equal(metrics.digitDisplay, 'inline-block', `${selector} digits should override the generic result label span rule`);
    assert.equal(metrics.digitFontSize, metrics.fontSize + 'px',
      `${selector} digits should inherit the full-sized amount font`);
  }
  assert.equal(singleResultMetrics['#total'].parentBackgroundImage, 'none',
    'Final Backer Fee should use a solid fill rather than a clipped gradient');
  assert.equal(singleResultMetrics['#total'].parentWebkitTextFillColor, 'rgb(251, 233, 255)',
    'Final Backer Fee text fill should be visibly lavender, not transparent');
  assert.equal(singleResultMetrics['#total'].parentColor, 'rgb(251, 233, 255)',
    'Final Backer Fee should have a visible solid text color');
  assert.equal(singleResultMetrics['#total'].digitColor, 'rgb(251, 233, 255)',
    'Animated Final Backer Fee digits should inherit the visible solid text color');
  assert.equal(singleResultMetrics['#total'].digitWebkitTextFillColor, 'rgb(251, 233, 255)',
    'Animated Final Backer Fee digits must not use transparent text fill');
  assert.equal(singleResultMetrics['#total'].digitBackgroundImage, 'none',
    'Animated Final Backer Fee digits should not depend on the parent gradient background');
  await page.screenshot({ path: screenshotName('single-mode-digit-layout-dark'), fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.20',
    'Total Adjustment value and tax math must remain unchanged');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#discount').fill('25');
  assert.equal((await page.locator('#total').innerText()).replace(/\\s+/g, ''), '$75.00',
    'Reduced-motion calculation should still update the final fee');
  assert.equal(await page.locator('#total .t-digit-group').count(), 0,
    'Reduced-motion preference should bypass digit animations');
  assert.equal(await page.locator('#adjTotal').evaluate((el) => el.classList.contains('t-number-field-pop')), false,
    'Reduced-motion preference should bypass Total Adjustment pop-in');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#discount').fill('20');

  // Switch to Batch, add rows 3 and 4, and fill distinct values in all rows.
  await page.locator('#modeBatchBtn').click();
  await page.waitForFunction(() => !document.querySelector('#batchPanel').hidden);
  assert.equal(await page.locator('.dashboard-card').getAttribute('data-open'), 'true',
    'Dashboard panel should be open after switching to Batch');
  assert.ok((await page.locator('.dashboard-card').evaluate((el) => getComputedStyle(el).transitionDuration)).includes('0.3s'),
    'Dashboard panel reveal should keep its configured motion duration');
  await page.locator('#addBatchRowBtn').click();
  await page.locator('#addBatchRowBtn').click();

  const rows = page.locator('#batchRows .batch-row');
  assert.equal(await rows.count(), 4, 'Batch should have four rows after adding two');

  assert.equal(await rows.locator('.adj-copy-btn[aria-label="Copy Amount"]').count(), 0,
    'Batch must not render an Amount Copy button');
  for (let i = 0; i < await rows.count(); i += 1) {
    const amountOutput = rows.nth(i).locator('.batch-adj-amount');
    const taxOutput = rows.nth(i).locator('.batch-adj-tax');
    assert.equal(await amountOutput.evaluate((el) => el.tagName), 'OUTPUT', 'Batch Amount must be a plain display');
    assert.equal(await amountOutput.evaluate((el) => el.tagName === 'INPUT'), false, 'Batch Amount must not accept typing');
    assert.ok((await amountOutput.evaluate((el) => el.tabIndex)) < 0, 'Batch Amount must not be focusable');
    assert.equal(await taxOutput.evaluate((el) => el.tagName), 'OUTPUT', 'Batch tax must be a plain display');
    assert.equal(await taxOutput.evaluate((el) => el.tagName === 'INPUT'), false, 'Batch tax must not accept typing');
    assert.ok((await taxOutput.evaluate((el) => el.tabIndex)) < 0, 'Batch tax must not be focusable');
  }

  const prices = ['100', '200', '300', '400'];
  const discounts = ['10', '20', '30', '40'];
  const expectedFinalFees = ['90.00', '160.00', '210.00', '240.00'];

  for (let i = 0; i < 4; i += 1) {
    const row = rows.nth(i);
    await row.locator('.batch-name').fill(`Row ${i + 1}`);
    const rowPrice = row.locator('.batch-price');
    await rowPrice.fill(prices[i]);
    assert.equal(await rowPrice.evaluate((el) => document.activeElement === el), true,
      `Row ${i + 1} price should retain focus while recalculating`);
    const rowDiscount = row.locator('.batch-discount');
    await rowDiscount.fill(discounts[i]);
    assert.equal(await rowDiscount.evaluate((el) => document.activeElement === el), true,
      `Row ${i + 1} discount should retain focus while recalculating`);
    assert.equal(await row.locator('.batch-result-final').textContent(), `$${expectedFinalFees[i]}`,
      `Row ${i + 1} should calculate its own final fee`);
    assert.equal(await row.locator('.batch-adj-amount').textContent(), expectedFinalFees[i],
      `Row ${i + 1} Amount should follow its own final fee`);
  }

  // Batch field errors are live, but shaking is reserved for blur.
  const secondRowPrice = rows.nth(1).locator('.batch-price');
  await secondRowPrice.fill('12.345');
  assert.equal(await secondRowPrice.getAttribute('aria-invalid'), 'true',
    'Invalid Batch price should be identified while typing');
  assert.ok((await rows.nth(1).locator('.batch-error').textContent()).trim(),
    'Batch price error message should appear before blur');
  assert.equal(await secondRowPrice.evaluate((el) => el.classList.contains('is-shaking')), false,
    'Invalid Batch price must not shake during typing');
  await secondRowPrice.evaluate((el) => el.blur());
  assert.equal(await secondRowPrice.evaluate((el) => el.classList.contains('is-shaking')), true,
    'Invalid Batch price should shake on blur');
  await secondRowPrice.fill('200');
  await secondRowPrice.evaluate((el) => el.blur());
  assert.equal(await rows.nth(1).locator('.batch-result-final').textContent(), '$160.00',
    'Batch price validation should recover and recalculate after correction');

  let boxes = await positions(rows);
  assertSameLine(boxes[0], boxes[1], 'Rows 1 and 2 should be on the top line');
  assert.ok(boxes[1].x > boxes[0].x + 100, 'Row 2 should sit to the right of row 1');
  assert.ok(boxes[2].y > boxes[0].y + 20, 'Row 3 should be below row 1');
  assertSameColumn(boxes[0], boxes[2], 'Row 3 should start the next line in the left column');
  assertSameColumn(boxes[1], boxes[3], 'Row 4 should be in the right column below row 2');

  await page.screenshot({ path: screenshotName('desktop-1440-four-rows'), fullPage: true });

  // Financial Adjustment: three fields on each line at desktop width.
  const adjustmentFields = rows.nth(0).locator('.batch-adjust-grid .batch-adj-field');
  assert.equal(await adjustmentFields.count(), 6);
  const adjustmentBoxes = await positions(adjustmentFields);
  assertSameLine(adjustmentBoxes[0], adjustmentBoxes[1], 'Amount and Tax should share the first adjustment line');
  assertSameLine(adjustmentBoxes[1], adjustmentBoxes[2], 'Tax and Subtotal should share the first adjustment line');
  assert.ok(adjustmentBoxes[3].y > adjustmentBoxes[2].y + 10, 'Shipping should begin the second adjustment line');
  assertSameLine(adjustmentBoxes[3], adjustmentBoxes[4], 'Shipping and Total should share the second adjustment line');
  assertSameLine(adjustmentBoxes[4], adjustmentBoxes[5], 'Total from Minted should share the second adjustment line');
  for (let i = 0; i < 6; i += 1) {
    const valueBox = await adjustmentFields.nth(i).locator('.input-wrap').boundingBox();
    assert.ok(valueBox && valueBox.width >= 48, `Adjustment field ${i + 1} needs a usable value area`);
  }
  for (const index of [0, 1, 2]) {
    const labelHeight = await adjustmentFields.nth(index).locator('.batch-adj-label').evaluate((el) => getComputedStyle(el).minHeight);
    assert.equal(labelHeight, '36px',
      `Top-line Batch adjustment label ${index + 1} should share a 36px minimum height`);
  }
  const topLineInputBoxes = await Promise.all([0, 1, 2].map(async (index) =>
    adjustmentFields.nth(index).locator('.input-wrap').boundingBox()));
  assert.ok(topLineInputBoxes.every(Boolean), 'Amount, Estimated tax, and Subtotal displays should have layout boxes');
  const topLineInputY = topLineInputBoxes.map((box) => box.y);
  assert.ok(Math.max(...topLineInputY) - Math.min(...topLineInputY) <= 1,
    `Amount, Estimated tax, and Subtotal values should align on one line (y=${topLineInputY.join(', ')})`);
  for (const index of [3, 4, 5]) {
    const labelHeight = await adjustmentFields.nth(index).locator('.batch-adj-label').evaluate((el) => getComputedStyle(el).minHeight);
    assert.equal(labelHeight, '40px',
      `Batch second-line field ${index + 1} should reserve the shared 40px label height`);
  }
  const secondLineInputBoxes = await Promise.all([3, 4, 5].map(async (index) =>
    adjustmentFields.nth(index).locator('.input-wrap').boundingBox()));
  assert.ok(secondLineInputBoxes.every(Boolean), 'Shipping, Total Adjustment, and Total from Minted values should have layout boxes');
  assert.ok(Math.max(...secondLineInputBoxes.map((box) => box.y)) - Math.min(...secondLineInputBoxes.map((box) => box.y)) <= 1,
    `Batch second-line inputs should align at the same height (boxes=${JSON.stringify(secondLineInputBoxes)})`);
  const taxLabel = adjustmentFields.nth(1).locator('.batch-adj-label');
  assert.ok(await taxLabel.isVisible(), 'Tax label and checkbox row should remain visible');
  assert.ok(await taxLabel.locator('.adj-check input').isVisible(), 'Include Tax checkbox should remain visible');
  const taxLabelBox = await taxLabel.boundingBox();
  const adjustmentBox = await rows.nth(0).locator('.batch-adjust').boundingBox();
  assert.ok(taxLabelBox && adjustmentBox &&
    taxLabelBox.x >= adjustmentBox.x - 1 &&
    taxLabelBox.x + taxLabelBox.width <= adjustmentBox.x + adjustmentBox.width + 1,
  'Tax label should stay inside the Financial Adjustment box');

  // Rapid five-digit typing in Batch remains live and debounces every amount's animation.
  const firstRow = rows.nth(0);
  const firstPrice = firstRow.locator('.batch-price');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const counts = { discount: 0, fee: 0, adjustment: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1 || !node.matches('.t-digit-group.is-animating')) continue;
            if (record.target.matches('.batch-result:not(.batch-result-final)')) counts.discount += 1;
            if (record.target.matches('.batch-result-final')) counts.fee += 1;
          }
        }
      }
    });
    observer.observe(document.querySelector('#batchRows'), {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true
    });
    document.querySelector('#batchRows .batch-adj-total').addEventListener('animationstart', (event) => {
      if (event.animationName === 't-digit-pop-in') counts.adjustment += 1;
    });
    window.__batchMotionCounts = counts;
    window.__batchMotionObserver = observer;
  });
  await firstPrice.focus();
  await firstPrice.press('Control+A');
  await firstPrice.pressSequentially('12345', { delay: 20 });
  assert.equal(await firstPrice.inputValue(), '12345', 'Typing should not lose or reorder characters');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#batchRows .batch-row:first-child .batch-price')),
    true, 'The price input should keep focus during recalculation');
  assert.equal(await firstRow.locator('.batch-result-final').textContent(), '$11,110.50',
    'Batch Final Fee should recalculate live during rapid typing');
  assert.equal(await firstRow.locator('.batch-result .t-digit-group').count(), 0,
    'Batch Discount Amount should remain unwrapped while typing');
  assert.equal(await firstRow.locator('.batch-result-final .t-digit-group').count(), 0,
    'Batch Final Fee should remain unwrapped while typing');
  await page.waitForFunction(() => {
    const counts = window.__batchMotionCounts;
    return counts?.discount === 1 && counts?.fee === 1 && counts?.adjustment === 1;
  }, null, { timeout: 1500 });
  const batchMotionCounts = await page.evaluate(() => {
    window.__batchMotionObserver.disconnect();
    return { ...window.__batchMotionCounts };
  });
  assert.deepEqual(batchMotionCounts, { discount: 1, fee: 1, adjustment: 1 },
    'Five quick digits should cause one animation per Batch result after the pause: ' + JSON.stringify(batchMotionCounts));

  // Amount and Estimated tax are displays. Only Shipping Adjustment and Tax rate % are editable.
  await firstPrice.fill('100');
  await rows.nth(0).locator('.batch-discount').fill('10');
  const rowOneAmount = rows.nth(0).locator('.batch-adj-amount');
  assert.equal(await rowOneAmount.textContent(), '90.00');
  assert.equal(await rowOneAmount.evaluate((el) => el.tagName), 'OUTPUT');
  assert.equal(await rowOneAmount.evaluate((el) => el.tagName === 'INPUT'), false);
  const rowOneShipping = rows.nth(0).locator('.batch-adj-ship');
  await rowOneShipping.fill('3.50');
  assert.equal(await rowOneShipping.evaluate((el) => document.activeElement === el), true,
    'Shipping Adjustment should remain editable and retain focus while recalculating');
  assert.equal(await rowOneAmount.textContent(), '90.00');
  assert.equal(await rows.nth(0).locator('.batch-adj-tax').textContent(), '6.98');
  assert.equal(await rows.nth(0).locator('.batch-adj-total').inputValue(), '100.48',
    'Row 1 total should calculate from its displayed Amount, rate-based tax, and shipping');
  assert.equal(await rows.nth(1).locator('.batch-adj-amount').textContent(), '160.00',
    'Editing row 1 must not change row 2 Amount');

  const note = page.locator('#batchNoteText');
  let noteText = await note.inputValue();
  for (let i = 1; i <= 4; i += 1) {
    assert.ok(noteText.includes(`"Row ${i}" cards: $`), `Generated note should include row ${i}`);
  }
  const rowLineCount = noteText.split('\n').filter((line) => /"Row \d+" cards: \$/.test(line)).length;
  assert.equal(rowLineCount, 4, 'Generated note should contain one fee line per valid row');

  const rowsBox = await page.locator('#batchRows').boundingBox();
  const noteBox = await page.locator('.batch-note').boundingBox();
  assert.ok(rowsBox && noteBox && noteBox.y >= rowsBox.y + rowsBox.height - 2,
    'Generated note should remain below the full batch row grid');
  assert.ok(rowsBox && noteBox && noteBox.width >= rowsBox.width - 2,
    'Generated note should use the full width of the batch row grid');
  await page.screenshot({ path: screenshotName('desktop-1440-four-rows'), fullPage: true });

  // Copy Note and Total Adjustment Copy require an exact Total from Minted for every row.
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true);
  assert.equal(await page.locator('#batchNoteGuard').isVisible(), true);
  assert.match(await page.locator('#batchNoteGuard').innerText(), /Row 1/,
    'Batch guard should identify the first unconfirmed row');
  const noteReadyRows = page.locator('#batchRows .batch-row');
  assert.equal(await noteReadyRows.locator('.adj-copy-btn[aria-label="Copy Amount"]').count(), 0,
    'No Batch row may offer Amount Copy');
  for (let i = 0; i < await noteReadyRows.count(); i += 1) {
    const row = noteReadyRows.nth(i);
    const includeTax = row.locator('.batch-adj-use-tax');
    if (!(await includeTax.isChecked())) await includeTax.check();
    await row.locator('.batch-adj-minted-total').fill('');
    assert.equal(await row.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
      `Row ${i + 1} Total Adjustment Copy must be disabled without a matching Minted total`);
  }
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true,
    'Clearing Total from Minted must keep Batch Copy Note disabled');
  for (let i = 0; i < await noteReadyRows.count(); i += 1) {
    const row = noteReadyRows.nth(i);
    const totalInput = row.locator('.batch-adj-total');
    await row.locator('.batch-adj-minted-total').fill(await totalInput.inputValue());
    assert.equal(await row.locator('.batch-adj-total-check').innerText(), 'Matches Minted',
      `Batch Row ${i + 1} should match its entered Total from Minted to the cent`);
    assert.equal(await row.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), false,
      `Row ${i + 1} Total Adjustment Copy should enable after an exact match`);
  }
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false,
    'Batch Copy Note should enable when every calculated row matches');
  assert.equal(await page.locator('#batchNoteGuard').isVisible(), false);

  const unconfirmedRow = noteReadyRows.nth(1);
  const rowTwoTotal = Number(await unconfirmedRow.locator('.batch-adj-total').inputValue());
  await unconfirmedRow.locator('.batch-adj-minted-total').fill((rowTwoTotal + 0.01).toFixed(2));
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true,
    'A one-cent mismatch in one Batch row must block the entire note');
  assert.equal(await unconfirmedRow.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'A one-cent mismatch must disable that row’s Total Adjustment Copy');
  assert.match(await page.locator('#batchNoteGuard').innerText(), /Row 2/,
    'Batch guard should identify Row 2 specifically');
  assert.match(await page.locator('#batchNoteGuard').innerText(), /difference \$0\.01/,
    'Batch guard should include the mismatch difference');
  assert.match(await page.locator('#batchNoteGuard').innerText(), /adjust Tax rate %/,
    'Batch guard should explain that Tax rate % may need adjustment');
  await unconfirmedRow.locator('.batch-adj-minted-total').fill(await unconfirmedRow.locator('.batch-adj-total').inputValue());
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false,
    'Reconfirming Row 2 should restore Copy Note');

  // Include Tax off displays $0.00 tax without an estimate warning but still requires a matching total.
  const taxExcludedRow = noteReadyRows.nth(2);
  await taxExcludedRow.locator('.batch-adj-use-tax').uncheck();
  assert.equal(await taxExcludedRow.locator('.batch-adj-tax').textContent(), '0.00');
  assert.doesNotMatch(await taxExcludedRow.locator('.batch-adj-status').innerText(), /estimate/i);
  const taxExcludedTotal = await taxExcludedRow.locator('.batch-adj-total').inputValue();
  await taxExcludedRow.locator('.batch-adj-minted-total').fill((Number(taxExcludedTotal) + 0.01).toFixed(2));
  assert.equal(await taxExcludedRow.locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'Include Tax off must still require an exact Total from Minted match');
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true);
  await taxExcludedRow.locator('.batch-adj-minted-total').fill(taxExcludedTotal);
  assert.equal(await taxExcludedRow.locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false,
    'Batch note should remain copyable when a row excludes tax but its total matches Minted');
  assert.match(await note.inputValue(), /local taxes excluded/,
    'Mixed Batch tax treatment should be clearly disclosed per row');
  await taxExcludedRow.locator('.batch-adj-use-tax').check();
  await taxExcludedRow.locator('.batch-adj-minted-total').fill(await taxExcludedRow.locator('.batch-adj-total').inputValue());
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false);

  await page.locator('#copyAllNotesBtn').click();
  await page.waitForFunction(() => document.querySelector('#batchStatus').textContent.includes('Customer note copied.'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('#copyAllNotesBtn .t-text-swap')?.textContent === '✓ Copied', null, { timeout: 8000 });
  assert.equal(await page.locator('#copyAllNotesBtn .t-text-swap').innerText(), '✓ Copied',
    'Batch Copy Note should use the text-swap feedback label');
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboardText, await note.inputValue(), 'Copy Note should copy the complete generated note');

  // Clear every Minted reference and verify per-row names remain independent from copy readiness.
  for (let i = 0; i < await rows.count(); i += 1) {
    const row = rows.nth(i);
    if (!(await row.locator('.batch-adj-use-tax').isChecked())) await row.locator('.batch-adj-use-tax').check();
    await row.locator('.batch-adj-minted-total').fill('');
  }
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true);
  await rows.nth(1).locator('.batch-name').fill('Card Two');
  await rows.nth(2).locator('.batch-name').fill('Premium');
  await rows.nth(3).locator('.batch-name').fill('Card Four');
  const firstCardName = rows.nth(0).locator('.batch-name');
  await firstCardName.fill('');
  assert.equal((await page.locator('#batchNoteState').textContent()).trim(), '1 card name missing',
    'A single calculated row without a name should show a singular warning');
  assert.equal(await page.locator('#batchNoteState').evaluate((el) => el.classList.contains('is-warning')), true);
  assert.equal(await firstCardName.evaluate((el) => el.classList.contains('needs-name')), true);
  assert.equal(await firstCardName.evaluate((el) => getComputedStyle(el).borderColor), 'rgb(245, 158, 11)');
  for (let i = 1; i < 4; i += 1) {
    assert.equal(await rows.nth(i).locator('.batch-name').evaluate((el) => el.classList.contains('needs-name')), false);
  }
  await firstCardName.fill('Standard');
  assert.equal((await page.locator('#batchNoteState').textContent()).trim(), 'Updated automatically');
  assert.equal(await page.locator('#batchNoteState').evaluate((el) => el.classList.contains('is-warning')), false);
  assert.equal(await firstCardName.evaluate((el) => el.classList.contains('needs-name')), false);
  assert.ok((await note.inputValue()).includes('"Standard" cards:'),
    'The generated note should immediately use the entered card name');

  // Restore blank-name fixtures, check large values, and ensure Total Adjustment Copy stays guarded.
  await firstCardName.fill('');
  await rows.nth(1).locator('.batch-name').fill('');
  await rows.nth(2).locator('.batch-name').fill('Premium');
  await rows.nth(3).locator('.batch-name').fill('');
  const largePrice = rows.nth(0).locator('.batch-price');
  const largeDiscount = rows.nth(0).locator('.batch-discount');
  const largeShipping = rows.nth(0).locator('.batch-adj-ship');
  const largeTotal = rows.nth(0).locator('.batch-adj-total');
  await largePrice.fill('1124.88');
  await largeDiscount.fill('0');
  await largeShipping.fill('0');
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .batch-adj-total')?.value === '1212.06');
  assert.equal(await largeTotal.inputValue(), '1212.06');
  assert.equal(await rows.nth(0).locator('.batch-adj-amount').textContent(), '1124.88');
  assert.equal(await rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'Large unconfirmed total must not be copyable');
  await rows.nth(0).locator('.batch-adj-minted-total').fill('1212.06');
  assert.equal(await rows.nth(0).locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), false);
  const largeCopy = rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await largeCopy.click();
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '1212.06');

  await largePrice.fill('50000');
  await largeDiscount.fill('0');
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .batch-adj-total')?.value === '53875.00');
  const batchLimitWarning = rows.nth(0).locator('.batch-adj-limit-warning');
  assert.equal(await batchLimitWarning.isVisible(), true);
  assert.equal(await batchLimitWarning.innerText(), 'Minted won\'t allow a charge of $50,000 or more.');
  assert.equal(await rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true,
    'A stale Total from Minted must not authorize copying a newly calculated amount');
  await rows.nth(0).locator('.batch-adj-minted-total').fill('53875.00');
  assert.equal(await rows.nth(0).locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  const limitTotalCopy = rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  assert.equal(await limitTotalCopy.isDisabled(), false,
    'A matching total may be copied even while the Minted charge-limit warning is visible');
  await limitTotalCopy.click();
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '53875.00');
  await largePrice.fill('1124.88');
  await largeDiscount.fill('0');
  await rows.nth(0).locator('.batch-adj-minted-total').fill('1212.06');
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .batch-adj-total')?.value === '1212.06');
  assert.equal(await batchLimitWarning.isVisible(), false);
  const largeTotalBox = await largeTotal.boundingBox();
  assert.ok(largeTotalBox && largeTotalBox.width >= 70,
    `Large Total Adjustment needs enough input width to display its value (box=${JSON.stringify(largeTotalBox)})`);
  await rows.nth(0).locator('.batch-adj-minted-total').fill('');
  const largeStatus = rows.nth(0).locator('.batch-adj-status');
  const statusText = await largeStatus.textContent();
  assert.ok(statusText.includes('Unconfirmed total: tax is an estimate.'),
    'Large-value status should keep the tax-rate confirmation guidance');
  assert.equal(await rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), true);
  const statusMetrics = await rows.evaluateAll((els) => els.map((row) => {
    const status = row.querySelector('.batch-adj-status');
    const style = getComputedStyle(status);
    const box = status.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    return {
      text: status.textContent,
      width: Math.round(box.width),
      height: Math.round(box.height),
      lineHeight: Math.round(lineHeight),
      estimatedLines: Math.max(1, Math.round(box.height / lineHeight))
    };
  }));
  assert.ok(statusMetrics.every((item) => item.height <= item.lineHeight * 3 + 2),
    `Batch status text should not wrap beyond two readable lines in the two-column cards: ${JSON.stringify(statusMetrics)}`);

  const realValueNote = await note.inputValue();
  const realValueLines = realValueNote.split('\n').filter((line) => /^".+" cards: \$/i.test(line));
  assert.equal(realValueLines.length, 4);
  assert.deepEqual(realValueLines.map((line) => line.match(/^"([^"]+)" cards:/)?.[1]),
    ['Card 1', 'Card 2', 'Premium', 'Card 4']);
  assert.ok(realValueLines[0].includes('$1,212.06'));

  const rowOneTotalCopy = rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await rows.nth(0).locator('.batch-adj-minted-total').fill('1212.06');
  assert.equal(await rowOneTotalCopy.isDisabled(), false, 'Row 1 Total Adjustment Copy requires and accepts an exact Minted match');
  await rowOneTotalCopy.click();
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '1212.06',
    'Batch Total Adjustment Copy should copy a plain number without currency symbol or commas');
  const rowTwoTotalCopy = rows.nth(1).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await rows.nth(1).locator('.batch-adj-minted-total').fill(await rows.nth(1).locator('.batch-adj-total').inputValue());
  assert.equal(await rows.nth(1).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]').isDisabled(), false);
  await rowTwoTotalCopy.click();
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')[1]?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '172.40',
    'Each Batch Total Adjustment Copy should be row-scoped and copy a plain number');

  // Removing a row should preserve the remaining order and reflow the third row left.
  await rows.nth(3).locator('.batch-remove').click();
  assert.equal(await rows.count(), 3, 'Removing row 4 should leave three rows');
  const noteAfterRemoval = await note.inputValue();
  assert.ok(!noteAfterRemoval.includes('"Row 4" cards:'), 'Removed row should disappear from the note');
  boxes = await positions(rows);
  assertSameLine(boxes[0], boxes[1], 'The first two remaining rows should stay side by side');
  assert.ok(boxes[2].y > boxes[0].y + 20, 'The third remaining row should sit below the first line');
  assertSameColumn(boxes[0], boxes[2], 'The leftover third row should occupy the left column');
  await page.screenshot({ path: screenshotName('desktop-1440-three-rows'), fullPage: true });

  // At 1100px, all Batch row cards should stack vertically.
  await page.setViewportSize({ width: 1100, height: 1300 });
  await page.waitForTimeout(150);
  boxes = await positions(rows);
  for (let i = 1; i < boxes.length; i += 1) {
    assertSameColumn(boxes[0], boxes[i], 'At 1100px, Batch rows should use one column');
    assert.ok(boxes[i].y > boxes[i - 1].y + 20, 'At 1100px, each row should follow the previous row vertically');
  }
  await page.screenshot({ path: screenshotName('tablet-1100-three-rows'), fullPage: true });

  // At phone width, ensure both the rows and document avoid horizontal overflow.
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(150);
  const phoneNoteSize = await note.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight
  }));
  assert.ok(phoneNoteSize.scrollHeight <= phoneNoteSize.clientHeight + 2,
    `Generated note should expand after resizing to phone width (clientHeight=${phoneNoteSize.clientHeight}, scrollHeight=${phoneNoteSize.scrollHeight})`);
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert.ok(overflow.document <= overflow.viewport + 1 && overflow.body <= overflow.viewport + 1,
    `Phone layout should not scroll sideways (viewport=${overflow.viewport}, document=${overflow.document}, body=${overflow.body})`);
  boxes = await positions(rows);
  for (let i = 1; i < boxes.length; i += 1) {
    assertSameColumn(boxes[0], boxes[i], 'At phone width, Batch rows should use one column');
  }
  for (let i = 0; i < 5; i += 1) {
    const valueBox = await adjustmentFields.nth(i).locator('.input-wrap').boundingBox();
    assert.ok(valueBox && valueBox.width >= 100, `Phone adjustment value ${i + 1} needs enough width to read currency values`);
  }
  const phoneAdjustmentBoxes = await positions(adjustmentFields);
  assertSameLine(phoneAdjustmentBoxes[0], phoneAdjustmentBoxes[1], 'Phone Amount and Tax should share the first adjustment line');
  assert.ok(phoneAdjustmentBoxes[2].y > phoneAdjustmentBoxes[1].y + 10, 'Phone Subtotal should start the second adjustment line');
  assertSameLine(phoneAdjustmentBoxes[2], phoneAdjustmentBoxes[3], 'Phone Subtotal and Shipping should share the second adjustment line');
  assert.ok(phoneAdjustmentBoxes[4].y > phoneAdjustmentBoxes[3].y + 10, 'Phone Total should use the final full-width line');
  await page.screenshot({ path: screenshotName('phone-375-three-rows'), fullPage: true });

  // Verify the read-only Estimated tax label and value fit at 320px too.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(150);
  const narrowOverflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert.ok(narrowOverflow.document <= narrowOverflow.viewport + 1 &&
    narrowOverflow.body <= narrowOverflow.viewport + 1,
  `320px phone layout should not scroll sideways (viewport=${narrowOverflow.viewport}, document=${narrowOverflow.document}, body=${narrowOverflow.body})`);
  await page.screenshot({ path: screenshotName('phone-320-three-rows'), fullPage: true });
  const narrowLayoutMetrics = {
    row: await rows.nth(0).boundingBox(),
    adjustment: await rows.nth(0).locator('.batch-adjust').boundingBox(),
    grid: await rows.nth(0).locator('.batch-adjust-grid').boundingBox(),
    amount: await adjustmentFields.nth(0).boundingBox(),
    tax: await adjustmentFields.nth(1).boundingBox()
  };
  console.log('320px Batch dimensions: ' + JSON.stringify(narrowLayoutMetrics));
  const narrowTaxFieldBox = await adjustmentFields.nth(1).boundingBox();
  const narrowTaxLabelBox = await adjustmentFields.nth(1).locator('.batch-adj-label > span').boundingBox();
  assert.ok(narrowTaxFieldBox && narrowTaxLabelBox &&
    narrowTaxLabelBox.x >= narrowTaxFieldBox.x - 1 &&
    narrowTaxLabelBox.x + narrowTaxLabelBox.width <= narrowTaxFieldBox.x + narrowTaxFieldBox.width + 1,
  `320px tax label should fit within its column (field=${JSON.stringify(narrowTaxFieldBox)}, label=${JSON.stringify(narrowTaxLabelBox)})`);
  const narrowTaxOutputBox = await adjustmentFields.nth(1).locator('.batch-adj-tax').boundingBox();
  const narrowTaxStatusBox = await rows.nth(0).locator('.batch-adj-status').boundingBox();
  assert.ok(narrowTaxOutputBox && narrowTaxFieldBox &&
    narrowTaxOutputBox.x >= narrowTaxFieldBox.x - 1 &&
    narrowTaxOutputBox.x + narrowTaxOutputBox.width <= narrowTaxFieldBox.x + narrowTaxFieldBox.width + 1,
  `320px Estimated tax display should remain inside its field (output=${JSON.stringify(narrowTaxOutputBox)})`);
  assert.ok(narrowTaxStatusBox && narrowTaxStatusBox.x >= narrowLayoutMetrics.adjustment.x - 1 &&
    narrowTaxStatusBox.x + narrowTaxStatusBox.width <= narrowLayoutMetrics.adjustment.x + narrowLayoutMetrics.adjustment.width + 1,
  '320px Batch helper/status text should remain aligned inside the Financial Adjustment card');

  // Check Single-mode tax and explanatory helper layout at 320px, then return to desktop.
  await page.locator('#modeSingleBtn').click();
  await page.waitForFunction(() => document.querySelector('#batchPanel').hidden);
  const singleNarrow = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return {
      card: box('#adjustmentCard'),
      taxRow: box('.adjustment-row.tax'),
      taxLabel: box('label[for="adjTax"]'),
      taxValue: box('#adjTax'),
      helper: box('.adjustment-note'),
      mintedTotal: box('.minted-total-row')
    };
  });
  assert.ok(singleNarrow.taxValue.x >= singleNarrow.taxRow.x - 1 &&
    singleNarrow.taxValue.right <= singleNarrow.taxRow.right + 1,
  `320px Single Estimated tax display should stay in its row (${JSON.stringify(singleNarrow)})`);
  assert.ok(singleNarrow.helper.x >= singleNarrow.card.x &&
    singleNarrow.helper.right <= singleNarrow.card.right + 1,
  `320px Single helper text should stay aligned inside the card (${JSON.stringify(singleNarrow)})`);
  assert.ok(singleNarrow.helper.y >= singleNarrow.mintedTotal.bottom - 1,
  '320px Single helper text should remain below Total from Minted and its comparison');
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.waitForTimeout(150);
  await page.locator('#modeSingleBtn').click();
  await page.waitForFunction(() => document.querySelector('#batchPanel').hidden);
  assert.equal(await page.locator('.dashboard-card').getAttribute('data-open'), 'true',
    'Dashboard panel should be open after switching back to Single');
  assert.equal(await page.locator('#modeSingleBtn').getAttribute('aria-selected'), 'true',
    'Single tab should be marked selected after returning from Batch');
  assert.equal(await page.locator('#modeBatchBtn').getAttribute('aria-selected'), 'false',
    'Batch tab should no longer be selected in Single mode');
  assert.equal(await page.locator('#modeSingleBtn').evaluate((el) => el.classList.contains('active')), true,
    'Single tab should carry the active class');
  assert.equal(await page.locator('#modeBatchBtn').evaluate((el) => el.classList.contains('active')), false,
    'Batch tab should not carry the active class in Single mode');
  assert.equal(await page.locator('.history-card').isVisible(), true, 'Single-mode note panel should remain visible');
  assert.equal(await page.locator('.history-card .mascot').count(), 0, 'Single-mode mascot should be removed from the note column');
  assert.equal(await page.locator('#adjustmentCard').isVisible(), true, 'Single-mode Financial Adjustment should remain visible');
  const singleCardBox = await page.locator('.dashboard-card').boundingBox();
  const singleCalculatorBox = await page.locator('.calculator-card').boundingBox();
  const singleHistoryBox = await page.locator('.history-card').boundingBox();
  const singleDetailsBox = await page.locator('.calculator-card form > .field-grid').boundingBox();
  const singleResultsBox = await page.locator('#results').boundingBox();
  const singleTaxRateBox = await page.locator('.tax-rate-setting').boundingBox();
  const singleAdjustmentBox = await page.locator('#adjustmentCard').boundingBox();
  const singleNoteBox = await page.locator('.history-card .note-panel').boundingBox();
  assert.ok(singleCardBox && singleCalculatorBox && singleHistoryBox && singleDetailsBox && singleResultsBox && singleTaxRateBox && singleAdjustmentBox && singleNoteBox,
    'Single-mode desktop layout elements should have layout boxes');
  assert.ok(singleCalculatorBox.width > singleCardBox.width * 0.9,
    'Single-mode calculator should span nearly the full dashboard width');
  assert.ok(singleHistoryBox.y > singleCalculatorBox.y + singleCalculatorBox.height - 2,
    'Single-mode generated note should sit below the calculator');
  assert.ok(singleNoteBox.width > singleCalculatorBox.width * 0.9,
    'Single-mode generated note should span nearly the full calculator width');
  assert.ok(Math.abs(singleDetailsBox.x - singleResultsBox.x) < 3,
    'Single-mode results should align beneath the entry fields in the left column');
  assert.ok(singleResultsBox.y >= singleDetailsBox.y + singleDetailsBox.height + 8,
    'Single-mode results should sit beneath the discount presets');
  assert.ok(singleAdjustmentBox.x > singleDetailsBox.x + singleDetailsBox.width * 0.7,
    'Single-mode Financial Adjustment should occupy the right column');
  assert.ok(Math.abs(singleAdjustmentBox.y - singleDetailsBox.y) < 3,
    'Single-mode Financial Adjustment should begin level with the entry fields');
  assert.ok(singleAdjustmentBox.height > singleDetailsBox.height,
    'Single-mode Financial Adjustment should be the taller right-side column');
  const singleResultsBottom = singleResultsBox.y + singleResultsBox.height;
  const singleTaxRateGap = singleTaxRateBox.y - singleResultsBottom;
  assert.ok(singleTaxRateGap >= 12 && singleTaxRateGap <= 28,
    `Single-mode tax-rate setting should sit 12–28px below the results (gap=${singleTaxRateGap})`);
  const emptySingleErrors = page.locator('.calculator-card form > .field-grid .error:empty');
  assert.equal(await emptySingleErrors.count(), 3,
    'Single-mode field inputs should each have their empty validation message element');
  assert.ok((await emptySingleErrors.evaluateAll((els) => els.map((el) => getComputedStyle(el).display))).every((display) => display === 'none'),
    'Empty validation messages should not reserve blank lines on desktop');
  assert.equal(await page.locator('.calculator-card form').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2,
    'Single-mode desktop form should have two columns');
  assert.ok(await page.locator('.history-card .note-panel textarea').evaluate((el) => parseFloat(getComputedStyle(el).minHeight) >= 260),
    'Single-mode desktop note textarea should have a 260px minimum height');
  assert.equal(await page.locator('.history-card .note-actions').evaluate((el) => getComputedStyle(el).flexDirection), 'row-reverse',
    'Single-mode Copy Note action should be at the bottom right, with status on the left');

  // Single Copy Note and Total Adjustment Copy stay blocked until the cent-exact total matches.
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('20');
  assert.equal(await page.locator('#adjAmount').evaluate((el) => el.tagName), 'OUTPUT');
  assert.equal(await page.locator('#adjTax').evaluate((el) => el.tagName), 'OUTPUT');
  assert.equal(await page.locator('#adjAmount').evaluate((el) => el.tagName === 'INPUT'), false);
  assert.equal(await page.locator('#adjTax').evaluate((el) => el.tagName === 'INPUT'), false);
  assert.ok((await page.locator('#adjAmount').evaluate((el) => el.tabIndex)) < 0);
  assert.ok((await page.locator('#adjTax').evaluate((el) => el.tabIndex)) < 0);
  assert.equal(await page.locator('.adj-copy-btn[data-copy-from="#adjAmount"]').count(), 0);
  assert.equal(await page.locator('#adjAmount').textContent(), '80.00');
  assert.equal(await page.locator('#adjTax').textContent(), '6.20');
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.20');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true);
  assert.equal(await page.locator('#noteCopyGuard').isVisible(), true);
  const singleTotalCopy = page.locator('.adj-copy-btn[data-copy-from="#adjTotal"]');
  assert.equal(await singleTotalCopy.isDisabled(), true);
  await page.evaluate(() => navigator.clipboard.writeText('clipboard unchanged'));
  await page.locator('#noteText').focus();
  await page.keyboard.press('Control+Enter');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'clipboard unchanged');
  await singleTotalCopy.evaluate((el) => el.click());
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'clipboard unchanged');
  await page.locator('#adjMintedTotal').fill('86.20');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false);
  assert.equal(await singleTotalCopy.isDisabled(), false);
  await page.locator('#adjMintedTotal').fill('86.21');
  assert.match(await page.locator('#adjMintedTotalCheck').innerText(), /difference \\$0\\.01/);
  assert.match(await page.locator('#adjMintedTotalCheck').innerText(), /adjust Tax rate %/);
  assert.equal(await page.locator('#copyBtn').isDisabled(), true);
  assert.equal(await singleTotalCopy.isDisabled(), true);
  await page.evaluate(() => navigator.clipboard.writeText('clipboard unchanged'));
  await page.locator('#noteText').focus();
  await page.keyboard.press('Control+Enter');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'clipboard unchanged');
  await page.locator('#adjMintedTotal').fill('86.20');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false);
  assert.equal(await singleTotalCopy.isDisabled(), false);

  // Tax is computed from Amount and the shared rate; Include Tax and Shipping remain editable.
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('20');
  await page.locator('#adjShip').fill('0');
  assert.equal(await page.locator('#adjAmount').textContent(), '80.00');
  assert.equal(await page.locator('#adjTax').textContent(), '6.20');
  assert.equal(await page.locator('#adjSubtotal').inputValue(), '86.20');
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.20');

  await page.locator('#taxRate').fill('8');
  assert.equal(await page.locator('#adjTax').textContent(), '6.40');
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.40');
  assert.equal(await singleTotalCopy.isDisabled(), true, 'Changing the rate must invalidate a previous total confirmation');
  await page.locator('#adjMintedTotal').fill('86.40');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await singleTotalCopy.isDisabled(), false);
  await page.locator('#taxRate').fill('7.75');
  assert.equal(await page.locator('#adjTax').textContent(), '6.20');
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.20');
  assert.equal(await singleTotalCopy.isDisabled(), true, 'Changing rate back must invalidate the old Minted total');

  await page.locator('#adjMintedTotal').fill('86.20');
  await page.locator('#adjShip').fill('5.00');
  assert.equal(await page.locator('#adjTotal').inputValue(), '91.20');
  assert.equal(await singleTotalCopy.isDisabled(), true, 'Shipping changes must invalidate the previous total confirmation');
  await page.locator('#adjMintedTotal').fill('91.20');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false);
  await page.locator('#adjMintedTotal').fill('91.21');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true, 'A one-cent shipping-inclusive mismatch must block Copy Note');

  await page.locator('#adjUseTax').uncheck();
  assert.equal(await page.locator('#adjTax').textContent(), '0.00');
  assert.equal(await page.locator('label[for="adjTax"]').innerText(), 'Tax excluded');
  assert.equal(await page.locator('#adjTotal').inputValue(), '85.00');
  assert.doesNotMatch(await page.locator('#adjStatus').innerText(), /estimate/i,
    'Include Tax off must not show an estimate warning');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true,
    'Include Tax off must still require an exact Total from Minted match');
  await page.locator('#adjMintedTotal').fill('85.00');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false);
  assert.match(await page.locator('#noteText').inputValue(), /local taxes are excluded/);
  await page.locator('#adjMintedTotal').fill('85.01');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true,
    'A one-cent mismatch must still block Copy Note when Include Tax is off');
  assert.equal(await singleTotalCopy.isDisabled(), true);
  await page.locator('#adjUseTax').check();
  await page.locator('#adjShip').fill('0');
  await page.locator('#adjMintedTotal').fill('86.20');
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.20');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false);

  // The Minted charge limit remains visible independently of the exact-match copy guard.
  await page.locator('#backer').fill('62500');
  assert.equal(await page.locator('#adjAmount').textContent(), '50000.00');
  assert.equal(await page.locator('#adjLimitWarning').isVisible(), true);
  assert.equal(await page.locator('#adjLimitWarning').innerText(), 'Minted won\'t allow a charge of $50,000 or more.');
  assert.equal(await singleTotalCopy.isDisabled(), true, 'Changing the amount must invalidate total confirmation');

  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('25');
  assert.equal(await page.locator('#adjAmount').textContent(), '75.00');
  assert.equal(await page.locator('#adjTax').textContent(), '5.81');
  assert.equal(await page.locator('#adjTotal').inputValue(), '80.81');
  assert.equal(await page.locator('#adjLimitWarning').isVisible(), false);
  await page.locator('#taxRate').fill('8');
  assert.equal(await page.locator('#adjTax').textContent(), '6.00');
  assert.equal(await page.locator('#adjTotal').inputValue(), '81.00');
  await page.locator('#adjMintedTotal').fill('81.00');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await singleTotalCopy.isDisabled(), false);
  await page.locator('#taxRate').fill('7.75');
  assert.equal(await page.locator('#adjTax').textContent(), '5.81');
  assert.equal(await page.locator('#adjTotal').inputValue(), '80.81');
  assert.equal(await singleTotalCopy.isDisabled(), true);
  assert.match(await page.locator('#adjMintedTotalCheck').innerText(), /difference \\$0\\.19/);
  await page.locator('#adjMintedTotal').fill('80.81');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await singleTotalCopy.isDisabled(), false);

  // Restore the original values for the remaining layout, invalid-rate, and persisted-rate checks.
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('20');
  await page.locator('#adjShip').fill('0');
  await page.locator('#adjMintedTotal').fill('86.20');
  assert.equal(await page.locator('#adjAmount').textContent(), '80.00');
  assert.equal(await page.locator('#adjTax').textContent(), '6.20');
  assert.equal(await page.locator('#adjTotal').inputValue(), '86.20');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('backerfee-settings-v3')).taxRate), '7.75');

  const singleValueBoxes = await page.locator('#adjustmentCard .adjustment-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelector('.adjustment-value-input')?.getBoundingClientRect()).filter(Boolean)
      .map((box) => ({ x: box.x, right: box.right, width: box.width }))
  );
  assert.equal(singleValueBoxes.length, 6, 'Single mode should show all six Financial Adjustment values');
  assert.ok(Math.max(...singleValueBoxes.map((box) => box.width)) - Math.min(...singleValueBoxes.map((box) => box.width)) <= 1,
    `Single Amount, tax, subtotal, shipping, and total values should be equally wide (boxes=${JSON.stringify(singleValueBoxes)})`);
  assert.equal(await page.locator('.adj-copy-btn[data-copy-from="#adjAmount"]').count(), 0,
    'Single mode must not render an Amount Copy button');
  assert.equal(await singleTotalCopy.isDisabled(), false);
  assert.ok((await page.locator('#noteText').inputValue()).includes('$86.20'));
  await page.screenshot({ path: screenshotName('single-mode-1440'), fullPage: true, animations: 'disabled' });

  // Invalid rates show a clear error and recover to the documented 7.75% default.
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('49.45');
  await page.locator('#adjShip').fill('0');
  const rateInput = page.locator('#taxRate');
  for (const invalidRate of ['0', '-1', '101', '']) {
    await rateInput.fill(invalidRate);
    assert.equal(await rateInput.getAttribute('aria-invalid'), 'true',
      `Tax rate ${JSON.stringify(invalidRate)} should be marked invalid while editing`);
    assert.ok((await page.locator('#taxRateError').innerText()).includes('greater than 0%'),
      `Tax rate ${JSON.stringify(invalidRate)} should show a clear validation error`);
    assert.notEqual(await page.locator('#adjTotal').inputValue(), 'NaN',
      'Invalid rate must never produce NaN in Total Adjustment');
    await rateInput.evaluate((el) => el.blur());
    assert.equal(await rateInput.inputValue(), '7.75',
      `Tax rate ${JSON.stringify(invalidRate)} should fall back to 7.75% on blur`);
    assert.equal(await rateInput.getAttribute('aria-invalid'), 'false',
      'Rate validation state should clear after default is restored');
    assert.equal(await page.locator('#taxRateError').innerText(), '',
      'Rate validation message should clear after default is restored');
    assert.equal(Number(await page.locator('#adjTax').textContent()), 3.92,
      'A recovered default rate should produce $3.92 tax for Amount $50.55');
    assert.equal(Number(await page.locator('#adjTotal').inputValue()), 54.47,
      'A recovered default rate should produce a $54.47 total');
  }
  await rateInput.focus();
  await rateInput.evaluate((el) => { el.type = 'text'; el.value = 'abc'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await rateInput.getAttribute('aria-invalid'), 'true', 'Letter input should be rejected');
  assert.ok((await page.locator('#taxRateError').innerText()).includes('greater than 0%'), 'Letter input should explain the valid rate range');
  assert.notEqual(await page.locator('#adjTotal').inputValue(), 'NaN', 'Letter input must never produce NaN');
  await rateInput.evaluate((el) => el.blur());
  await rateInput.evaluate((el) => { el.type = 'number'; });
  assert.equal(await rateInput.inputValue(), '7.75', 'Letter input should recover to 7.75% on blur');

  // Invalid stored rate data must also load safely with the default rate.
  await page.evaluate(() => {
    const key = 'backerfee-settings-v3';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    data.taxRate = 'not-a-rate';
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.equal(await page.locator('#taxRate').inputValue(), '7.75',
    'An invalid localStorage tax rate should fall back to 7.75% on startup');
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('49.45');
  assert.equal(Number(await page.locator('#adjTax').textContent()), 3.92,
    'The stored-rate fallback should calculate tax without NaN');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 54.47,
    'The stored-rate fallback should calculate the expected total');

  assert.deepEqual(errors, [], `Browser should not emit runtime errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({
    result: 'PASS',
    baseUrl,
    viewportChecks: [1440, 1100, 375, 320],
    checks: [
      'four-row ordering',
      'individual row calculations and focus retention',
      'Amount and Shipping isolate to their own row',
      'three-column Financial Adjustment at desktop width',
      'generated note has one line per row and copies completely',
      'Single and Batch Total Adjustment copies are enabled only after an exact Minted total match',
      'remove-row reflow leaves the third row in the left column',
      'single-column layout at 1100px',
      'no horizontal overflow at 375px and 320px',
      'tax label fits inside its column at 320px',
      'Single mode two-column layout, full-width note, and no mascot',
      'no bridge popup or Tampermonkey text on load or after delay/reload',
      'Reset uses one centered modal with focus trapping, scroll locking, safe close actions, and a 320px layout',
      'Single and Batch customer notes stay blocked until Total from Minted matches exactly',
      'desktop results and tax-rate setting have deliberate vertical spacing',
      'no uncaught browser runtime errors'
    ],
    screenshots: [
      'desktop-1440-four-rows.png',
      'desktop-1440-three-rows.png',
      'tablet-1100-three-rows.png',
      'phone-375-three-rows.png',
      'phone-320-three-rows.png',
      'single-mode-1440.png',
      'batch-real-values-1440.png',
      'batch-real-values-first-row.png'
    ]
  }, null, 2));
  await context.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
