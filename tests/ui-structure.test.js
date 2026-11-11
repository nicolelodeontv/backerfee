import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('exposes the complete single and batch workflow controls', () => {
  for (const id of [
    'modeSingleBtn',
    'modeBatchBtn',
    'batchPanel',
    'batchRows',
    'addBatchRowBtn',
    'copyAllNotesBtn',
    'toastRoot',
    'adjustmentCard',
    'taxRate',
    'adjAmount',
    'adjTax',
    'adjSubtotal',
    'adjShip',
    'adjTotal',
    'adjMintedTotal',
    'adjMintedTotalCheck',
    'adjUseTax',
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Runs locally in your browser/);
  assert.doesNotMatch(html, /adjustment-actions|adjCalc|adjCopy|fee-breakdown|history-heading-row|historyList|clearHistoryBtn|exportHistoryBtn/);
  assert.match(html, /<aside class="history-card single-only" aria-label="Customer note">/);
  assert.match(html, /class="note-panel single-only"/);
});

test('uses an editable tax rate, read-only amount/tax outputs, and exact total confirmation', () => {
  assert.match(script, /const DEFAULT_TAX_RATE = 7\.75/);
  assert.match(script, /value > 0 && value <= 100 \? value : null/);
  assert.match(script, /function parseTaxRate\(raw\)/);
  assert.match(script, /function updateMintedTotalComparison\(input, status, totalCents\)/);
  assert.match(script, /function estimateTaxCents\(amountCents\)/);
  assert.ok(script.includes('function adjustmentCents(amountValue, shipValue, includeTax = true)'));
  assert.ok(script.includes("Tax excluded. Enter Total from Minted and confirm an exact match before using this total."));
  assert.ok(script.includes("Tax excluded. Enter Total from Minted and confirm an exact match before using this total."));
  assert.match(html, /<output id="adjAmount"[^>]*aria-label="Amount to enter in Minted"/);
  assert.match(html, /<output id="adjTax"[^>]*aria-label="Estimated tax"/);
  assert.doesNotMatch(html, /<input[^>]+id="adjAmount"/);
  assert.doesNotMatch(html, /<input[^>]+id="adjTax"/);
  assert.doesNotMatch(html, /data-copy-from="#adjAmount"|aria-label="Copy Amount"/);
  assert.match(html, /data-copy-from="#adjTotal"[^>]*disabled/);
  assert.doesNotMatch(html, /Total from Minted \(optional\)|Total from Minted, optional/);
  assert.match(html, /id="adjUseTax" checked/);
  assert.doesNotMatch(html, /id="adjUseTax"[^>]*disabled/);
  assert.match(html, /id="taxRate"[^>]*value="7\.75"/);
  assert.match(html, /id="taxRateError" role="alert"/);
  assert.match(html, /Estimate: 7\.75%/);
  assert.match(script, /taxRate: String\(taxRate\)/);
  assert.match(script, /taxRateInput\.addEventListener\(['"]input['"]/);
  assert.ok(script.includes("Unconfirmed total: tax is an estimate. Enter Total from Minted; adjust Tax rate % until the totals match before using this total."));
  assert.ok(html.includes('for="adjTotal">Total Adjustment (estimate)</label>'));
  assert.ok(script.includes("totalCopyBtn.disabled = !totalMatches"));
  assert.ok(script.includes("adjTotalCopyBtn.disabled = !totalMatches"));
  assert.match(script, /if \(!button \|\| button\.disabled\) return/);
  assert.ok(script.includes('const adj = adjustmentCents(amount.value, ship.value, useTaxInput.checked);'));
  assert.ok(script.includes('const current = adjustmentCents(amount.value, ship.value, includeTax);'));
  assert.doesNotMatch(script, /Using tax from Minted\./);
  assert.match(script, /const subtotalCents = amountCents \+ taxCents/);
  assert.match(script, /totalCents: subtotalCents \+ shipCents/);
  assert.match(script, /totalCents < 5000000/);
});

test('reproduces the estimate and shipping arithmetic in integer cents', () => {
  const amountCents = Math.round(50.55 * 100);
  const estimateCents = Math.round((amountCents * 7.75) / 100);
  assert.equal(estimateCents, 392);
  assert.equal(amountCents + estimateCents, 5447);
  const twentyDollarCents = Math.round(20 * 100);
  const twentyDollarTaxCents = Math.round((twentyDollarCents * 7.75) / 100);
  assert.equal(twentyDollarTaxCents, 155);
  assert.equal(twentyDollarCents + twentyDollarTaxCents, 2155);
  const changedRateTaxCents = Math.round((twentyDollarCents * 8) / 100);
  assert.equal(changedRateTaxCents, 160);
  assert.equal(twentyDollarCents + changedRateTaxCents, 2160);
  const mintedTaxCents = Math.round(3.92 * 100);
  assert.equal(amountCents + mintedTaxCents, 5447);
  assert.equal(amountCents + mintedTaxCents + 500, 5947);
});

test('keeps customer notes tied to Total Adjustment only after exact confirmation', () => {
  assert.match(script, /function noteFee\(data\)/);
  assert.match(script, /function refreshAdjustment\(\)/);
  assert.match(script, /buildCustomerNote\(\{[\s\S]*?discountedPrice: noteFee\(data\),[\s\S]*?includesLocalTaxes: adjUseTaxInput\.checked[\s\S]*?\}\)/);
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
  assert.doesNotMatch(script, /calculateBatchBtn/);
  assert.doesNotMatch(html, /calculateBatchBtn|Calculate all/);
  assert.match(script, /copyAllNotesBtn\.addEventListener\(['"]click['"]/);
  assert.match(script, /batchRows\.addEventListener\(['"]click['"]/);
  assert.match(script, /renderBatchRows\(\[createEmptyBatchRow\(\), createEmptyBatchRow\(\)\]\)/);
  assert.match(script, /setMode\(['"]single['"]\)/);
});

test('recalculates batch inputs live without writing history', () => {
  assert.match(script, /priceInput\.addEventListener\(['"]input['"][\s\S]*calculateBatch\(\)/);
  assert.match(script, /discountInputForRow\.addEventListener\(['"]input['"][\s\S]*calculateBatch\(\)/);
  assert.match(script, /function setMode\(mode\)[\s\S]*if \(isBatch\) \{[\s\S]*querySelectorAll\('\.batch-price'\)\.forEach\(formatBatchPrice\)[\s\S]*calculateBatch\(\)/);
  assert.match(script, /setMode\(['"]single['"]\);\s*calculateBatch\(\);/);
  assert.match(script, /function renderBatchRows\(rows\)[\s\S]*calculateBatch\(\);\s*\}/);
});

test('keeps settings local to the browser without a History feature', () => {
  assert.match(script, /localStorage\.setItem\(STORAGE_KEYS\.settings/);
  assert.doesNotMatch(script, /historyList|clearHistoryBtn|exportHistoryBtn|STORAGE_KEYS\.history|function addHistory/);
});

test('persists shipping settings while computing Batch tax from the shared rate', () => {
  assert.match(script, /shippingAdjustment: adjShipInput\.value/);
  assert.match(script, /if \(typeof data\.shippingAdjustment === 'string' && data\.shippingAdjustment\.length <= 12\) adjShipInput\.value = data\.shippingAdjustment/);
  assert.match(script, /tax: row\.querySelector\('\.batch-adj-tax'\)\?\.value/);
  assert.match(script, /useTax: row\.querySelector\('\.batch-adj-use-tax'\)\?\.checked/);
  assert.match(script, /useTax: rowData\.useTax !== false/);
  assert.match(script, /useTaxInput\.addEventListener\(['"]change['"], \(\) => \{\s*calculateBatch\(\)/);
  assert.doesNotMatch(script, /taxInput\.addEventListener|adjTax\.addEventListener/);
  assert.match(html, /<output id="adjTax"/);
  assert.match(script, /<output class="batch-adj-tax batch-adj-output"/);
});

test('uses the same rate-based cent-rounded adjustment calculation in Single and Batch', () => {
  assert.ok(script.includes('function adjustmentCents(amountValue, shipValue, includeTax = true)'));
  assert.ok(script.includes('const current = adjustmentCents(amount.value, ship.value, includeTax);'));
  assert.match(script, /function applyBatchAdjustment\(row, data\)/);
  assert.ok(script.includes('const adj = adjustmentCents(amount.value, ship.value, useTaxInput.checked);'));
  assert.match(script, /class="batch-adj-amount batch-adj-output"/);
  assert.match(script, /class="batch-adj-tax batch-adj-output"/);
  assert.match(script, /class="batch-adj-subtotal"/);
  assert.match(script, /class="batch-adj-ship"/);
  assert.match(script, /class="batch-adj-total"/);
});

test('derives the displayed Batch Amount and tax from the rate and current fee', () => {
  assert.match(script, /amount: row\.querySelector\('\.batch-adj-amount'\)\?\.value/);
  assert.match(script, /ship: row\.querySelector\('\.batch-adj-ship'\)\?\.value/);
  assert.match(script, /amountInput\.value = resultData\.discountedPrice\.toFixed\(2\)/);
  assert.doesNotMatch(script, /amountInput\.addEventListener\(['"]input['"]/);
  assert.doesNotMatch(script, /taxInput\.addEventListener\(['"]input['"]/);
  assert.match(script, /feeCents: adjustment \? adjustment\.totalCents : Math\.round\(data\.discountedPrice \* 100\)/);
  assert.match(script, /function setMode\(mode\)[\s\S]*modeSingleBtn\.classList\.toggle\('active', !isBatch\)[\s\S]*dashboardCard\?\.classList\.toggle\('batch-mode', isBatch\)/);
  assert.match(script, /function removeBatchRow\(row\)[\s\S]*calculateBatch\(\)/);
  assert.match(script, /if \(snapshot\.mode === 'batch'\)[\s\S]*renderBatchRows\(snapshot\.rows\)[\s\S]*batchStatus\.textContent = 'Reset undone\.'/);
});

test('builds one live Batch customer note with per-row names and fees', () => {
  assert.match(html, /class="note-panel batch-note"/);
  assert.match(html, /id="batchNoteText"[^>]*readonly/);
  assert.match(html, /id="batchNoteState"/);
  assert.ok(html.includes('<button class="copy-btn" id="copyAllNotesBtn" type="button" disabled><span class="t-text-swap">Copy Note</span></button>'));
  assert.match(script, /function buildBatchNote\(items\)/);
  assert.ok(script.includes("const names = quoted.length > 1"));
  assert.ok(script.includes("join(', ') + ' and '"));
  assert.ok(script.includes("const sameFee = new Set(items.map((item) => item.feeCents)).size === 1;"));
  assert.ok(script.includes("feeText + ' per card, based on the quantity"));
  assert.match(script, /name: row\.querySelector\('\.batch-name'\)\?\.value \?\? ''/);
  assert.ok(script.includes("const typedName = row.querySelector('.batch-name').value.trim();"));
  assert.ok(script.includes("name: typedName || 'Card ' + (index + 1),"));
  assert.ok(script.includes("named: Boolean(typedName),"));
  assert.ok(script.includes("input.classList.toggle('needs-name', hasResult && !input.value.trim());"));
  assert.ok(script.includes("batchNoteState.classList.toggle('is-warning', missing > 0);"));
  assert.match(script, /nameInput\.addEventListener\(['"]input['"], \(\) => calculateBatch\(\)\)/);
  assert.match(script, /function updateBatchNote\(results\)[\s\S]*batchNoteText\.value = buildBatchNote/);
  assert.match(script, /async function copyAllNotes\(\)[\s\S]*const notes = batchNoteText\.value/);
  assert.match(script, /updateBatchNote\(results\);\s*batchResults = results;/);
});

test('warns about missing Batch card names without disabling copying', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.ok(script.includes('const missing = results.filter((item) => !item.named).length;'));
  assert.ok(script.includes("missing + ' card name' + (missing === 1 ? '' : 's') + ' missing'"));
  assert.ok(css.includes('.note-state.is-warning { color: #fbbf24; }'));
  assert.ok(css.includes('.batch-card-name input.needs-name {'));
  assert.ok(css.includes('border-color: #f59e0b;'));
  assert.ok(css.includes('box-shadow: 0 0 0 3px rgba(245, 158, 11, .18);'));
  assert.ok(script.includes('async function copyAllNotes() {'));
});

test('gives Batch adjustment cards the full desktop width and a mobile-friendly layout', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.dashboard-card\.batch-mode \.calculator-card \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.batch-row-main\s*\{[\s\S]*grid-template-columns/);
  assert.match(css, /\.batch-adjust-grid\s*\{[\s\S]*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-areas:[\s\S]*"price discount"[\s\S]*"discount-amount final-fee"/);
  assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*?\.batch-grid-header \{\s*display: none;\s*\}/);
  assert.match(css, /\.batch-row-main > \.batch-field:first-child::before[\s\S]*?content: "Original Price"/);
  assert.match(css, /\.batch-row-main > \.batch-field:nth-child\(2\)::before[\s\S]*?content: "Discount"/);
  assert.match(css, /\.batch-row-main > \.batch-result:nth-child\(3\)::before\s*\{\s*content: "Discount Amount";/);
  assert.match(css, /\.batch-row-main > \.batch-result:nth-child\(4\)::before\s*\{\s*content: "Final Fee";/);
});


test('automatically formats and recalculates Batch on restore and removes Calculate all', () => {
  assert.doesNotMatch(html, /id="calculateBatchBtn"|Calculate all/);
  assert.doesNotMatch(script, /calculateBatchBtn/);
  assert.match(script, /if \(isBatch\) \{\s*batchRows\.querySelectorAll\('\.batch-price'\)\.forEach\(formatBatchPrice\);\s*calculateBatch\(\);\s*\}/);
  assert.match(script, /renderBatchRows\((?:loadBatchDraft\(\) \?\? )?\[createEmptyBatchRow\(\), createEmptyBatchRow\(\)\]\);\s*setMode\('single'\);\s*calculateBatch\(\);/);
});


test('defines every Batch validation and formatting helper used at startup and while typing', () => {
  for (const functionName of [
    'formatBatchPrice',
    'setBatchFieldError',
    'clampBatchDiscount',
    'validateBatchRow'
  ]) {
    assert.match(script, new RegExp('function ' + functionName + '\\('));
  }
  assert.ok(script.includes('function renderBatchRows(rows)') && script.includes('function formatBatchPrice(input)'));
  assert.ok(script.includes('function calculateBatch()') && script.includes('function setBatchFieldError(input, errorElement, message, { shake = false } = {})'));
  assert.ok(script.includes('function calculateBatch()') && script.includes('function validateBatchRow(row,'));
  assert.ok(script.includes("console.error('Batch calculation failed:', error)"));
});


test('grows Single and Batch notes to fit and shows lead-approval reminders', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.ok(script.includes('function fitNote(el) {'));
  assert.ok(script.includes("el.style.height = 'auto';"));
  assert.ok(script.includes("el.style.height = (el.scrollHeight + 2) + 'px';"));

  const noteUpdater = script.slice(script.indexOf('function updateNote('), script.indexOf('function calculateLive()'));
  assert.equal(noteUpdater.split('fitNote(noteText);').length - 1, 2);
  assert.ok(script.includes("noteText.addEventListener('input'"));
  assert.ok(script.includes('if (!isBatch) fitNote(noteText);'));
  assert.ok(script.includes('if (isBatch) fitNote(batchNoteText);'));

  const batchNoteUpdater = script.slice(script.indexOf('function updateBatchNote('), script.indexOf('async function copyAllNotes()'));
  assert.equal(batchNoteUpdater.split('fitNote(batchNoteText);').length - 1, 2);

  assert.ok(css.includes('.note-panel textarea {'));
  assert.ok(css.includes('min-height: 360px;'));
  assert.ok(css.includes('overflow-y: hidden;'));
  assert.ok(css.includes('resize: none;'));
  assert.ok(css.includes('@supports (field-sizing: content)'));
  assert.ok(css.includes('field-sizing: content;'));
  const singleNoteStart = html.indexOf('<textarea id="noteText"');
  const singleNoteEnd = html.indexOf('>', singleNoteStart);
  assert.ok(singleNoteStart >= 0 && !html.slice(singleNoteStart, singleNoteEnd).includes('readonly'));

  const reminder = 'Please obtain lead approval before entering the final Total Adjustment.';
  const adjustmentHeading = html.indexOf('class="adjustment-heading"');
  const singleCallout = html.indexOf('class="adjustment-callout" role="note"', adjustmentHeading);
  const adjustmentRows = html.indexOf('class="adjustment-rows"');
  assert.ok(singleCallout > adjustmentHeading && singleCallout < adjustmentRows);
  assert.ok(html.slice(singleCallout, adjustmentRows).includes(reminder));

  const batchTrust = html.indexOf('class="local-trust batch-trust"');
  const batchCallout = html.indexOf('class="adjustment-callout" role="note"', batchTrust);
  const batchGrid = html.indexOf('class="batch-grid batch-grid-header"', batchTrust);
  assert.ok(batchCallout > batchTrust && batchCallout < batchGrid);
  assert.ok(html.slice(batchCallout, batchGrid).includes(reminder));
  assert.ok(css.includes('.adjustment-callout {'));
  assert.ok(css.includes('background: var(--soft);'));
  assert.ok(css.includes('color: var(--ink);'));
});


test('omits the optional sprite mascot from the Single note and safely skips its enhancement', () => {
  const enhancements = readFileSync(new URL('../ui-enhancements.js', import.meta.url), 'utf8');
  const asideStart = html.indexOf('<aside class="history-card single-only"');
  const asideEnd = html.indexOf('</aside>', asideStart);
  assert.ok(asideStart >= 0 && asideEnd > asideStart, 'Single-mode customer note aside should remain in the document');
  assert.equal(html.includes('id="mascot"'), false, 'Mascot element should be removed from the page');
  assert.equal(html.includes('class="mascot"'), false, 'No mascot placeholder should remain in the page');
  assert.match(enhancements, /const el = document\.getElementById\('mascot'\);\s*if \(!el\) return;/,
    'Optional mascot behavior should exit safely when the element is absent');
});


test('installs transitions.dev motion recipes with reduced-motion support', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const skill = readFileSync(new URL('../.agents/skills/transitions-dev/SKILL.md', import.meta.url), 'utf8');
  const lock = JSON.parse(readFileSync(new URL('../skills-lock.json', import.meta.url), 'utf8'));

  assert.match(skill, /name: transitions-dev/);
  assert.equal(lock.skills['transitions-dev'].source, 'Jakubantalik/transitions.dev');
  assert.match(script, /function setDigitDisplay\(element, value, \{ restart = false \} = \{\}\)/);
  assert.match(script, /if \(restart\) scheduleDigitAnimation\(element, previousStableText, nextText\)/);
  assert.match(script, /function setPopInputValue\(input, value\)/);
  assert.match(script, /const MOTION_INPUT_PAUSE_MS = 200/);
  assert.match(script, /function renderDigitAnimation\(element, previousText, nextText\)/);
  assert.match(script, /function clearPopInputMotion\(input\)/);
  assert.match(script, /function setCopyButtonText\(button, nextText\)/);
  assert.match(script, /function setInputMotionError\(input, hasError, \{ shake = false \} = \{\}\)/);
  assert.match(script, /function replayPanelReveal\(panel\)/);

  for (const selector of [
    '.t-digit-group.is-animating .t-digit',
    '.t-number-field-pop',
    '.t-text-swap.is-exit',
    '.t-panel-slide[data-open="true"]',
    '.t-input.is-shaking'
  ]) {
    assert.ok(css.includes(selector), 'Motion stylesheet should include ' + selector);
  }
  assert.ok((css.match(/prefers-reduced-motion: reduce/g) || []).length >= 4,
    'Each motion recipe should preserve prefers-reduced-motion support');
  assert.match(html, /class="dashboard-card t-panel-slide" data-open="true"/);
  assert.match(html, /id="copyBtn"[^>]*><span class="t-text-swap">Copy Note<\/span>/);
  assert.doesNotMatch(html, /data-copy-from="#adjAmount"|aria-label="Copy Amount"/);
  assert.match(html, /data-copy-from="#adjTotal"[^>]*disabled/);
  assert.match(html, /data-copy-from="#adjTotal"[^>]*><span class="t-text-swap">Copy<\/span>/);
});


test('persists Batch draft rows locally across refreshes', () => {
  assert.match(script, /batchDraft:\s*'backerfee-batch-draft-v1'/);
  assert.match(script, /function saveBatchDraft\(rows = batchRowsData\(\)\)/);
  assert.match(script, /function loadBatchDraft\(\)/);
  assert.match(script, /localStorage\.setItem\(STORAGE_KEYS\.batchDraft/);
  assert.match(script, /localStorage\.getItem\(STORAGE_KEYS\.batchDraft\)/);
  assert.match(script, /saveBatchDraft\(\);\s*return results;/);
  assert.match(script, /renderBatchRows\(loadBatchDraft\(\) \?\? \[createEmptyBatchRow\(\), createEmptyBatchRow\(\)\]\)/);
});



test('keeps the Reset dialog hidden until opened and guards customer-note copying', () => {
  assert.doesNotMatch(html, /bridge-install-popup|backer-fee-minted-bridge\.user\.js|Tampermonkey|Open Backer Fee on Minted/i);
  assert.doesNotMatch(script, /normalizeMintedBridgeMoney|applyMintedBridgeParams|minted_(?:amount|tax|shipping|subtotal|total)|data-bf-minted-import|bf-bridge-ready|backerfee-bridge-install-dismissed-v1/i);

  assert.ok(html.includes('class="reset-modal-backdrop" id="resetConfirmation" hidden>'));
  assert.ok(html.includes('<section class="reset-modal" tabindex="-1">'));
  assert.ok(html.includes('<h2 id="resetConfirmTitle">Reset calculator?</h2>'));
  assert.ok(!html.includes('role="dialog"'));
  assert.ok(!html.includes('aria-modal='));
  assert.ok(!html.includes('aria-labelledby="resetConfirmTitle"'));
  assert.ok(html.includes('id="cancelResetBtn"'));
  assert.ok(html.includes('id="confirmResetBtn"'));

  assert.ok(css.includes('.reset-modal-backdrop {'));
  assert.ok(css.includes('position: fixed;'));
  assert.ok(css.includes('inset: 0;'));
  assert.ok(css.includes('place-items: center;'));
  assert.ok(css.includes('width: min(420px, calc(100vw - 32px))'));
  assert.ok(css.includes('html.modal-open,'));
  assert.ok(css.includes('body.modal-open { overflow: hidden; }'));
  assert.ok(css.includes('.copy-guard[hidden] { display: none; }'));

  assert.ok(script.includes("resetConfirmation.setAttribute('role', 'dialog')"));
  assert.ok(script.includes("resetConfirmation.setAttribute('aria-modal', 'true')"));
  assert.ok(script.includes("resetConfirmation.setAttribute('aria-labelledby', 'resetConfirmTitle')"));
  assert.ok(script.includes('function trapResetModalTab(event)'));
  assert.ok(script.includes('if (event.target === resetConfirmation) closeResetConfirmation'));
  assert.ok(script.includes('pageShell.inert = true'));
  assert.ok(script.includes('function isSingleCustomerNoteReady()'));
  assert.ok(script.includes('function areBatchCustomerNotesReady(results)'));
  assert.ok(script.includes('if (!isSingleCustomerNoteReady())'));
  assert.ok(script.includes('if (!areBatchCustomerNotesReady(batchResults))'));
  assert.ok(html.includes('id="noteCopyGuard"'));
  assert.ok(html.includes('id="batchNoteGuard"'));
});
