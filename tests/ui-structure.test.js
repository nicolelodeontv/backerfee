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
    'adjRate',
    'adjAmount',
    'adjTax',
    'adjSubtotal',
    'adjShipOut',
    'adjTotal',
    'adjTaxOverride',
    'adjShip',
    'adjUseTax',
    'adjCopy',
    'adjCopyTotal'
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Runs locally in your browser/);
  assert.doesNotMatch(html, /history-totals/);
});

test('keeps customer-note behavior and wires Minted Amount, tax, and shipping', () => {
  assert.match(script, /buildCustomerNote\(data\)/);
  assert.match(script, /adjRateInput\.addEventListener\(['"]input['"]/);
  assert.match(script, /function readAdjustmentField/);
  assert.match(script, /function updateAdjustment\(finalFee\)/);
  assert.match(script, /const amountCents = Math\.round\(Number\(finalFee\) \* 100\)/);
  assert.match(script, /Math\.round\(\(amountCents \* rate\.value\) \/ 100\)/);
  assert.match(script, /const totalCents = subtotalCents \+ shipCents/);
  assert.match(script, /adjTaxOverrideInput/);
  assert.match(script, /adjUseTaxInput\.checked/);
  assert.match(script, /copyAdjustmentValue\(currentAdjustment\?\.amountCents/);
  assert.match(script, /copyAdjustmentValue\(currentAdjustment\?\.totalCents/);
  assert.match(script, /buildCustomerNote\(\{\s*discountedPrice:/);
  assert.match(script, /Copy Note/);
});

test('wires the Batch mode controls to their handlers and initializes rows', () => {
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

test('persists the Minted tax, shipping, and include-tax controls locally', () => {
  assert.match(script, /taxOverride: adjTaxOverrideInput\.value/);
  assert.match(script, /shippingAdjustment: adjShipInput\.value/);
  assert.match(script, /useTax: adjUseTaxInput\.checked/);
  assert.match(script, /\[adjTaxOverrideInput, adjShipInput, adjUseTaxInput\]\.forEach/);
});
