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

  // Batch row fields and manual Amount/Shipping edits survive a full page refresh.
  await page.locator('#modeBatchBtn').click();
  const draftRows = page.locator('#batchRows .batch-row');
  const invitationDraft = draftRows.nth(0);
  await invitationDraft.locator('.batch-name').fill('Invitation');
  await invitationDraft.locator('.batch-price').fill('50');
  await invitationDraft.locator('.batch-discount').fill('15');
  await invitationDraft.locator('.batch-adj-amount').fill('50.55');
  assert.equal(await invitationDraft.locator('.batch-adj-tax').isEditable(), true,
    'Batch tax must be an editable input, not a fixed-rate-only output');
  await invitationDraft.locator('.batch-adj-tax').fill('3.92');
  await invitationDraft.locator('.batch-adj-minted-total').fill('54.47');
  await invitationDraft.locator('.batch-adj-ship').fill('0');
  await draftRows.nth(1).locator('.batch-name').fill('Draft RSVP');
  await draftRows.nth(1).locator('.batch-price').fill('100');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();

  const restoredDraftRows = page.locator('#batchRows .batch-row');
  assert.equal(await restoredDraftRows.count(), 2, 'Refresh should preserve the number of Batch rows');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-name').inputValue(), 'Invitation',
    'Refresh should restore each card name');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-price').inputValue()), 50,
    'Refresh should restore the original price');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-discount').inputValue()), 15,
    'Refresh should restore the discount');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-amount').inputValue()), 50.55,
    'Refresh should preserve a manually adjusted Amount');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-ship').inputValue()), 0,
    'Refresh should preserve Shipping Adjustment');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-tax').inputValue()), 3.92,
    'Refresh should preserve manually entered Minted tax');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-subtotal').inputValue()), 54.47,
    'Refresh should recompute Subtotal from Amount and the restored Minted tax');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 54.47,
    'Refresh should recompute Total Adjustment from restored values');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-minted-total').inputValue()), 54.47,
    'Refresh should restore the optional Total from Minted reference');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-total-check').innerText(), 'Matches Minted',
    'Batch should compare the calculated total to the saved Minted total');
  assert.ok((await page.locator('#batchNoteText').inputValue()).includes('"Invitation" cards: $54.47'),
    'The restored customer note should use Minted tax and the resulting Total Adjustment');
  const typedTaxTotalCopy = restoredDraftRows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await typedTaxTotalCopy.click();
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '54.47',
    'The Total Adjustment Copy button should copy 54.47 for the entered Minted tax');

  await restoredDraftRows.nth(0).locator('.batch-adj-minted-total').fill('54.48');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-total-check').innerText(),
    'Mismatch: app $54.47, Minted $54.48, difference $0.01',
    'Batch should show the app total, Minted total, and cent difference when they mismatch');
  await restoredDraftRows.nth(0).locator('.batch-adj-minted-total').fill('');

  // Include Tax is functional in every Batch row; excluding it uses zero tax.
  await restoredDraftRows.nth(0).locator('.batch-adj-ship').fill('5.00');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 59.47,
    'Minted tax 3.92 plus $5 shipping should total $59.47');
  const batchUseTax = restoredDraftRows.nth(0).locator('.batch-adj-use-tax');
  await batchUseTax.uncheck();
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-tax').inputValue()), 0,
    'Unchecking Include Tax should set tax to zero');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 55.55,
    'Without tax, Total Adjustment should equal Amount plus Shipping');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-tax').isDisabled(), true,
    'Tax input should be disabled when Include Tax is unchecked');
  await batchUseTax.check();
  await restoredDraftRows.nth(0).locator('.batch-adj-ship').fill('0');
  await page.locator('#taxRate').fill('8');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-tax').inputValue()), 4.04,
    'Changing the shared rate should recalculate the Batch estimate at 8%');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 54.59,
    'Changing the shared rate should recalculate the Batch total');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-field').nth(1).locator('.batch-adj-label > span').innerText(),
    'Estimated tax', 'Batch should retain the estimate label after changing the rate');
  assert.ok((await restoredDraftRows.nth(0).locator('.batch-adj-total').getAttribute('class')).includes('is-unconfirmed'),
    'Batch total should stay unconfirmed after changing the rate');
  await page.locator('#taxRate').fill('7.75');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-tax').inputValue()), 3.92,
    'Restoring 7.75% should restore Batch estimated tax');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 54.47,
    'Restoring 7.75% should restore the Batch estimate total');
  await page.locator('#taxRate').fill('0');
  assert.equal(await page.locator('#taxRate').getAttribute('aria-invalid'), 'true',
    'A zero rate should be rejected in Batch mode');
  assert.equal(await page.locator('#taxRateError').isVisible(), true,
    'An invalid shared rate should show its validation error in Batch mode');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 54.47,
    'An invalid shared rate must not corrupt the Batch total');
  await page.locator('#taxRate').evaluate((el) => el.blur());
  assert.equal(await page.locator('#taxRate').inputValue(), '7.75',
    'Invalid Batch rate should recover to 7.75%');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-field').nth(1).locator('.batch-adj-label > span').innerText(),
    'Estimated tax', 'An invalid rate must not change the Batch label to Minted tax');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-tax').inputValue()), 3.92,
    'The Batch estimate should remain correct after invalid-rate recovery');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-tax').inputValue()), 3.92,
    'Without a typed tax, Batch should show the 7.75% estimate');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 54.47,
    'The estimated tax should total $54.47 on Amount $50.55');
  assert.equal((await restoredDraftRows.nth(0).locator('.batch-adj-status').innerText()),
    'Unconfirmed total: tax is an estimate. Replace it with Minted\'s tax before using this total.',
    'The estimated state should explain the Minted verification step');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-field').nth(1).locator('.batch-adj-label > span').innerText(),
    'Estimated tax', 'Batch tax field should be visibly marked as an estimate before Minted tax is entered');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-field').nth(4).locator('.batch-adj-label > span').innerText(),
    'Total Adjustment (estimate)', 'Batch total label should mark estimated tax as provisional');
  assert.ok((await restoredDraftRows.nth(0).locator('.batch-adj-total').getAttribute('class')).includes('is-unconfirmed'),
    'Batch Total Adjustment should be visibly flagged while tax is estimated');
  await restoredDraftRows.nth(0).locator('.batch-adj-tax').fill('3.92');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-field').nth(1).locator('.batch-adj-label > span').innerText(),
    'Tax from Minted', 'Batch tax field should show the Minted label after user enters actual tax');
  assert.equal(await restoredDraftRows.nth(0).locator('.batch-adj-field').nth(4).locator('.batch-adj-label > span').innerText(),
    'Total Adjustment', 'Batch total label should drop estimate label after tax entry');
  assert.ok(!(await restoredDraftRows.nth(0).locator('.batch-adj-total').getAttribute('class')).includes('is-unconfirmed'),
    'Batch unconfirmed style should clear after Minted tax is entered');
  await restoredDraftRows.nth(0).locator('.batch-adj-ship').fill('5.00');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-total').inputValue()), 59.47,
    'Typed tax and Shipping should be used in Batch');
  await restoredDraftRows.nth(0).locator('.batch-price').fill('51');
  assert.equal(Number(await restoredDraftRows.nth(0).locator('.batch-adj-tax').inputValue()), 3.36,
    'Changing original price should reset Batch tax to the 7.75% estimate');
  assert.equal((await restoredDraftRows.nth(0).locator('.batch-adj-status').innerText()),
    'Unconfirmed total: tax is an estimate. Replace it with Minted\'s tax before using this total.',
    'Changing original price should return the row to estimated status');
  assert.equal(await restoredDraftRows.nth(1).locator('.batch-name').inputValue(), 'Draft RSVP',
    'Refresh should preserve the card name in a partially entered row');
  assert.equal(Number(await restoredDraftRows.nth(1).locator('.batch-price').inputValue()), 100,
    'Refresh should preserve a partially entered price');
  assert.equal(await restoredDraftRows.nth(1).locator('.batch-discount').inputValue(), '',
    'Refresh should keep an incomplete discount blank');

  // Save a typed Minted tax in row 1 and unchecked Include Tax in row 2, then reload.
  await restoredDraftRows.nth(0).locator('.batch-adj-amount').fill('50.55');
  await restoredDraftRows.nth(0).locator('.batch-adj-tax').fill('3.92');
  await restoredDraftRows.nth(0).locator('.batch-adj-ship').fill('0');
  await restoredDraftRows.nth(1).locator('.batch-discount').fill('20');
  await restoredDraftRows.nth(1).locator('.batch-adj-ship').fill('5.00');
  await restoredDraftRows.nth(1).locator('.batch-adj-use-tax').uncheck();
  assert.equal(Number(await restoredDraftRows.nth(1).locator('.batch-adj-total').inputValue()), 85,
    'Second row with Include Tax off should total Amount plus $5 shipping');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length === 2, null, { timeout: 15000 });
  await page.locator('#modeBatchBtn').click();
  const bothTaxRows = page.locator('#batchRows .batch-row');
  assert.equal(Number(await bothTaxRows.nth(0).locator('.batch-adj-tax').inputValue()), 3.92,
    'Refresh should restore typed Minted tax in row 1');
  assert.equal(Number(await bothTaxRows.nth(0).locator('.batch-adj-total').inputValue()), 54.47,
    'Refresh should preserve row 1 tax calculation');
  assert.equal(await bothTaxRows.nth(1).locator('.batch-adj-use-tax').isChecked(), false,
    'Refresh should restore Include Tax unchecked in row 2');
  assert.equal(await bothTaxRows.nth(1).locator('.batch-adj-tax').isDisabled(), true,
    'Restored unchecked Include Tax should keep tax disabled');
  assert.equal(Number(await bothTaxRows.nth(1).locator('.batch-adj-tax').inputValue()), 0,
    'Restored unchecked Include Tax should keep tax at zero');
  assert.equal(Number(await bothTaxRows.nth(1).locator('.batch-adj-total').inputValue()), 85,
    'Restored unchecked row should calculate Amount plus shipping');

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
    'Reset should clear persisted typed tax in every Batch row');
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

  const emptyAmountCopy = rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Amount"]');
  await emptyAmountCopy.click();
  await page.waitForFunction(() =>
    document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Amount"] .t-text-swap')?.textContent.trim() === 'Empty'
  );
  assert.equal((await emptyAmountCopy.locator('.t-text-swap').textContent()).trim(), 'Empty',
    'Copy Amount should show Empty when the field has no value');

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
    assert.equal(await row.locator('.batch-adj-amount').inputValue(), expectedFinalFees[i],
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
    const input = adjustmentFields.nth(i).locator('.input-wrap input').first();
    const inputBox = await input.boundingBox();
    assert.ok(inputBox && inputBox.width >= 48, `Adjustment field ${i + 1} needs a usable input width`);
  }
  for (const index of [0, 1, 2]) {
    const labelHeight = await adjustmentFields.nth(index).locator('.batch-adj-label').evaluate((el) => getComputedStyle(el).minHeight);
    assert.equal(labelHeight, '36px',
      `Top-line Batch adjustment label ${index + 1} should share a 36px minimum height`);
  }
  const topLineInputBoxes = await Promise.all([0, 1, 2].map(async (index) =>
    adjustmentFields.nth(index).locator('.input-wrap input').first().boundingBox()));
  assert.ok(topLineInputBoxes.every(Boolean), 'All three top-line adjustment inputs should have layout boxes');
  const topLineInputY = topLineInputBoxes.map((box) => box.y);
  assert.ok(Math.max(...topLineInputY) - Math.min(...topLineInputY) <= 1,
    `Amount, Tax Based on Shipping Zip, and Subtotal inputs should align on one line (y=${topLineInputY.join(', ')})`);
  for (const index of [3, 4, 5]) {
    const labelHeight = await adjustmentFields.nth(index).locator('.batch-adj-label').evaluate((el) => getComputedStyle(el).minHeight);
    assert.equal(labelHeight, '40px',
      `Batch second-line field ${index + 1} should reserve the shared 40px label height`);
  }
  const secondLineInputBoxes = await Promise.all([3, 4, 5].map(async (index) =>
    adjustmentFields.nth(index).locator('.input-wrap input').first().boundingBox()));
  assert.ok(secondLineInputBoxes.every(Boolean), 'Shipping, Total Adjustment, and Total from Minted inputs should have layout boxes');
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

  // Restore row 1 and test that Amount and Shipping change only that row.
  await firstPrice.fill('100');
  await rows.nth(0).locator('.batch-discount').fill('10');
  const rowOneAmount = rows.nth(0).locator('.batch-adj-amount');
  await rowOneAmount.fill('100');
  assert.equal(await rowOneAmount.evaluate((el) => document.activeElement === el), true,
    'Amount should retain focus while recalculating');
  const rowOneShipping = rows.nth(0).locator('.batch-adj-ship');
  await rowOneShipping.fill('3.50');
  assert.equal(await rowOneShipping.evaluate((el) => document.activeElement === el), true,
    'Shipping should retain focus while recalculating');
  assert.equal(await rows.nth(0).locator('.batch-adj-amount').inputValue(), '100');
  assert.equal(await rows.nth(0).locator('.batch-adj-total').inputValue(), '111.25',
    'Row 1 total should use its entered Amount and Shipping plus 7.75% tax');
  assert.equal(await rows.nth(1).locator('.batch-adj-amount').inputValue(), '160.00',
    'Editing row 1 must not change row 2 Amount');

  const note = page.locator('#batchNoteText');
  const noteText = await note.inputValue();
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

  // Batch customer notes are blocked until every calculated row has confirmed tax and a matching Minted total.
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true);
  assert.equal(await page.locator('#batchNoteGuard').isVisible(), true);
  assert.match(await page.locator('#batchNoteGuard').innerText(), /Row 1/,
    'The Batch guard should identify at least the first unconfirmed row');
  const noteReadyRows = page.locator('#batchRows .batch-row');
  for (let i = 0; i < await noteReadyRows.count(); i += 1) {
    const row = noteReadyRows.nth(i);
    const includeTax = row.locator('.batch-adj-use-tax');
    if (!(await includeTax.isChecked())) await includeTax.check();
    const taxField = row.locator('.batch-adj-tax');
    await taxField.fill('');
    await taxField.blur();
    await row.locator('.batch-adj-minted-total').fill('');
  }
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true,
    'Clearing the typed tax/total should keep Batch Copy Note disabled');
  for (let i = 0; i < await noteReadyRows.count(); i += 1) {
    const row = noteReadyRows.nth(i);
    const taxField = row.locator('.batch-adj-tax');
    await taxField.fill(await taxField.inputValue());
    await taxField.blur();
    await row.locator('.batch-adj-minted-total').fill(await row.locator('.batch-adj-total').inputValue());
    assert.equal(await row.locator('.batch-adj-total-check').innerText(), 'Matches Minted',
      `Batch row ${i + 1} should match its entered Minted total before copying notes`);
  }
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false,
    'Batch Copy Note should enable when every calculated row is confirmed');
  assert.equal(await page.locator('#batchNoteGuard').isVisible(), false);

  // One unconfirmed row should block the whole note and name that row in the warning.
  const unconfirmedRow = noteReadyRows.nth(1);
  await unconfirmedRow.locator('.batch-adj-minted-total').fill('');
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), true);
  assert.match(await page.locator('#batchNoteGuard').innerText(), /Row 2/,
    'Batch guard should identify the specific row whose Minted total is missing');
  await unconfirmedRow.locator('.batch-adj-minted-total').fill(await unconfirmedRow.locator('.batch-adj-total').inputValue());
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false,
    'Confirming that row should re-enable Batch note copying');

  // Include Tax off should not demand a tax entry if the row total matches Minted.
  const taxExcludedRow = noteReadyRows.nth(2);
  await taxExcludedRow.locator('.batch-adj-use-tax').uncheck();
  const taxExcludedTotal = await taxExcludedRow.locator('.batch-adj-total').inputValue();
  await taxExcludedRow.locator('.batch-adj-minted-total').fill(taxExcludedTotal);
  assert.equal(await taxExcludedRow.locator('.batch-adj-total-check').innerText(), 'Matches Minted');
  assert.equal(await taxExcludedRow.locator('.batch-adj-tax').isDisabled(), true);
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false,
    'Batch note should remain copyable when one row excludes tax but its total matches Minted');
  assert.match(await note.inputValue(), /local taxes excluded/,
    'Mixed Batch tax treatment should be clearly disclosed per row');
  await taxExcludedRow.locator('.batch-adj-use-tax').check();
  const restoredTaxField = taxExcludedRow.locator('.batch-adj-tax');
  await restoredTaxField.fill(await restoredTaxField.inputValue());
  await taxExcludedRow.locator('.batch-adj-minted-total').fill(await taxExcludedRow.locator('.batch-adj-total').inputValue());
  assert.equal(await page.locator('#copyAllNotesBtn').isDisabled(), false);

  await page.locator('#copyAllNotesBtn').click();
  await page.waitForFunction(() => document.querySelector('#batchStatus').textContent.includes('Customer note copied.'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('#copyAllNotesBtn .t-text-swap')?.textContent === '✓ Copied', null, { timeout: 8000 });
  assert.equal(await page.locator('#copyAllNotesBtn .t-text-swap').innerText(), '✓ Copied',
    'Batch Copy Note should use the text-swap feedback label');
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboardText, noteText, 'Copy Note should copy the complete generated note');

  // Return the rows to estimate-only state so following calculations still test the rate fallback.
  for (let i = 0; i < await rows.count(); i += 1) {
    const row = rows.nth(i);
    const useTax = row.locator('.batch-adj-use-tax');
    if (!(await useTax.isChecked())) await useTax.check();
    const taxInput = row.locator('.batch-adj-tax');
    await taxInput.fill('');
    await taxInput.blur();
    await row.locator('.batch-adj-minted-total').fill('');
  }

  // A calculated row with no name should be visibly flagged while its copy remains tax-guarded.
  await rows.nth(1).locator('.batch-name').fill('Card Two');
  await rows.nth(2).locator('.batch-name').fill('Premium');
  await rows.nth(3).locator('.batch-name').fill('Card Four');
  const firstCardName = rows.nth(0).locator('.batch-name');
  await firstCardName.fill('');
  assert.equal((await page.locator('#batchNoteState').textContent()).trim(), '1 card name missing',
    'A single calculated row without a name should show a singular warning');
  assert.equal(await page.locator('#batchNoteState').evaluate((el) => el.classList.contains('is-warning')), true,
    'Missing card names should set warning styling on the note status');
  assert.equal(await firstCardName.evaluate((el) => el.classList.contains('needs-name')), true,
    'The calculated unnamed row should receive the amber warning class');
  assert.equal(await firstCardName.evaluate((el) => getComputedStyle(el).borderColor), 'rgb(245, 158, 11)',
    'The missing card name field should have an amber border');
  for (let i = 1; i < 4; i += 1) {
    assert.equal(await rows.nth(i).locator('.batch-name').evaluate((el) => el.classList.contains('needs-name')), false,
      'Named rows should not receive the missing-name warning');
  }
  await firstCardName.fill('Standard');
  assert.equal((await page.locator('#batchNoteState').textContent()).trim(), 'Updated automatically',
    'Entering a card name should clear the warning status');
  assert.equal(await page.locator('#batchNoteState').evaluate((el) => el.classList.contains('is-warning')), false,
    'Warning styling should clear when every calculated row has a name');
  assert.equal(await firstCardName.evaluate((el) => el.classList.contains('needs-name')), false,
    'The amber field warning should clear after entering a name');
  assert.ok((await note.inputValue()).includes('"Standard" cards:'),
    'The generated note should immediately use the entered card name');

  // Restore blank-name fixtures to ensure fallback placeholders remain supported.
  await firstCardName.fill('');
  await rows.nth(1).locator('.batch-name').fill('');
  await rows.nth(2).locator('.batch-name').fill('Premium');
  await rows.nth(3).locator('.batch-name').fill('');
  const largeAmount = rows.nth(0).locator('.batch-adj-amount');
  const largeShipping = rows.nth(0).locator('.batch-adj-ship');
  await largeAmount.fill('1124.88');
  await largeShipping.fill('0');
  await page.waitForFunction(() =>
    document.querySelector('#batchRows .batch-row .batch-adj-total')?.value === '1212.06'
  );
  const largeTotal = rows.nth(0).locator('.batch-adj-total');
  assert.equal(await largeTotal.inputValue(), '1212.06',
    'A large Total Adjustment should calculate to $1,212.06');
  await largeAmount.fill('50000');
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .batch-adj-total')?.value === '53875.00');
  const batchLimitWarning = rows.nth(0).locator('.batch-adj-limit-warning');
  assert.equal(await batchLimitWarning.isVisible(), true,
    'A Batch Total Adjustment of $50,000 or more should show the Minted charge-limit warning');
  assert.equal(await batchLimitWarning.innerText(), 'Minted won\'t allow a charge of $50,000 or more.');
  const limitTotalCopy = rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await limitTotalCopy.click();
  await page.waitForFunction(() =>
    document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')?.textContent.trim() === 'Copied ✓'
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '53875.00',
    'Copy should still work while Minted charge-limit warning is visible');
  await largeAmount.fill('1124.88');
  await page.waitForFunction(() => document.querySelector('#batchRows .batch-row .batch-adj-total')?.value === '1212.06');
  assert.equal(await batchLimitWarning.isVisible(), false,
    'The Batch charge-limit warning should clear again below $50,000');
  const largeTotalBox = await largeTotal.boundingBox();
  assert.ok(largeTotalBox && largeTotalBox.width >= 70,
    `Large Total Adjustment needs enough input width to display its value (box=${JSON.stringify(largeTotalBox)})`);
  const largeStatus = rows.nth(0).locator('.batch-adj-status');
  const statusText = await largeStatus.textContent();
  assert.ok(statusText.includes('Unconfirmed total: tax is an estimate.'),
    'Large-value status should keep the explicit tax confirmation guidance');
  assert.equal(await rows.nth(0).locator('.batch-adj-limit-warning').isVisible(), false,
    'Below-$50,000 totals should not show the Minted charge limit warning');
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
  assert.equal(realValueLines.length, 4,
    'Real-value note should still include exactly one fee line per valid row');
  assert.deepEqual(realValueLines.map((line) => line.match(/^"([^"]+)" cards:/)?.[1]),
    ['Card 1', 'Card 2', 'Premium', 'Card 4'],
    'Blank Card names should fall back to Card 1, Card 2, and subsequent row numbers');
  assert.ok(realValueLines[0].includes('$1,212.06'),
    'Generated note should include the large Total Adjustment for row 1');

  const rowOneAmountCopy = rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Amount"]');
  await rowOneAmountCopy.click();
  await page.waitForFunction(() =>
    document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Amount"]')?.textContent.trim() === 'Copied ✓'
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '1124.88',
    'Batch Amount copy should copy a plain number without currency symbol or commas');
  const rowTwoAmountCopy = rows.nth(1).locator('.adj-copy-btn[aria-label="Copy Amount"]');
  await rowTwoAmountCopy.click();
  await page.waitForFunction(() =>
    document.querySelectorAll('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Amount"]')[1]?.textContent.trim() === 'Copied ✓'
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '160.00',
    'Each Batch Amount button should copy its own row value');

  const rowOneTotalCopy = rows.nth(0).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await rowOneTotalCopy.click();
  await page.waitForFunction(() =>
    document.querySelector('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')?.textContent.trim() === 'Copied ✓'
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '1212.06',
    'Batch Total Adjustment copy should copy a plain number without currency symbol or commas');
  const rowTwoTotalCopy = rows.nth(1).locator('.adj-copy-btn[aria-label="Copy Total Adjustment"]');
  await rowTwoTotalCopy.click();
  await page.waitForFunction(() =>
    document.querySelectorAll('#batchRows .batch-row .adj-copy-btn[aria-label="Copy Total Adjustment"]')[1]?.textContent.trim() === 'Copied ✓'
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '172.40',
    'Each Batch Total Adjustment button should copy its own row value');

  console.log('Batch real-value status metrics: ' + JSON.stringify(statusMetrics));
  await page.screenshot({ path: screenshotName('batch-real-values-1440'), fullPage: true, animations: 'disabled' });
  await rows.nth(0).screenshot({ path: screenshotName('batch-real-values-first-row'), animations: 'disabled' });

  // Restore the original names/amounts so the remaining reflow and copy checks retain their existing fixture.
  for (let i = 0; i < 4; i += 1) {
    await rows.nth(i).locator('.batch-name').fill(`Row ${i + 1}`);
  }
  await rows.nth(0).locator('.batch-adj-amount').fill('100');
  await rows.nth(0).locator('.batch-adj-ship').fill('3.50');

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
    const inputBox = await adjustmentFields.nth(i).locator('.input-wrap input').first().boundingBox();
    assert.ok(inputBox && inputBox.width >= 100, `Phone adjustment field ${i + 1} needs enough width to read currency values`);
  }
  const phoneAdjustmentBoxes = await positions(adjustmentFields);
  assertSameLine(phoneAdjustmentBoxes[0], phoneAdjustmentBoxes[1], 'Phone Amount and Tax should share the first adjustment line');
  assert.ok(phoneAdjustmentBoxes[2].y > phoneAdjustmentBoxes[1].y + 10, 'Phone Subtotal should start the second adjustment line');
  assertSameLine(phoneAdjustmentBoxes[2], phoneAdjustmentBoxes[3], 'Phone Subtotal and Shipping should share the second adjustment line');
  assert.ok(phoneAdjustmentBoxes[4].y > phoneAdjustmentBoxes[3].y + 10, 'Phone Total should use the final full-width line');
  await page.screenshot({ path: screenshotName('phone-375-three-rows'), fullPage: true });

  // Verify the no-wrap tax label at the narrow 320px viewport too.
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
  // Switch back to Single and verify the redesigned desktop calculator and full-width note.
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

  // A customer note that says its fee includes local taxes cannot be copied from an estimate.
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('20');
  assert.ok((await page.locator('#noteText').inputValue()).includes('$86.20'),
    'The generated note should reflect the current estimated adjustment');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true,
    'Copy Note must remain disabled while tax and total are only estimates');
  assert.equal(await page.locator('#noteCopyGuard').isVisible(), true,
    'The reason for blocking the note should be visible');
  await page.evaluate(() => navigator.clipboard.writeText('clipboard unchanged'));
  await page.locator('#noteText').focus();
  await page.keyboard.press('Control+Enter');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'clipboard unchanged',
    'The keyboard copy shortcut must not bypass the unconfirmed-total guard');
  assert.equal(await page.locator('#noteCopyGuard').isVisible(), true,
    'The warning should remain visible after the blocked keyboard shortcut');
  await page.locator('#copyBtn').evaluate((el) => el.click());
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'clipboard unchanged',
    'Clicking the disabled Copy Note button must not copy an estimated note');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true);
  assert.equal(await page.locator('#noteCopyGuard').isVisible(), true,
    'The warning should remain visible after attempting the blocked button');
  await page.locator('#adjTax').fill('6.20');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true,
    'Typing Minted tax alone is insufficient without the final-total comparison');
  await page.locator('#adjMintedTotal').fill('86.20');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false,
    'Copy Note should become available when Minted tax and total match');
  assert.equal(await page.locator('#noteCopyGuard').isVisible(), false);
  await page.locator('#adjMintedTotal').fill('86.21');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true,
    'A one-cent mismatch should block Copy Note');
  assert.equal(await page.locator('#noteCopyGuard').isVisible(), true);
  await page.locator('#adjMintedTotal').fill('86.20');

  // Check that Single uses Minted's typed tax, Include Tax, and the 7.75% estimate only as fallback.
  await page.locator('#backer').fill('100');
  await page.locator('#discount').fill('20');
  await page.locator('#adjAmount').fill('50.55');
  await page.locator('#adjShip').fill('0');
  assert.equal(await page.locator('#adjTax').isEditable(), true,
    'Single tax must be an editable input, not a fixed-rate-only output');
  await page.locator('#adjTax').fill('3.92');
  assert.equal(Number(await page.locator('#adjSubtotal').inputValue()), 54.47,
    'Single Amount $50.55 and Minted tax $3.92 should subtotal to $54.47');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 54.47,
    'Single total should match Minted when Shipping is zero');
  await page.locator('#adjMintedTotal').fill('54.47');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted',
    'Single should report when calculated total matches Minted');
  await page.locator('#adjMintedTotal').fill('54.48');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(),
    'Mismatch: app $54.47, Minted $54.48, difference $0.01',
    'Single should report the app total, Minted total, and cent difference');
  await page.locator('#adjMintedTotal').fill('');
  assert.equal((await page.locator('#adjStatus').innerText()), 'Using tax from Minted.',
    'Single should report when user-entered Minted tax is being used');
  assert.ok((await page.locator('#noteText').inputValue()).includes('$54.47'),
    'Single customer note should use the entered Minted tax Total Adjustment');
  const singleMintedTotalCopy = page.locator('.adj-copy-btn[data-copy-from="#adjTotal"]');
  await singleMintedTotalCopy.click();
  await page.waitForFunction(() => document.querySelector('.adj-copy-btn[data-copy-from="#adjTotal"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '54.47',
    'Single Total Adjustment Copy should copy 54.47 for Amount $50.55 and Minted tax $3.92');
  await page.locator('#adjShip').fill('5.00');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 59.47,
    'Single Amount, typed tax, and $5 shipping should total $59.47');
  await page.locator('#adjMintedTotal').fill('59.47');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted',
    'A Minted total that includes $5 shipping should match the calculator total');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false,
    'A matching total including shipping should allow the customer note');
  await page.locator('#adjMintedTotal').fill('59.48');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true,
    'A shipping-inclusive total mismatch should block the customer note');
  await page.locator('#adjMintedTotal').fill('');
  await page.locator('#adjAmount').fill('50000');
  assert.equal(await page.locator('#adjLimitWarning').isVisible(), true,
    'Single Total Adjustment at or above $50,000 should show the Minted charge-limit warning');
  assert.equal(await page.locator('#adjLimitWarning').innerText(), 'Minted won\'t allow a charge of $50,000 or more.');
  await page.locator('#adjAmount').fill('50.55');
  assert.equal(await page.locator('#adjLimitWarning').isVisible(), false,
    'The Single charge-limit warning should clear below $50,000');
  await page.locator('#adjUseTax').uncheck();
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 0,
    'Unchecking Include Tax should set Single tax to zero');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 55.55,
    'Single total without tax should equal Amount plus Shipping');
  assert.equal(await page.locator('#adjTax').isDisabled(), true,
    'Single tax input should be disabled when Include Tax is unchecked');
  assert.equal(await page.locator('label[for="adjTax"]').innerText(), 'Tax excluded');
  await page.locator('#adjMintedTotal').fill('55.55');
  assert.equal(await page.locator('#adjMintedTotalCheck').innerText(), 'Matches Minted');
  assert.equal(await page.locator('#copyBtn').isDisabled(), false,
    'Include Tax off should not require a tax value once the final total matches Minted');
  assert.equal(await page.locator('#noteCopyGuard').isVisible(), false);
  assert.match(await page.locator('#noteText').inputValue(), /local taxes are excluded/,
    'The customer note must not claim local taxes are included when Include Tax is off');
  await page.locator('#adjMintedTotal').fill('55.56');
  assert.equal(await page.locator('#copyBtn').isDisabled(), true,
    'Include Tax off should still block copying when the final total differs by one cent');
  await page.locator('#adjMintedTotal').fill('');
  await page.locator('#adjUseTax').check();
  await page.locator('#adjShip').fill('0');
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 3.92,
    'Single should use the 7.75% estimate when there is no typed Minted tax');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 54.47,
    'Single estimate for Amount $50.55 should total $54.47');
  await page.locator('#adjAmount').fill('20');
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 1.55,
    'A $20 Amount should estimate $1.55 tax at 7.75%');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 21.55,
    'A $20 Amount should total $21.55 at the default rate');
  await page.locator('#adjAmount').fill('50.55');
  await page.locator('#taxRate').fill('8');
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 4.04,
    'Changing the rate to 8% should update the $50.55 estimate');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 54.59,
    'The changed rate should update Total Adjustment immediately');
  await page.locator('#taxRate').fill('7.75');
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 3.92,
    'Restoring 7.75% should restore the matching Minted estimate');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 54.47,
    'Restoring 7.75% should restore Total Adjustment to $54.47');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('backerfee-settings-v3')).taxRate), '7.75',
    'The last tax rate should be stored with the browser settings');
  assert.equal((await page.locator('#adjStatus').innerText()),
    'Unconfirmed total: tax is an estimate. Replace it with Minted\'s tax before using this total.',
    'Single estimate status should explain how to confirm tax');
  assert.equal(await page.locator('label[for="adjTotal"]').innerText(), 'Total Adjustment (estimate)',
    'Single total label should mark estimated tax totals as provisional');
  assert.ok((await page.locator('#adjTotal').getAttribute('class')).includes('is-unconfirmed'),
    'Single Total Adjustment should be visibly flagged while tax is estimated');
  await page.locator('#adjTax').fill('3.92');
  assert.equal(await page.locator('label[for="adjTotal"]').innerText(), 'Total Adjustment',
    'Single total label should drop estimate label after tax entry');
  assert.ok(!(await page.locator('#adjTotal').getAttribute('class')).includes('is-unconfirmed'),
    'Single unconfirmed style should clear after Minted tax is entered');
  await page.locator('#backer').fill('101');
  assert.equal(Number(await page.locator('#adjAmount').inputValue()), 80.8,
    'Changing Single original price should refill Amount');
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 6.26,
    'Changing Single original price should reset entered tax to the estimate');
  await page.locator('#backer').fill('100');
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 6.20,
    'Restoring the price should recompute the 7.75% estimate on Amount $80.00');
  await page.locator('#discount').fill('20');
  await page.waitForFunction(() =>
    document.querySelector('#adjAmount').value === '80.00' &&
    document.querySelector('#adjTotal').value === '86.20'
  );
  // Check Single-mode copy buttons using a calculated fee and Total Adjustment.
  const singleInputBoxes = await page.locator('#adjustmentCard .adjustment-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelector('.adjustment-value-input input')?.getBoundingClientRect()).filter(Boolean)
      .map((box) => ({ x: box.x, right: box.right, width: box.width }))
  );
  assert.equal(singleInputBoxes.length, 6, 'Single mode should have all six Financial Adjustment inputs');
  assert.ok(Math.max(...singleInputBoxes.map((box) => box.width)) - Math.min(...singleInputBoxes.map((box) => box.width)) <= 1,
    `Single Amount and Total Adjustment should be as wide as the other fields (boxes=${JSON.stringify(singleInputBoxes)})`);
  for (const selector of ['#adjAmount', '#adjTotal']) {
    const inputBox = await page.locator(selector).boundingBox();
    const buttonBox = await page.locator(`.adj-copy-btn[data-copy-from="${selector}"]`).boundingBox();
    assert.ok(inputBox && buttonBox && buttonBox.x < inputBox.x,
      `Single ${selector} Copy button should sit to the left of the input`);
  }
  const singleAmountCopy = page.locator('.adj-copy-btn[data-copy-from="#adjAmount"]');
  const singleTotalCopy = page.locator('.adj-copy-btn[data-copy-from="#adjTotal"]');
  assert.equal(await singleAmountCopy.count(), 1, 'Single mode should have one Amount copy button');
  assert.equal(await singleTotalCopy.count(), 1, 'Single mode should have one Total Adjustment copy button');
  await singleAmountCopy.click();
  await page.waitForFunction(() => document.querySelector('.adj-copy-btn[data-copy-from="#adjAmount"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '80.00',
    'Single Amount copy should copy a plain number');
  await singleTotalCopy.click();
  await page.waitForFunction(() => document.querySelector('.adj-copy-btn[data-copy-from="#adjTotal"]')?.textContent.trim() === 'Copied ✓');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '86.20',
    'Single Total Adjustment copy should copy a plain number');
  assert.ok((await page.locator('#noteText').inputValue()).includes('$86.20'),
    'Generated note should use the same Total Adjustment shown in the Single estimate');

  await page.screenshot({ path: screenshotName('single-mode-1440'), fullPage: true });

  // Invalid rates show a clear error and recover to the documented 7.75% default.
  await page.locator('#adjAmount').fill('50.55');
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
    assert.equal(Number(await page.locator('#adjTax').inputValue()), 3.92,
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
  await page.locator('#adjAmount').fill('50.55');
  assert.equal(Number(await page.locator('#adjTax').inputValue()), 3.92,
    'The stored-rate fallback should calculate tax without NaN');
  assert.equal(Number(await page.locator('#adjTotal').inputValue()), 54.47,
    'The stored-rate fallback should calculate the expected total');

  // Dark Batch theme regression check: confirm both Total Adjustment color states in Chromium.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length >= 2, null, { timeout: 15000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.locator('#themeBtn').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.locator('#modeBatchBtn').click();

  const visualRow = page.locator('#batchRows .batch-row').first();
  await visualRow.locator('.batch-name').fill('Dark Theme QA');
  await visualRow.locator('.batch-price').fill('100');
  await visualRow.locator('.batch-discount').fill('10');
  await visualRow.locator('.batch-adj-tax').fill('');
  await visualRow.locator('.batch-adj-minted-total').fill('');
  const visualTotal = visualRow.locator('.batch-adj-total');
  await page.waitForFunction(() => {
    const total = document.querySelector('#batchRows .batch-row .batch-adj-total');
    return total && total.value !== '' && total.classList.contains('is-unconfirmed');
  }, null, { timeout: 10000 });

  const darkUnconfirmedStyles = await page.evaluate(() => {
    const total = document.querySelector('#batchRows .batch-row .batch-adj-total');
    const taxCard = document.querySelector('.tax-rate-setting');
    const callout = document.querySelector('#batchPanel .adjustment-callout');
    const calculatorCard = document.querySelector('.calculator-card');
    const historyCard = document.querySelector('.history-card');
    const notePanel = document.querySelector('.note-panel');
    return {
      totalColor: getComputedStyle(total).color,
      unconfirmed: total.classList.contains('is-unconfirmed'),
      taxCardBackgroundImage: getComputedStyle(taxCard).backgroundImage,
      calloutText: getComputedStyle(callout).color,
      calloutBorder: getComputedStyle(callout).borderTopColor,
      calloutBackgroundImage: getComputedStyle(callout).backgroundImage,
      calculatorShadow: getComputedStyle(calculatorCard).boxShadow,
      historyShadow: getComputedStyle(historyCard).boxShadow,
      notePanelShadow: getComputedStyle(notePanel).boxShadow,
      htmlBackgroundColor: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackgroundRepeat: getComputedStyle(document.body).backgroundRepeat,
      bodyBackgroundSize: getComputedStyle(document.body).backgroundSize,
      bodyMinHeight: getComputedStyle(document.body).minHeight
    };
  });
  assert.equal(darkUnconfirmedStyles.unconfirmed, true, 'Estimated-tax total should carry the unconfirmed state');
  assert.equal(darkUnconfirmedStyles.totalColor, 'rgb(241, 154, 170)', 'Unconfirmed dark Batch total should be red, not pink accent');
  assert.ok(darkUnconfirmedStyles.taxCardBackgroundImage.includes('linear-gradient'), 'Dark Tax rate card should share the visible inner-card gradient');
  assert.equal(darkUnconfirmedStyles.calculatorShadow, 'none', 'Dark calculator wrapper should not draw a full-width inset highlight line');
  assert.equal(darkUnconfirmedStyles.historyShadow, 'none', 'Dark history wrapper should not draw a full-width inset highlight line');
  assert.equal(darkUnconfirmedStyles.notePanelShadow, 'none', 'Dark Customer Note panel should not draw a full-width inset highlight line');
  assert.equal(darkUnconfirmedStyles.htmlBackgroundColor, 'rgb(0, 0, 0)', 'Dark HTML background should be black behind the page gradient');
  assert.ok(darkUnconfirmedStyles.bodyBackgroundRepeat.includes('no-repeat'), 'Dark page gradient should not repeat and create edge seams');
  assert.ok(darkUnconfirmedStyles.bodyBackgroundSize.includes('100% 100%'), 'Dark page gradient should cover the full viewport area');
  assert.ok(parseFloat(darkUnconfirmedStyles.bodyMinHeight) >= 0, 'Dark body should retain an explicit minimum height');
  assert.equal(darkUnconfirmedStyles.calloutText, 'rgb(255, 243, 214)', 'Dark Batch approval warning text should remain readable warm white');
  assert.equal(darkUnconfirmedStyles.calloutBorder, 'rgb(251, 191, 36)', 'Dark Batch approval warning should keep its amber border');
  assert.ok(darkUnconfirmedStyles.calloutBackgroundImage.includes('linear-gradient'), 'Dark Batch approval warning should retain its amber-red gradient');
  await page.screenshot({ path: screenshotName('batch-dark-unconfirmed-total'), fullPage: true, animations: 'disabled' });

  // Enter the estimated tax as Minted tax and the matching total; confirmed total must be neutral white.
  await visualRow.locator('.batch-adj-tax').fill('6.98');
  await visualRow.locator('.batch-adj-minted-total').fill(await visualTotal.inputValue());
  await page.waitForFunction(() => {
    const row = document.querySelector('#batchRows .batch-row');
    return row?.querySelector('.batch-adj-total-check')?.textContent.trim() === 'Matches Minted' &&
      !row.querySelector('.batch-adj-total')?.classList.contains('is-unconfirmed');
  }, null, { timeout: 10000 });
  const darkConfirmedStyles = await page.evaluate(() => {
    const total = document.querySelector('#batchRows .batch-row .batch-adj-total');
    return { totalColor: getComputedStyle(total).color, unconfirmed: total.classList.contains('is-unconfirmed') };
  });
  assert.equal(darkConfirmedStyles.unconfirmed, false, 'Confirmed dark Batch total should clear the unconfirmed state');
  assert.equal(darkConfirmedStyles.totalColor, 'rgb(242, 242, 244)', 'Confirmed dark Batch total should be neutral white, not pink');
  await page.screenshot({ path: screenshotName('batch-dark-confirmed-total'), fullPage: true, animations: 'disabled' });

  // Toggle back to light mode and verify the existing light palette remains intact in both tabs.
  await page.locator('#themeBtn').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(
    await visualTotal.evaluate((el) => getComputedStyle(el).color),
    'rgb(96, 64, 120)',
    'Light Batch total should retain the original light-theme accent'
  );
  assert.equal(
    await page.locator('.tax-rate-setting').evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(252, 251, 253)',
    'Light Tax rate card should retain the original light surface'
  );
  await page.locator('#modeSingleBtn').click();
  assert.equal(await page.locator('#adjustmentCard').isVisible(), true, 'Single mode should remain usable after the theme toggle');
  assert.equal(
    await page.locator('#adjustmentCard').evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(252, 251, 253)',
    'Single-mode Financial Adjustment card should retain the original light surface'
  );
  await page.screenshot({ path: screenshotName('single-light-after-dark-batch'), fullPage: true, animations: 'disabled' });

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
      'Single and row-scoped Batch Amount/Total Adjustment copy buttons copy plain numbers with feedback',
      'remove-row reflow leaves the third row in the left column',
      'single-column layout at 1100px',
      'no horizontal overflow at 375px and 320px',
      'tax label fits inside its column at 320px',
      'Single mode two-column layout, full-width note, and no mascot',
      'no bridge popup or Tampermonkey text on load or after delay/reload',
      'Reset uses one centered modal with focus trapping, scroll locking, safe close actions, and a 320px layout',
      'Single and Batch customer notes stay blocked until Minted tax and total match',
      'desktop results and tax-rate setting have deliberate vertical spacing',
      'dark Batch estimated total is red and confirmed total is neutral white',
      'dark Batch approval warning and Tax rate surface retain expected colors',
      'light Batch and Single surfaces remain unchanged after theme toggling',
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
      'batch-real-values-first-row.png',
      'batch-dark-unconfirmed-total.png',
      'batch-dark-confirmed-total.png',
      'single-light-after-dark-batch.png'
    ]
  }, null, 2));
  await context.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
