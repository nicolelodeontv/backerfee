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

  // Switch to Batch, add rows 3 and 4, and fill distinct values in all rows.
  await page.locator('#modeBatchBtn').click();
  await page.waitForFunction(() => !document.querySelector('#batchPanel').hidden);
  await page.locator('#addBatchRowBtn').click();
  await page.locator('#addBatchRowBtn').click();

  const rows = page.locator('#batchRows .batch-row');
  assert.equal(await rows.count(), 4, 'Batch should have four rows after adding two');

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

  let boxes = await positions(rows);
  assertSameLine(boxes[0], boxes[1], 'Rows 1 and 2 should be on the top line');
  assert.ok(boxes[1].x > boxes[0].x + 100, 'Row 2 should sit to the right of row 1');
  assert.ok(boxes[2].y > boxes[0].y + 20, 'Row 3 should be below row 1');
  assertSameColumn(boxes[0], boxes[2], 'Row 3 should start the next line in the left column');
  assertSameColumn(boxes[1], boxes[3], 'Row 4 should be in the right column below row 2');

  await page.screenshot({ path: screenshotName('desktop-1440-four-rows'), fullPage: true });

  // Financial Adjustment: three fields on the first line and two on the second.
  const adjustmentFields = rows.nth(0).locator('.batch-adjust-grid .batch-adj-field');
  assert.equal(await adjustmentFields.count(), 5);
  const adjustmentBoxes = await positions(adjustmentFields);
  assertSameLine(adjustmentBoxes[0], adjustmentBoxes[1], 'Amount and Tax should share the first adjustment line');
  assertSameLine(adjustmentBoxes[1], adjustmentBoxes[2], 'Tax and Subtotal should share the first adjustment line');
  assert.ok(adjustmentBoxes[3].y > adjustmentBoxes[2].y + 10, 'Shipping should begin the second adjustment line');
  assertSameLine(adjustmentBoxes[3], adjustmentBoxes[4], 'Shipping and Total should share the second adjustment line');
  for (let i = 0; i < 5; i += 1) {
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
  for (const index of [3, 4]) {
    const labelHeight = await adjustmentFields.nth(index).locator('.batch-adj-label').evaluate((el) => getComputedStyle(el).minHeight);
    assert.equal(labelHeight, '0px',
      `Batch second-line field ${index + 1} should not reserve extra label height`);
  }
  const taxLabel = adjustmentFields.nth(1).locator('.batch-adj-label');
  assert.ok(await taxLabel.isVisible(), 'Tax label and checkbox row should remain visible');
  assert.ok(await taxLabel.locator('.adj-check input').isVisible(), 'Include Tax checkbox should remain visible');
  const taxLabelBox = await taxLabel.boundingBox();
  const adjustmentBox = await rows.nth(0).locator('.batch-adjust').boundingBox();
  assert.ok(taxLabelBox && adjustmentBox &&
    taxLabelBox.x >= adjustmentBox.x - 1 &&
    taxLabelBox.x + taxLabelBox.width <= adjustmentBox.x + adjustmentBox.width + 1,
  'Tax label should stay inside the Financial Adjustment box');

  // Keep focus in the price input while live calculation updates its own row.
  const firstPrice = rows.nth(0).locator('.batch-price');
  await firstPrice.fill('123');
  await firstPrice.pressSequentially('.45');
  assert.equal(await firstPrice.inputValue(), '123.45', 'Typing should not lose or reorder characters');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#batchRows .batch-row:first-child .batch-price')),
    true, 'The price input should keep focus during recalculation');
  assert.equal(await rows.nth(0).locator('.batch-result-final').textContent(), '$111.10',
    'Typing a price should recalculate the same row immediately');

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
  assert.equal(await rows.nth(0).locator('.batch-adj-total').inputValue(), '113.25',
    'Row 1 total should use its entered Amount and Shipping plus 9.75% tax');
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
  await page.locator('#copyAllNotesBtn').click();
  await page.waitForFunction(() => document.querySelector('#batchStatus').textContent.includes('Customer note copied.'), null, { timeout: 8000 });
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboardText, noteText, 'Copy Note should copy the complete generated note');

  // Exercise a realistic large amount, blank Card names, and status text in the two-column Batch layout.
  await rows.nth(0).locator('.batch-name').fill('');
  await rows.nth(1).locator('.batch-name').fill('');
  await rows.nth(2).locator('.batch-name').fill('Premium');
  await rows.nth(3).locator('.batch-name').fill('');
  const largeAmount = rows.nth(0).locator('.batch-adj-amount');
  const largeShipping = rows.nth(0).locator('.batch-adj-ship');
  await largeAmount.fill('1124.88');
  await largeShipping.fill('0');
  await page.waitForFunction(() =>
    document.querySelector('#batchRows .batch-row .batch-adj-total')?.value === '1234.56'
  );
  const largeTotal = rows.nth(0).locator('.batch-adj-total');
  assert.equal(await largeTotal.inputValue(), '1234.56',
    'A large Total Adjustment should calculate to $1,234.56');
  const largeTotalBox = await largeTotal.boundingBox();
  assert.ok(largeTotalBox && largeTotalBox.width >= 70,
    `Large Total Adjustment needs enough input width to display its value (box=${JSON.stringify(largeTotalBox)})`);
  const largeStatus = rows.nth(0).locator('.batch-adj-status');
  const statusText = await largeStatus.textContent();
  assert.ok(statusText.includes('Enter $1,124.88 as the Amount in Minted.'),
    'Large-value status should show the exact Amount to enter in Minted');
  assert.ok(statusText.includes('Total Adjustment: $1,234.56.'),
    'Large-value status should show the formatted Total Adjustment');
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
  assert.ok(statusMetrics.every((item) => item.height <= item.lineHeight * 2 + 2),
    `Batch status text should not wrap beyond two readable lines in the two-column cards: ${JSON.stringify(statusMetrics)}`);

  const realValueNote = await note.inputValue();
  const realValueLines = realValueNote.split('\\n').filter((line) => /^".+" cards: \\$/i.test(line));
  assert.equal(realValueLines.length, 4,
    'Real-value note should still include exactly one fee line per valid row');
  assert.deepEqual(realValueLines.map((line) => line.match(/^"([^"]+)" cards:/)?.[1]),
    ['Card 1', 'Card 2', 'Premium', 'Card 4'],
    'Blank Card names should fall back to Card 1, Card 2, and subsequent row numbers');
  assert.ok(realValueLines[0].includes('$1,234.56'),
    'Generated note should include the large Total Adjustment for row 1');
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
  const singleAdjustmentBox = await page.locator('#adjustmentCard').boundingBox();
  const singleNoteBox = await page.locator('.history-card .note-panel').boundingBox();
  assert.ok(singleCardBox && singleCalculatorBox && singleHistoryBox && singleDetailsBox && singleResultsBox && singleAdjustmentBox && singleNoteBox,
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
  const singleAdjustmentBottom = singleAdjustmentBox.y + singleAdjustmentBox.height;
  assert.ok(Math.abs(singleResultsBottom - singleAdjustmentBottom) < 3,
    `Single-mode fee results and Financial Adjustment should share a bottom line (results=${singleResultsBottom}, adjustment=${singleAdjustmentBottom})`);
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
  await page.screenshot({ path: screenshotName('single-mode-1440'), fullPage: true });

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
      'remove-row reflow leaves the third row in the left column',
      'single-column layout at 1100px',
      'no horizontal overflow at 375px and 320px',
      'tax label fits inside its column at 320px',
      'Single mode two-column layout, full-width note, and no mascot',
      'no uncaught browser runtime errors'
    ],
    screenshots: [
      'desktop-1440-four-rows.png',
      'desktop-1440-three-rows.png',
      'tablet-1100-three-rows.png',
      'phone-375-three-rows.png',
      'phone-320-three-rows.png',
      'single-mode-1440.png'
    ]
  }, null, 2));
  await context.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
