import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');

test('exposes the complete single and batch workflow controls', () => {
  for (const id of [
    'modeSingleBtn',
    'modeBatchBtn',
    'batchPanel',
    'batchRows',
    'addBatchRowBtn',
    'calculateBatchBtn',
    'copyAllNotesBtn',
    'toastRoot',
    'adjustmentCard',
    'adjAmount',
    'adjTax',
    'adjSubtotal',
    'adjShip',
    'adjTotal',
    'adjUseTax',
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Runs locally in your browser/);
  assert.doesNotMatch(html, /adjustment-actions|adjCalc|adjCopy|fee-breakdown|history-heading-row|historyList|clearHistoryBtn|exportHistoryBtn/);
  assert.match(html, /<aside class="history-card single-only" aria-label="Customer note">/);
  assert.match(html, /class="note-panel single-only"/);
});

test('locks tax at 9.75% and makes Amount-driven totals live', () => {
  assert.match(script, /const TAX_RATE = 9\.75/);
  assert.match(html, /id="adjTax"[^>]*readonly/);
  assert.match(html, /id="adjUseTax" checked disabled/);
  assert.match(html, /Tax Based on Shipping Zip/);
  assert.doesNotMatch(html, /id="adjRate"|id="adjTaxOverride"/);
  assert.doesNotMatch(script, /adjRateInput|adjRateError|adjTaxOverrideInput|adjUseTaxInput|taxRate:|taxOverride:|useTax:/);
  assert.match(script, /function readAdjustmentField/);
  assert.match(script, /function clearAdjustmentResults\(\)/);
  assert.match(script, /function adjustmentCents\(amountValue, shipValue\)[\s\S]*Math\.round\(\(amountCents \* TAX_RATE\) \/ 100\)/);
  assert.match(script, /function computeAdjustment\(\)[\s\S]*currentAdjustment = adjustmentCents\(amount\.value, ship\.value\)/);
  assert.match(script, /const subtotalCents = amountCents \+ taxCents/);
  assert.match(script, /totalCents: subtotalCents \+ shipCents/);
  assert.match(script, /function clearResults\(\)[\s\S]*updateAdjustment\(0\)/);
  assert.doesNotMatch(script, /adjCopy|adjCalc|copyAdjustmentValue/);
  assert.match(script, /\[adjAmount, adjShipInput\]\.forEach\(\(el\) => \{[\s\S]*?el\.addEventListener\(['"]input['"][\s\S]*?computeAdjustment\(\)/);
  assert.match(script, /\[adjAmount, adjShipInput\]\.forEach\(\(el\) => \{[\s\S]*?el\.addEventListener\(['"]keydown['"][\s\S]*?event\.key === 'Enter'[\s\S]*?computeAdjustment\(\)/);
  assert.match(script, /noteState\.textContent = noteWasEdited \? 'Edited — ready to copy' : 'Updated automatically'/);
});

test('reproduces the four supplied Minted tax examples with cent rounding', () => {
  const rows = [
    { amount: 19.24, tax: 1.88, total: 21.12 },
    { amount: 18.24, tax: 1.78, total: 20.02 },
    { amount: 17.24, tax: 1.68, total: 18.92 },
    { amount: 18.00, tax: 1.76, total: 19.76 }
  ];
  for (const row of rows) {
    const amountCents = Math.round(row.amount * 100);
    const taxCents = Math.round((amountCents * 9.75) / 100);
    assert.equal(taxCents, Math.round(row.tax * 100), 'tax for Amount ' + row.amount);
    assert.equal(amountCents + taxCents, Math.round(row.total * 100), 'total for Amount ' + row.amount);
  }
});

test('keeps customer notes tied to Total Adjustment when available', () => {
  assert.match(script, /function noteFee\(data\)/);
  assert.match(script, /function refreshAdjustment\(\)/);
  assert.match(script, /buildCustomerNote\(\{ \.\.\.data, discountedPrice: noteFee\(data\) \}\)/);
  assert.match(script, /typeof currentAdjustment\?\.totalCents === 'number'/);
  assert.match(script, /function updateAdjustment\(finalFee\)/);
  assert.match(script, /adjAmount\.value = calculated \? \(Math\.round\(Number\(finalFee\) \* 100\) \/ 100\)\.toFixed\(2\) : ''/);
  assert.match(script, /noteWasEdited \? 'Edited — ready to copy' : 'Updated automatically'/);
  assert.match(html, /Copy Note/);
});

test('wires Batch mode controls to their handlers and initializes rows', () => {
  assert.match(script, /modeSingleBtn\.addEventListener\(['"]click['"]/);
  assert.match(script, /modeBatchBtn\.addEventListener\(['"]click['"]/);
  assert.match(script, /addBatchRowBtn\.addEventListener\(['"]click['"]/);
  assert.match(script, /calculateBatchBtn\.addEventListener\(['"]click['"]/);
  assert.match(script, /copyAllNotesBtn\.addEventListener\(['"]click['"]/);
  assert.match(script, /batchRows\.addEventListener\(['"]click['"]/);
  assert.match(script, /renderBatchRows\(\[createEmptyBatchRow\(\), createEmptyBatchRow\(\)\]\)/);
  assert.match(script, /setMode\(['"]single['"]\)/);
});

test('recalculates batch inputs live without writing history', () => {
  assert.match(script, /priceInput\.addEventListener\(['"]input['"][\s\S]*calculateBatch\(\)/);
  assert.match(script, /discountInputForRow\.addEventListener\(['"]input['"][\s\S]*calculateBatch\(\)/);
  assert.match(script, /calculateBatchBtn\.addEventListener\(['"]click['"][\s\S]*calculateBatch\(\)/);
});

test('keeps settings local to the browser without a History feature', () => {
  assert.match(script, /localStorage\.setItem\(STORAGE_KEYS\.settings/);
  assert.doesNotMatch(script, /historyList|clearHistoryBtn|exportHistoryBtn|STORAGE_KEYS\.history|function addHistory/);
});

test('persists shipping adjustment locally without a stored tax rate or override', () => {
  assert.match(script, /shippingAdjustment: adjShipInput\.value/);
  assert.match(script, /if \(typeof data\.shippingAdjustment === 'string' && data\.shippingAdjustment\.length <= 12\) adjShipInput\.value = data\.shippingAdjustment/);
  assert.doesNotMatch(script, /taxRate|taxOverride|useTax/);
  assert.match(script, /\[adjAmount, adjShipInput\]\.forEach/);
});


test('uses the same cent-rounded Minted adjustment calculation in Single and Batch', () => {
  assert.match(script, /function adjustmentCents\(amountValue, shipValue\)/);
  assert.match(script, /currentAdjustment = adjustmentCents\(amount\.value, ship\.value\)/);
  assert.match(script, /function applyBatchAdjustment\(row, data\)/);
  assert.match(script, /const adjustment = applyBatchAdjustment\(row, resultData\)/);
  assert.match(script, /class="batch-adj-amount"/);
  assert.match(script, /class="batch-adj-tax"/);
  assert.match(script, /class="batch-adj-subtotal"/);
  assert.match(script, /class="batch-adj-ship"/);
  assert.match(script, /class="batch-adj-total"/);
});

test('preserves Batch adjustment entries and uses Total Adjustment in copied notes', () => {
  assert.match(script, /amount: row\.querySelector\('\.batch-adj-amount'\)\?\.value/);
  assert.match(script, /ship: row\.querySelector\('\.batch-adj-ship'\)\?\.value/);
  assert.match(script, /amountEdited: row\.dataset\.amountEdited === '1'/);
  assert.match(script, /row\.dataset\.amountEdited = '1'/);
  assert.match(script, /if \(row\.dataset\.amountEdited !== '1'\) amountInput\.value = resultData\.discountedPrice\.toFixed\(2\)/);
  assert.match(script, /discountedPrice: adjustment \? adjustment\.totalCents \/ 100 : data\.discountedPrice/);
  assert.match(script, /function setMode\(mode\)[\s\S]*modeSingleBtn\.classList\.toggle\('active', !isBatch\)[\s\S]*dashboardCard\?\.classList\.toggle\('batch-mode', isBatch\)/);
  assert.match(script, /function removeBatchRow\(row\)[\s\S]*calculateBatch\(\)/);
  assert.match(script, /if \(snapshot\.mode === 'batch'\)[\s\S]*renderBatchRows\(snapshot\.rows\)[\s\S]*batchStatus\.textContent = 'Reset undone.'/);
});

test('gives Batch adjustment cards the full desktop width and a mobile-friendly layout', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.dashboard-card\.batch-mode \.calculator-card \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.batch-row-main\s*\{[\s\S]*grid-template-columns/);
  assert.match(css, /\.batch-adjust-grid\s*\{[\s\S]*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-areas:[\s\S]*"price discount"[\s\S]*"discount-amount final-fee"/);
});
