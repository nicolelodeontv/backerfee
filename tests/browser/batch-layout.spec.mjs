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
  page.on('pageerror', (error) => errors.push(error.message));

  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.equal(response?.status(), 200, `App returned HTTP ${response?.status()}`);
  await page.waitForFunction(() => document.querySelectorAll('#batchRows .batch-row').length >= 2, null, { timeout: 15000 });

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

  // Switch back to Single and confirm existing panels and mascot remain visible at desktop width.
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.waitForTimeout(150);
  await page.locator('#modeSingleBtn').click();
  await page.waitForFunction(() => document.querySelector('#batchPanel').hidden);
  assert.equal(await page.locator('.history-card').isVisible(), true, 'Single-mode note panel should remain visible');
  assert.equal(await page.locator('.history-card .mascot').isVisible(), true, 'Single-mode mascot should remain visible');
  assert.equal(await page.locator('#adjustmentCard').isVisible(), true, 'Single-mode Financial Adjustment should remain visible');
  assert.ok(await page.locator('.history-card .note-panel').boundingBox(), 'Single-mode generated note should have a layout box');
  await page.screenshot({ path: screenshotName('single-mode-1440'), fullPage: true });

  assert.deepEqual(errors, [], `Browser should not emit runtime errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({
    result: 'PASS',
    baseUrl,
    viewportChecks: [1440, 1100, 375],
    checks: [
      'four-row ordering',
      'individual row calculations and focus retention',
      'Amount and Shipping isolate to their own row',
      'three-column Financial Adjustment at desktop width',
      'generated note has one line per row and copies completely',
      'remove-row reflow leaves the third row in the left column',
      'single-column layout at 1100px',
      'no horizontal overflow at 375px',
      'Single mode panels and mascot remain visible',
      'no uncaught browser runtime errors'
    ],
    screenshots: [
      'desktop-1440-four-rows.png',
      'desktop-1440-three-rows.png',
      'tablet-1100-three-rows.png',
      'phone-375-three-rows.png',
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
