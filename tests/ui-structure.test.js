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
    'exportHistoryBtn',
    'clearHistoryBtn',
    'toastRoot',
    'adjustmentCard',
    'adjAmount',
    'adjTax',
    'adjSubtotal',
    'adjShip',
    'adjTotal',
    'adjUseTax',
    'adjCalc',
    'adjCopy',
    'adjCopyTotal'
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Runs locally in your browser/);
  assert.doesNotMatch(html, /history-totals/);
});

test('locks tax at 9.75% and makes Amount-driven totals live', () => {
  assert.match(script, /const TAX_RATE = 9\.75/);
  assert.match(html, /id="adjTax"[^>]*readonly/);
  assert.match(html, /id="adjUseTax" checked disabled/);
  assert.match(html, /Tax Based on Shipping Zip/);
  assert.match(html, /id="adjCalc"/);
  assert.doesNotMatch(html, /id="adjRate"|id="adjTaxOverride"/);
  assert.doesNotMatch(script, /adjRateInput|adjRateError|adjTaxOverrideInput|adjUseTaxInput|taxRate:|taxOverride:|useTax:/);
  assert.match(script, /function readAdjustmentField/);
  assert.match(script, /function clearAdjustmentResults\(\)/);
  assert.match(script, /function computeAdjustment\(\)[\s\S]*Math\.round\(\(amountCents \* TAX_RATE\) \/ 100\)/);
  assert.match(script, /const subtotalCents = amountCents \+ taxCents/);
  assert.match(script, /const totalCents = subtotalCents \+ shipCents/);
  assert.match(script, /adjCalcBtn\.addEventListener\(['"]click['"], computeAdjustment\)/);
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
  assert.match(script, /typeof currentAdjustment\\?\\.totalCents === 'number'/);
  assert.match(script, /function updateAdjustment\(finalFee\)/);
  assert.match(script, /adjAmount\.value = calculated \? \(Math\.round\(Number\(finalFee\) \* 100\) \/ 100\)\.toFixed\(2\) : ''/);
  assert.match(script, /copyAdjustmentValue\(Math\.round\(Number\(raw\) \* 100\), 'Enter this in Minted’s Amount field\.'\)/);
  assert.match(script, /copyAdjustmentValue\(currentAdjustment\?\.totalCents, 'This is the Total Adjustment\.'\)/);
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
  assert.match(script, /priceInput\.addEventListener\(['"]input['"][\s\S]*calculateBatch\(\{ recordHistory: false \}\)/);
  assert.match(script, /discountInputForRow\.addEventListener\(['"]input['"][\s\S]*calculateBatch\(\{ recordHistory: false \}\)/);
  assert.match(script, /calculateBatchBtn\.addEventListener\(['"]click['"][\s\S]*calculateBatch\(\)/);
});

test('keeps history and settings local to the browser', () => {
  assert.match(script, /localStorage\.getItem\(STORAGE_KEYS\.history\)/);
  assert.match(script, /localStorage\.setItem\(STORAGE_KEYS\.history/);
  assert.match(script, /localStorage\.setItem\(STORAGE_KEYS\.settings/);
  assert.match(script, /const MAX_HISTORY = 20/);
});

test('persists shipping adjustment locally without a stored tax rate or override', () => {
  assert.match(script, /shippingAdjustment: adjShipInput\.value/);
  assert.match(script, /if \(typeof data\.shippingAdjustment === 'string' && data\.shippingAdjustment\.length <= 12\) adjShipInput\.value = data\.shippingAdjustment/);
  assert.doesNotMatch(script, /taxRate|taxOverride|useTax/);
  assert.match(script, /\[adjAmount, adjShipInput\]\.forEach/);
});
