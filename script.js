import { inject } from '@vercel/analytics';
import { buildCustomerNote, calculateAdjustment, calculateFee, formatMoney } from './calculator-utils.js';

// Initialize Vercel Web Analytics
inject();

const STORAGE_KEYS = {
  settings: 'backerfee-settings-v3',
};

const TAX_RATE = 9.75; // % fixed, matches Minted's shipping ZIP tax
const DECIMAL_PATTERN = /^\d+(?:\.\d{0,2})?$|^\.\d{1,2}$/;
const priceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const form = document.getElementById('calculatorForm');
const backerInput = document.getElementById('backer');
const discountInput = document.getElementById('discount');
const customDiscountInput = document.getElementById('customDiscount');
const saveCustomPresetBtn = document.getElementById('saveCustomPresetBtn');
const customPresetBtn = document.getElementById('customPresetBtn');
const customDiscountError = document.getElementById('customDiscountError');
const result = document.getElementById('result');
const total = document.getElementById('total');
const resultsSection = document.getElementById('results');
const adjAmount = document.getElementById('adjAmount');
const adjTax = document.getElementById('adjTax');
const adjSubtotal = document.getElementById('adjSubtotal');
const adjTotal = document.getElementById('adjTotal');
const adjStatus = document.getElementById('adjStatus');
const adjShipInput = document.getElementById('adjShip');
const noteText = document.getElementById('noteText');
const noteEmpty = document.getElementById('noteEmpty');
const noteState = document.getElementById('noteState');
const copyBtn = document.getElementById('copyBtn');
const copyStatus = document.getElementById('copyStatus');
const resetBtn = document.getElementById('resetBtn');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const confirmModal = document.getElementById('confirmModal');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmActionBtn = document.getElementById('confirmActionBtn');
const modeSingleBtn = document.getElementById('modeSingleBtn');
const modeBatchBtn = document.getElementById('modeBatchBtn');
const batchPanel = document.getElementById('batchPanel');
const batchRows = document.getElementById('batchRows');
const addBatchRowBtn = document.getElementById('addBatchRowBtn');
const copyAllNotesBtn = document.getElementById('copyAllNotesBtn');
const batchStatus = document.getElementById('batchStatus');
const batchNoteText = document.getElementById('batchNoteText');
const batchNoteState = document.getElementById('batchNoteState');
const dashboardCard = document.querySelector('.dashboard-card');

let calculated = null;
let currentAdjustment = null;
let customDiscountPreset = '';
let noteWasEdited = false;
let confirmAction = null;
let lastFocusedElement = null;
let copyFeedbackTimer = null;
let currentMode = 'single';
let batchRowId = 0;
let batchResults = [];
let lastResetSnapshot = null;
let resultsAnimationTimer = null;
const resultAnimationFrames = new Map();
let displayedResults = {
  discountAmount: 0,
  discountedPrice: 0
};

const money = formatMoney;

function fitNote(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function safeRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      backer: backerInput.value,
      discount: discountInput.value,
      shippingAdjustment: adjShipInput.value,
      customDiscount: customDiscountPreset,
      theme: document.documentElement.dataset.theme || 'light'
    }));
  } catch (_) {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object') throw new Error('Invalid settings');
    if (typeof data.backer === 'string') backerInput.value = data.backer;
    if (typeof data.discount === 'string') discountInput.value = data.discount;
    if (typeof data.shippingAdjustment === 'string' && data.shippingAdjustment.length <= 12) adjShipInput.value = data.shippingAdjustment;
    if (typeof data.customDiscount === 'string') {
      const customDiscount = Number(data.customDiscount);
      if (DECIMAL_PATTERN.test(data.customDiscount) && Number.isFinite(customDiscount) && customDiscount >= 0 && customDiscount <= 100) {
        customDiscountPreset = data.customDiscount;
      }
    }
    renderCustomPreset();
    applyTheme(data.theme === 'dark' || data.theme === 'light'
      ? data.theme
      : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), { animate: false });
  } catch (_) {
    safeRemoveStorage(STORAGE_KEYS.settings);
    applyTheme('light', { animate: false });
  }
}

function setCustomDiscountError(message) {
  customDiscountInput.setAttribute('aria-invalid', message ? 'true' : 'false');
  customDiscountError.textContent = message;
}

function renderCustomPreset() {
  const hasCustomPreset = Boolean(customDiscountPreset);
  customDiscountInput.value = customDiscountPreset;
  customPresetBtn.hidden = !hasCustomPreset;
  customPresetBtn.dataset.discount = customDiscountPreset;
  customPresetBtn.textContent = hasCustomPreset ? 'Custom ' + Number(customDiscountPreset) + '%' : '';
  customPresetBtn.setAttribute('aria-label', hasCustomPreset
    ? 'Apply custom discount preset of ' + Number(customDiscountPreset) + '%'
    : 'Custom discount preset');
  setCustomDiscountError('');
}

function saveCustomPreset() {
  const raw = customDiscountInput.value.trim();
  const discount = Number(raw);

  if (!raw || !DECIMAL_PATTERN.test(raw) || !Number.isFinite(discount) || discount < 0 || discount > 100) {
    setCustomDiscountError('Enter a custom discount from 0% to 100%, with up to 2 decimals.');
    customDiscountInput.focus();
    return false;
  }

  customDiscountPreset = raw;
  renderCustomPreset();
  saveSettings();
  updatePresetState();
  return true;
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  let applied = false;

  const priceParam = params.get('price');
  if (priceParam !== null) {
    const normalizedPrice = priceParam.trim().replace(/,/g, '');
    const price = Number(normalizedPrice);
    if (DECIMAL_PATTERN.test(normalizedPrice) && Number.isFinite(price) && price >= 0) {
      backerInput.value = normalizedPrice;
      applied = true;
    }
  }

  const discountParam = params.get('discount');
  if (discountParam !== null) {
    const normalizedDiscount = discountParam.trim();
    const discount = Number(normalizedDiscount);
    if (DECIMAL_PATTERN.test(normalizedDiscount) && Number.isFinite(discount) && discount >= 0 && discount <= 100) {
      discountInput.value = normalizedDiscount;
      applied = true;
    }
  }

  return applied;
}

function applyTheme(theme, { animate = false } = {}) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';

  if (animate) {
    themeIcon.classList.remove('is-switching');
    void themeIcon.offsetWidth;
    themeIcon.classList.add('is-switching');
  }

  themeIcon.textContent = dark ? '☀' : '☾';
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeBtn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

function setFieldError(input, errorId, message) {
  const field = input.closest('.field');
  const error = document.getElementById(errorId);
  field.classList.toggle('invalid', Boolean(message));
  error.textContent = message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function readValues() {
  const backerRaw = backerInput.value.trim();
  const discountRaw = discountInput.value.trim();
  const normalizedBackerRaw = backerRaw.replace(/,/g, '');
  const backer = Number(normalizedBackerRaw);
  const discount = Number(discountRaw);

  const validDecimal = (raw) => Boolean(raw) && DECIMAL_PATTERN.test(raw);

  return {
    backerRaw,
    discountRaw,
    normalizedBackerRaw,
    backer,
    discount,
    validBacker: validDecimal(normalizedBackerRaw) && Number.isFinite(backer) && backer >= 0,
    validDiscount: validDecimal(discountRaw) && Number.isFinite(discount) && discount >= 0 && discount <= 100
  };
}

function validate({ showErrors = false } = {}) {
  const values = readValues();

  const backerMessage = values.validBacker
    ? ''
    : 'Enter a valid price from $0.00 with up to 2 decimals.';
  const discountMessage = values.validDiscount
    ? ''
    : 'Enter a discount from 0% to 100%, with up to 2 decimals.';

  if (showErrors || values.backerRaw) {
    setFieldError(backerInput, 'backerError', backerMessage);
  } else {
    setFieldError(backerInput, 'backerError', '');
  }

  if (showErrors || values.discountRaw) {
    setFieldError(discountInput, 'discountError', discountMessage);
  } else {
    setFieldError(discountInput, 'discountError', '');
  }

  return values.validBacker && values.validDiscount
    ? { backer: values.backer, discount: values.discount }
    : null;
}

function animateMoney(element, from, to) {
  const existingFrame = resultAnimationFrames.get(element);
  if (existingFrame) cancelAnimationFrame(existingFrame);

  if (prefersReducedMotion() || from === to) {
    element.textContent = money(to);
    resultAnimationFrames.delete(element);
    return;
  }

  const startTime = performance.now();
  const duration = 300;

  const renderFrame = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = from + ((to - from) * eased);
    element.textContent = money(value);

    if (progress < 1) {
      resultAnimationFrames.set(element, requestAnimationFrame(renderFrame));
    } else {
      element.textContent = money(to);
      resultAnimationFrames.delete(element);
    }
  };

  resultAnimationFrames.set(element, requestAnimationFrame(renderFrame));
}

function updateResults(data) {
  resultsSection.setAttribute('aria-busy', 'true');
  animateMoney(result, displayedResults.discountAmount, data.discountAmount);
  animateMoney(total, displayedResults.discountedPrice, data.discountedPrice);
  displayedResults = {
    discountAmount: data.discountAmount,
    discountedPrice: data.discountedPrice
  };

  if (resultsAnimationTimer) clearTimeout(resultsAnimationTimer);
  resultsAnimationTimer = window.setTimeout(() => {
    resultsSection.setAttribute('aria-busy', 'false');
  }, prefersReducedMotion() ? 0 : 320);
}

function readAdjustmentField(input, max = Infinity) {
  const raw = input.value.trim();
  if (!raw) return { empty: true, ok: true, value: 0 };
  const value = Number(raw);
  const ok = DECIMAL_PATTERN.test(raw) && Number.isFinite(value) && value >= 0 && value <= max;
  return { empty: false, ok, value };
}

function adjustmentCents(amountValue, shipValue) {
  const amountCents = Math.round(amountValue * 100);
  const shipCents = Math.round(shipValue * 100);
  const taxCents = Math.round((amountCents * TAX_RATE) / 100);
  const subtotalCents = amountCents + taxCents;
  return { amountCents, taxCents, subtotalCents, shipCents, totalCents: subtotalCents + shipCents };
}

// Per-row version of computeAdjustment() for Batch.
function applyBatchAdjustment(row, data) {
  const amountInput = row.querySelector('.batch-adj-amount');
  const shipInput = row.querySelector('.batch-adj-ship');
  const taxOut = row.querySelector('.batch-adj-tax');
  const subtotalOut = row.querySelector('.batch-adj-subtotal');
  const totalOut = row.querySelector('.batch-adj-total');
  const status = row.querySelector('.batch-adj-status');

  const clear = (message, warn = false) => {
    taxOut.value = '';
    subtotalOut.value = '';
    totalOut.value = '';
    status.textContent = message;
    status.classList.remove('is-success', 'is-warning');
    if (warn) status.classList.add('is-warning');
    return null;
  };

  const amount = readAdjustmentField(amountInput);
  const ship = readAdjustmentField(shipInput);
  amountInput.setAttribute('aria-invalid', amount.ok ? 'false' : 'true');
  shipInput.setAttribute('aria-invalid', ship.ok ? 'false' : 'true');

  if (!data || amount.empty) return clear('Enter a price and discount to see the Minted adjustment.');
  if (!amount.ok || !ship.ok) return clear('Fix the highlighted values (up to 2 decimals).', true);

  const adj = adjustmentCents(amount.value, ship.value);
  taxOut.value = (adj.taxCents / 100).toFixed(2);
  subtotalOut.value = (adj.subtotalCents / 100).toFixed(2);
  totalOut.value = (adj.totalCents / 100).toFixed(2);
  status.textContent = 'Enter ' + money(adj.amountCents / 100) + ' as the Amount in Minted. Total Adjustment: ' +
    money(adj.totalCents / 100) + '.';
  status.classList.remove('is-warning');
  status.classList.add('is-success');
  return adj;
}

function clearAdjustmentResults() {
  currentAdjustment = null;
  adjTax.value = '';
  adjSubtotal.value = '';
  adjTotal.value = '';
}

// Live: runs whenever Amount or Shipping changes.
function computeAdjustment() {
  const amount = readAdjustmentField(adjAmount);
  const ship = readAdjustmentField(adjShipInput);

  adjAmount.setAttribute('aria-invalid', amount.ok ? 'false' : 'true');
  adjShipInput.setAttribute('aria-invalid', ship.ok ? 'false' : 'true');
  adjStatus.classList.remove('is-success', 'is-warning');

  const stop = (message, warn = false) => {
    clearAdjustmentResults();
    adjStatus.textContent = message;
    if (warn) adjStatus.classList.add('is-warning');
    updateNote(calculated);
  };

  if (amount.empty) return stop('Enter a price and discount to see the Minted adjustment.');
  if (!amount.ok || !ship.ok) return stop('Fix the highlighted values (up to 2 decimals).', true);

  currentAdjustment = adjustmentCents(amount.value, ship.value);
  const { amountCents, taxCents, subtotalCents, totalCents } = currentAdjustment;

  adjTax.value = (taxCents / 100).toFixed(2);
  adjSubtotal.value = (subtotalCents / 100).toFixed(2);
  adjTotal.value = (totalCents / 100).toFixed(2);
  adjStatus.textContent = 'Enter ' + money(amountCents / 100) + ' as the Amount in Minted. Total Adjustment: ' +
    money(totalCents / 100) + '.';
  adjStatus.classList.add('is-success');
  updateNote(calculated);
}

// Called whenever the Final Backer Fee changes: Amount follows the fee, tax follows the Amount.
function updateAdjustment(finalFee) {
  adjAmount.value = calculated ? (Math.round(Number(finalFee) * 100) / 100).toFixed(2) : '';
  computeAdjustment();
}

function clearResults() {
  updateResults({ discountAmount: 0, discountedPrice: 0 });
  updateAdjustment(0);
}

function noteFee(data) {
  return typeof currentAdjustment?.totalCents === 'number'
    ? currentAdjustment.totalCents / 100
    : data.discountedPrice;
}

function refreshAdjustment() {
  updateAdjustment(calculated?.discountedPrice ?? 0);
  updateNote(calculated);
}

function updateNote(data, { force = false } = {}) {
  if (!data) {
    noteState.textContent = 'Waiting for valid details';
    copyBtn.disabled = true;
    if (force || !noteWasEdited) noteText.value = '';
    noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
    fitNote(noteText);
    return;
  }

  const generated = buildCustomerNote({ ...data, discountedPrice: noteFee(data) });
  if (force || !noteWasEdited || !noteText.value.trim()) {
    noteText.value = generated;
    noteWasEdited = false;
  }
  noteState.textContent = noteWasEdited ? 'Edited — ready to copy' : 'Updated automatically';
  copyBtn.disabled = !noteText.value.trim();
  noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
  fitNote(noteText);
}

function calculateLive() {
  const values = validate();
  if (!values) {
    calculated = null;
    clearResults();
    updateNote(null);
    copyStatus.textContent = '';
    return false;
  }

  try {
    calculated = calculateFee(values.backer, values.discount);
    updateResults(calculated);
    updateAdjustment(calculated.discountedPrice);
    updateNote(calculated);
    saveSettings();
    return true;
  } catch (error) {
    calculated = null;
    clearResults();
    updateNote(null, { force: true });
    const message = error instanceof RangeError ? error.message : 'Unable to calculate the fee.';
    setFieldError(backerInput, 'backerError', message);
    return false;
  }
}


function clearCalculatorStorage() {
  try {
    const theme = document.documentElement.dataset.theme || 'light';
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      backer: '',
      discount: '',
      shippingAdjustment: '',
      customDiscount: customDiscountPreset,
      theme
    }));
  } catch (_) {
    safeRemoveStorage(STORAGE_KEYS.settings);
  }
}


function resetCalculator() {
  if (currentMode === 'batch') {
    lastResetSnapshot = { mode: 'batch', rows: batchRowsData() };
    renderBatchRows([createEmptyBatchRow(), createEmptyBatchRow()]);
    batchResults = [];
    batchStatus.textContent = '';
    copyAllNotesBtn.disabled = true;
    saveSettings();
    showResetUndoToast();
    batchRows.querySelector('.batch-price')?.focus();
    return;
  }

  lastResetSnapshot = {
    mode: 'single',
    backer: backerInput.value,
    discount: discountInput.value
  };

  form.reset();
  calculated = null;
  noteWasEdited = false;
  clearResults();
  noteText.value = '';
  noteEmpty?.setAttribute('aria-hidden', 'false');
  noteState.textContent = 'Waiting for valid details';
  copyBtn.disabled = true;
  copyStatus.textContent = '';
  restoreCopyButton();
  setFieldError(backerInput, 'backerError', '');
  setFieldError(discountInput, 'discountError', '');
  updatePresetState();
  clearCalculatorStorage();
  showResetUndoToast();
  backerInput.focus();
}



function createEmptyBatchRow() {
  batchRowId += 1;
  return { id: batchRowId, name: '', backer: '', discount: '', amount: '', ship: '', amountEdited: false };
}

function batchRowsData() {
  return Array.from(batchRows.querySelectorAll('.batch-row')).map((row) => ({
    id: Number(row.dataset.id),
    name: row.querySelector('.batch-name')?.value ?? '',
    backer: row.querySelector('.batch-price')?.value ?? '',
    discount: row.querySelector('.batch-discount')?.value ?? '',
    amount: row.querySelector('.batch-adj-amount')?.value ?? '',
    ship: row.querySelector('.batch-adj-ship')?.value ?? '',
    amountEdited: row.dataset.amountEdited === '1'
  }));
}

function getBatchInputValues(row) {
  const priceInput = row.querySelector('.batch-price');
  const discountInput = row.querySelector('.batch-discount');
  const backerRaw = priceInput.value.trim();
  const discountRaw = discountInput.value.trim();
  const normalizedBackerRaw = backerRaw.replace(/,/g, '');
  const backer = Number(normalizedBackerRaw);
  const discount = Number(discountRaw);

  return {
    priceInput,
    discountInput,
    backer,
    discount,
    validBacker: Boolean(backerRaw) &&
      DECIMAL_PATTERN.test(normalizedBackerRaw) &&
      Number.isFinite(backer) &&
      backer >= 0,
    validDiscount: Boolean(discountRaw) &&
      DECIMAL_PATTERN.test(discountRaw) &&
      Number.isFinite(discount) &&
      discount >= 0 &&
      discount <= 100
  };
}



function formatBatchPrice(input) {
  const raw = input.value.trim().replace(/,/g, '');
  if (!raw || !DECIMAL_PATTERN.test(raw)) return;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return;
  input.value = priceFormatter.format(value);
}

function setBatchFieldError(input, errorElement, message) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  errorElement.textContent = message;
  input.closest('.batch-field')?.classList.toggle('invalid', Boolean(message));
}

function clampBatchDiscount(input) {
  const raw = input.value.trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value)) return '';
  if (value > 100) {
    input.value = '100';
    return 'Discount capped at 100%.';
  }
  if (value < 0) {
    input.value = '0';
    return 'Discount raised to 0%.';
  }
  return '';
}

function validateBatchRow(row, { showErrors = false } = {}) {
  const values = getBatchInputValues(row);
  const priceError = values.validBacker
    ? ''
    : 'Enter a valid price from $0.00 with up to 2 decimals.';
  const discountError = values.validDiscount
    ? ''
    : 'Enter a discount from 0% to 100%, with up to 2 decimals.';
  const priceErrorElement = row.querySelector('.batch-error');
  const discountErrorElement = row.querySelector('.batch-discount-error');

  setBatchFieldError(
    values.priceInput,
    priceErrorElement,
    showErrors || values.priceInput.value ? priceError : ''
  );
  setBatchFieldError(
    values.discountInput,
    discountErrorElement,
    showErrors || values.discountInput.value ? discountError : ''
  );

  return values.validBacker && values.validDiscount ? values : null;
}

function renderBatchRows(rows) {
  batchRows.replaceChildren();

  const adjField = (label, input, extra = '') =>
    '<div class="batch-adj-field"><div class="batch-adj-label"><span>' + label + '</span>' + extra + '</div>' +
    '<span class="input-wrap"><span class="prefix" aria-hidden="true">$</span>' + input + '</span></div>';

  rows.forEach((rowData) => {
    const row = document.createElement('div');
    row.className = 'batch-row';
    row.dataset.id = String(rowData.id ?? ++batchRowId);
    row.dataset.amountEdited = rowData.amountEdited ? '1' : '';

    // Static markup only; values are assigned through .value below.
    row.innerHTML =
      '<div class="batch-card-name"><label><span>Card name</span>' +
      '<input class="batch-name" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Standard" aria-label="Card name"></label></div>' +
      '<div class="batch-row-main">' +
        '<div class="batch-field"><span class="input-wrap"><span class="prefix" aria-hidden="true">$</span>' +
        '<input class="batch-price" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Original price"></span>' +
        '<small class="error batch-error" role="alert"></small></div>' +
        '<div class="batch-field"><span class="input-wrap"><input class="batch-discount" type="number" min="0" max="100" step="0.01" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Discount percentage">' +
        '<span class="suffix" aria-hidden="true">%</span></span>' +
        '<small class="error batch-discount-error" role="alert"></small></div>' +
        '<div class="batch-result">$0.00</div>' +
        '<div class="batch-result batch-result-final">$0.00</div>' +
        '<button type="button" class="batch-remove" data-action="remove-batch-row" aria-label="Remove row" title="Remove row">×</button>' +
      '</div>' +
      '<div class="batch-adjust">' +
        '<div class="batch-adjust-head"><div><span class="section-kicker">FINANCIAL ADJUSTMENT</span><h3>Minted entry</h3></div>' +
        '<span class="adjustment-target-label">Fixed tax: 9.75%</span></div>' +
        '<div class="batch-adjust-grid">' +
          adjField('Amount (enter in Minted)', '<input class="batch-adj-amount" type="number" min="0" step="0.01" placeholder="0.00" inputmode="decimal" autocomplete="off" aria-label="Amount to enter in Minted">') +
          adjField('Tax Based on Shipping Zip', '<input class="batch-adj-tax" type="number" min="0" step="0.01" placeholder="0.00" readonly aria-label="Tax based on fixed 9.75% rate">',
            '<label class="adj-check">Include Tax: <input type="checkbox" checked disabled></label>') +
          adjField('Subtotal', '<input class="batch-adj-subtotal" type="number" min="0" step="0.01" placeholder="0.00" readonly aria-label="Calculated subtotal">') +
          adjField('Shipping Adjustment', '<input class="batch-adj-ship" type="number" min="0" step="0.01" placeholder="0.00" inputmode="decimal" autocomplete="off" aria-label="Shipping adjustment">') +
          adjField('Total Adjustment', '<input class="batch-adj-total" type="number" min="0" step="0.01" placeholder="0.00" readonly aria-label="Calculated total adjustment">') +
        '</div>' +
        '<p class="adjustment-status batch-adj-status" role="status" aria-live="polite">Enter a price and discount to see the Minted adjustment.</p>' +
      '</div>';

    batchRows.appendChild(row);

    const priceInput = row.querySelector('.batch-price');
    const discountInputForRow = row.querySelector('.batch-discount');
    const amountInput = row.querySelector('.batch-adj-amount');
    const shipInput = row.querySelector('.batch-adj-ship');
    priceInput.value = rowData.backer ?? '';
    discountInputForRow.value = rowData.discount ?? '';
    amountInput.value = rowData.amount ?? '';
    shipInput.value = rowData.ship ?? '';
    const nameInput = row.querySelector('.batch-name');
    nameInput.value = rowData.name ?? '';
    nameInput.addEventListener('input', () => calculateBatch());

    priceInput.addEventListener('focus', () => {
      priceInput.value = priceInput.value.replace(/,/g, '');
    });

    priceInput.addEventListener('input', () => {
      row.dataset.amountEdited = '';
      calculateBatch();
    });

    priceInput.addEventListener('blur', () => {
      formatBatchPrice(priceInput);
      validateBatchRow(row, { showErrors: true });
    });

    priceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        discountInputForRow.focus();
      }
    });

    discountInputForRow.addEventListener('input', () => {
      row.dataset.amountEdited = '';
      const boundMessage = clampBatchDiscount(discountInputForRow);
      calculateBatch();
      if (boundMessage) {
        setBatchFieldError(discountInputForRow, row.querySelector('.batch-discount-error'), boundMessage);
      }
    });

    discountInputForRow.addEventListener('blur', () => {
      validateBatchRow(row, { showErrors: true });
    });

    discountInputForRow.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const next = row.nextElementSibling?.querySelector('.batch-price');
        if (next) next.focus();
        else calculateBatch();
      }
    });

    amountInput.addEventListener('input', () => {
      row.dataset.amountEdited = '1';
      calculateBatch();
    });
    shipInput.addEventListener('input', () => calculateBatch());
  });

  calculateBatch();
}

function calculateBatch() {
  const rows = Array.from(batchRows.querySelectorAll('.batch-row'));
  const results = [];
  let invalidCount = 0;

  rows.forEach((row, index) => {
    const priceInput = row.querySelector('.batch-price');
    const discountInput = row.querySelector('.batch-discount');
    const amountInput = row.querySelector('.batch-adj-amount');
    const [discountBox, finalBox] = row.querySelectorAll('.batch-result');
    const hasAnyInput = Boolean(priceInput.value.trim() || discountInput.value.trim());

    const clearRow = () => {
      discountBox.textContent = '$0.00';
      finalBox.textContent = '$0.00';
      amountInput.value = '';
      row.dataset.amountEdited = '';
      applyBatchAdjustment(row, null);
    };

    if (!hasAnyInput) {
      setBatchFieldError(priceInput, row.querySelector('.batch-error'), '');
      setBatchFieldError(discountInput, row.querySelector('.batch-discount-error'), '');
      clearRow();
      return;
    }

    const values = validateBatchRow(row, { showErrors: true });
    if (!values) {
      invalidCount += 1;
      clearRow();
      return;
    }

    try {
      const resultData = calculateFee(values.backer, values.discount);
      discountBox.textContent = money(resultData.discountAmount);
      finalBox.textContent = money(resultData.discountedPrice);
      if (row.dataset.amountEdited !== '1') amountInput.value = resultData.discountedPrice.toFixed(2);
      const adjustment = applyBatchAdjustment(row, resultData);
      results.push({
        rowId: Number(row.dataset.id),
        name: row.querySelector('.batch-name').value.trim() || 'Card ' + (index + 1),
        data: resultData,
        adjustment
      });
    } catch (error) {
      console.error('Batch calculation failed:', error);
      invalidCount += 1;
      clearRow();
    }
  });

  updateBatchNote(results);
  batchResults = results;
  copyAllNotesBtn.disabled = results.length === 0;
  batchStatus.textContent = invalidCount
    ? results.length + ' calculated · ' + invalidCount + ' row' + (invalidCount === 1 ? '' : 's') + ' need attention.'
    : (results.length
      ? results.length + ' row' + (results.length === 1 ? '' : 's') + ' calculated.'
      : 'Enter details in at least one row.');

  return results;
}

function buildBatchNote(items) {
  if (!items.length) return '';

  const quoted = items.map((item) => '"' + item.name + '"');
  const names = quoted.length > 1
    ? quoted.slice(0, -1).join(', ') + ' and ' + quoted[quoted.length - 1]
    : quoted[0];
  const sameFee = new Set(items.map((item) => item.feeCents)).size === 1;
  const feeText = sameFee ? ' of ' + money(items[0].feeCents / 100) : '';
  const lines = items.map((item) => '"' + item.name + '" cards: ' + money(item.feeCents / 100));

  return 'Please note that adding printing on the back of the ' + names + ' cards incurs an additional fee' +
    feeText + ' per card, based on the quantity you\'ve purchased, including local taxes.\n\n' +
    'For the cost of back-of-card printing:\n' + lines.join('\n') + '\n\n' +
    'If you\'d like to continue with back-of-card printing, please request a change and leave a note approving the fee. ' +
    'If you\'re happy with your card as-is and would no longer like printing on the back of your card, simply approve your design for print.';
}

function updateBatchNote(results) {
  if (!results.length) {
    batchNoteText.value = '';
    batchNoteState.textContent = 'Waiting for valid details';
    fitNote(batchNoteText);
    return;
  }

  batchNoteText.value = buildBatchNote(results.map(({ name, data, adjustment }) => ({
    name,
    feeCents: adjustment ? adjustment.totalCents : Math.round(data.discountedPrice * 100)
  })));
  batchNoteState.textContent = 'Updated automatically';
  fitNote(batchNoteText);
}

async function copyAllNotes() {
  const notes = batchNoteText.value;
  if (!notes.trim()) return;

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(notes);
  } catch (_) {
    if (!fallbackCopy(notes)) {
      copyAllNotesBtn.focus();
      batchStatus.textContent = 'Clipboard unavailable — note was not copied.';
      return;
    }
  }

  copyAllNotesBtn.textContent = '✓ Copied';
  copyAllNotesBtn.classList.add('is-copied');
  window.setTimeout(() => {
    copyAllNotesBtn.textContent = 'Copy Note';
    copyAllNotesBtn.classList.remove('is-copied');
  }, 1500);
  batchStatus.textContent = 'Customer note copied.';
}

function removeBatchRow(row) {
  row.remove();
  if (!batchRows.querySelector('.batch-row')) {
    renderBatchRows([createEmptyBatchRow()]);
  }
  calculateBatch();
}

function setMode(mode) {
  currentMode = mode === 'batch' ? 'batch' : 'single';
  const isBatch = currentMode === 'batch';

  modeSingleBtn.setAttribute('aria-selected', isBatch ? 'false' : 'true');
  modeBatchBtn.setAttribute('aria-selected', isBatch ? 'true' : 'false');
  modeSingleBtn.classList.toggle('active', !isBatch);
  modeBatchBtn.classList.toggle('active', isBatch);
  dashboardCard?.classList.toggle('batch-mode', isBatch);

  document.querySelectorAll('.single-only').forEach((element) => {
    element.hidden = isBatch;
  });
  batchPanel.hidden = !isBatch;
  form.classList.toggle('batch-mode', isBatch);

  if (isBatch && !batchRows.querySelector('.batch-row')) {
    renderBatchRows([createEmptyBatchRow(), createEmptyBatchRow()]);
  }
  if (!isBatch) {
    batchStatus.textContent = '';
    copyAllNotesBtn.disabled = true;
  }

  if (isBatch) {
    batchRows.querySelectorAll('.batch-price').forEach(formatBatchPrice);
    calculateBatch();
  }

  if (!isBatch) fitNote(noteText);
  if (isBatch) fitNote(batchNoteText);
}

function showResetUndoToast() {
  const snapshot = lastResetSnapshot;
  if (typeof window.backerFeeShowUndoToast !== 'function') return;

  window.backerFeeShowUndoToast('Reset complete.', 'Undo', () => {
    if (!snapshot) return;

    if (snapshot.mode === 'batch') {
      renderBatchRows(snapshot.rows);
      batchStatus.textContent = 'Reset undone.';
      batchRows.querySelector('.batch-price')?.focus();
      return;
    }

    backerInput.value = snapshot.backer;
    discountInput.value = snapshot.discount;
    noteWasEdited = false;
    updatePresetState();
    calculateLive();
    backerInput.focus();
  });
}

function fallbackCopy(text) {
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.setAttribute('aria-hidden', 'true');
  helper.style.position = 'fixed';
  helper.style.left = '-9999px';
  helper.style.top = '0';
  document.body.appendChild(helper);
  helper.focus();
  helper.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (_) {
    copied = false;
  }

  helper.remove();
  return copied;
}

function restoreCopyButton() {
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = null;
  copyBtn.textContent = 'Copy Note';
  copyBtn.classList.remove('is-copied');
}

function showCopyFeedback() {
  restoreCopyButton();
  copyBtn.textContent = '✓ Copied';
  copyBtn.classList.add('is-copied');
  copyFeedbackTimer = window.setTimeout(() => {
    restoreCopyButton();
  }, 1500);
}

async function copyNote() {
  const text = noteText.value.trim();
  if (!text) {
    copyStatus.textContent = 'Enter valid details to generate a note.';
    return;
  }

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(noteText.value);
    copyStatus.textContent = 'Copied ✓';
    showCopyFeedback();
  } catch (_) {
    if (fallbackCopy(noteText.value)) {
      copyStatus.textContent = 'Copied ✓';
      showCopyFeedback();
    } else {
      noteText.focus();
      noteText.select();
      copyStatus.textContent = 'Clipboard unavailable — note selected. Press Ctrl+C or Cmd+C to copy.';
    }
  }
}

function openConfirmModal({ title, message, actionLabel, onConfirm }) {
  lastFocusedElement = document.activeElement;
  confirmAction = onConfirm;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmActionBtn.textContent = actionLabel;
  confirmModal.hidden = false;
  document.body.classList.add('modal-open');
  confirmCancelBtn.focus();
}

function closeConfirmModal() {
  confirmModal.hidden = true;
  document.body.classList.remove('modal-open');
  confirmAction = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
  lastFocusedElement = null;
}

function requestReset() {
  openConfirmModal({
    title: 'Reset calculator?',
    message: 'This will clear the current price, discount, results, and note.',
    actionLabel: 'Reset',
    onConfirm: resetCalculator
  });
}

function formatBackerInput() {
  const raw = backerInput.value.trim().replace(/,/g, '');
  if (!raw || !DECIMAL_PATTERN.test(raw)) return;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return;
  backerInput.value = priceFormatter.format(value);
  saveSettings();
}

function updatePresetState() {
  const current = Number(discountInput.value);
  document.querySelectorAll('.preset-btn').forEach((button) => {
    const selected = Number(button.dataset.discount) === current;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

form.addEventListener('submit', (event) => event.preventDefault());

resetBtn.addEventListener('click', requestReset);
 [adjAmount, adjShipInput].forEach((el) => {
  el.addEventListener('input', () => {
    computeAdjustment();
    if (el === adjShipInput) saveSettings();
  });
});
[adjAmount, adjShipInput].forEach((el) => {
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      computeAdjustment();
    }
  });
});
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next, { animate: true });
  saveSettings();
});
copyBtn.addEventListener('click', copyNote);
modeSingleBtn.addEventListener('click', () => setMode('single'));
modeBatchBtn.addEventListener('click', () => setMode('batch'));
addBatchRowBtn.addEventListener('click', () => {
  renderBatchRows([...batchRowsData(), createEmptyBatchRow()]);
  batchRows.lastElementChild?.querySelector('.batch-price')?.focus();
});
copyAllNotesBtn.addEventListener('click', copyAllNotes);
batchRows.addEventListener('click', (event) => {
  const removeBtn = event.target.closest('button[data-action="remove-batch-row"]');
  if (!removeBtn) return;
  const row = removeBtn.closest('.batch-row');
  if (row) removeBatchRow(row);
});
confirmCancelBtn.addEventListener('click', closeConfirmModal);
confirmActionBtn.addEventListener('click', () => {
  const action = confirmAction;
  closeConfirmModal();
  if (action) action();
});

confirmModal.addEventListener('click', (event) => {
  if (event.target === confirmModal) closeConfirmModal();
});

document.querySelectorAll('.preset-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const discount = button.dataset.discount;
    if (!discount) return;

    discountInput.value = discount;
    noteWasEdited = false;
    updatePresetState();
    calculateLive();
    discountInput.focus();
  });
});

saveCustomPresetBtn.addEventListener('click', saveCustomPreset);

customDiscountInput.addEventListener('input', () => {
  setCustomDiscountError('');
});

customDiscountInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveCustomPreset();
  }
});

backerInput.addEventListener('focus', () => {
  if (backerInput.value.includes(',')) {
    backerInput.value = backerInput.value.replace(/,/g, '');
  }
});

backerInput.addEventListener('input', () => {
  noteWasEdited = false;
  calculateLive();
  copyStatus.textContent = '';
  restoreCopyButton();
});

backerInput.addEventListener('blur', () => {
  formatBackerInput();
  validate({ showErrors: true });
});

backerInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    discountInput.focus();
  }
});

discountInput.addEventListener('input', () => {
  noteWasEdited = false;
  updatePresetState();
  calculateLive();
  copyStatus.textContent = '';
  restoreCopyButton();
});

discountInput.addEventListener('blur', () => {
  validate({ showErrors: true });
});

discountInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (calculated) copyNote();
  }
});

noteText.addEventListener('input', () => {
  noteWasEdited = true;
  noteState.textContent = 'Edited — ready to copy';
  copyBtn.disabled = !noteText.value.trim();
  copyStatus.textContent = '';
  restoreCopyButton();
  noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
  saveSettings();
  fitNote(noteText);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !confirmModal.hidden) {
    closeConfirmModal();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    requestReset();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    if (!confirmModal.hidden) return;
    copyNote();
  }

  if (event.key === 'Tab' && !confirmModal.hidden) {
    const focusable = confirmModal.querySelectorAll('button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

loadSettings();
applyUrlParams();
renderCustomPreset();
updatePresetState();
renderBatchRows([createEmptyBatchRow(), createEmptyBatchRow()]);
setMode('single');
calculateBatch();

if (backerInput.value && discountInput.value) {
  noteWasEdited = false;
  calculateLive();
}
