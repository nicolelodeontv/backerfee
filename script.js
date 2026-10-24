import { buildCustomerNote, calculateAdjustment, calculateFee, formatMoney } from './calculator-utils.js';

const STORAGE_KEYS = {
  settings: 'backerfee-settings-v3',
  batchDraft: 'backerfee-batch-draft-v1',
};

const DEFAULT_TAX_RATE = 7.75;
let taxRate = DEFAULT_TAX_RATE; // Estimate only; confirm the actual order tax in Minted.
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
const taxRateInput = document.getElementById('taxRate');
const taxRateError = document.getElementById('taxRateError');
const adjMintedTotal = document.getElementById('adjMintedTotal');
const adjMintedTotalCheck = document.getElementById('adjMintedTotalCheck');
const adjTaxLabel = document.querySelector('label[for="adjTax"]');
const adjTotalLabel = document.querySelector('label[for="adjTotal"]');
const adjUseTaxInput = document.getElementById('adjUseTax');
const adjLimitWarning = document.getElementById('adjLimitWarning');
const adjSubtotal = document.getElementById('adjSubtotal');
const adjTotal = document.getElementById('adjTotal');
const adjStatus = document.getElementById('adjStatus');
const adjShipInput = document.getElementById('adjShip');
const noteText = document.getElementById('noteText');
const noteEmpty = document.getElementById('noteEmpty');
const noteState = document.getElementById('noteState');
const copyBtn = document.getElementById('copyBtn');
const copyStatus = document.getElementById('copyStatus');
const noteCopyGuard = document.getElementById('noteCopyGuard');
const resetBtn = document.getElementById('resetBtn');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const resetConfirmation = document.getElementById('resetConfirmation');
const cancelResetBtn = document.getElementById('cancelResetBtn');
const confirmResetBtn = document.getElementById('confirmResetBtn');
const modeSingleBtn = document.getElementById('modeSingleBtn');
const modeBatchBtn = document.getElementById('modeBatchBtn');
const batchPanel = document.getElementById('batchPanel');
const batchRows = document.getElementById('batchRows');
const addBatchRowBtn = document.getElementById('addBatchRowBtn');
const copyAllNotesBtn = document.getElementById('copyAllNotesBtn');
const batchStatus = document.getElementById('batchStatus');
const batchNoteText = document.getElementById('batchNoteText');
const batchNoteState = document.getElementById('batchNoteState');
const batchNoteGuard = document.getElementById('batchNoteGuard');
const dashboardCard = document.querySelector('.dashboard-card');
const pageShell = document.querySelector('.page-shell');
const textSwapTimers = new WeakMap();
const copyFeedbackTimers = new WeakMap();

let calculated = null;
let currentAdjustment = null;
let customDiscountPreset = '';
let noteWasEdited = false;
let copyFeedbackTimer = null;
let currentMode = 'single';
let batchRowId = 0;
let batchResults = [];
let lastResetSnapshot = null;
let resultsAnimationTimer = null;
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

window.addEventListener('resize', () => {
  fitNote(currentMode === 'batch' ? batchNoteText : noteText);
});

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function motionMilliseconds(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith('s') && !raw.endsWith('ms') ? value * 1000 : value;
}

function setInputMotionError(input, hasError, { shake = false } = {}) {
  if (!input) return;
  if (hasError) input.classList.add('t-input');
  input.classList.toggle('is-error', Boolean(hasError));

  if (!hasError || !shake || prefersReducedMotion()) {
    if (input._shakeTimer) window.clearTimeout(input._shakeTimer);
    input._shakeTimer = null;
    input.classList.remove('is-shaking');
    return;
  }

  if (input._shakeTimer) window.clearTimeout(input._shakeTimer);
  input.classList.remove('is-shaking');
  void input.offsetWidth;
  input.classList.add('is-shaking');
  const shakeMs = motionMilliseconds('--shake-dur-a', 80) * 2 +
    motionMilliseconds('--shake-dur-b', 60) * 2;
  input._shakeTimer = window.setTimeout(() => {
    input.classList.remove('is-shaking');
    input._shakeTimer = null;
  }, shakeMs + 20);
}

function safeRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

function parseTaxRate(raw) {
  const text = String(raw ?? '').trim();
  if (!text || !DECIMAL_PATTERN.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

function updateTaxRateLabels() {
  document.querySelectorAll('.adjustment-target-label').forEach((label) => {
    label.textContent = 'Estimate: ' + taxRate + '%';
  });
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      backer: backerInput.value,
      discount: discountInput.value,
      shippingAdjustment: adjShipInput.value,
      taxRate: String(taxRate),
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
    const savedTaxRate = parseTaxRate(data.taxRate);
    taxRate = savedTaxRate === null ? DEFAULT_TAX_RATE : savedTaxRate;
    taxRateInput.value = String(taxRate);
    updateTaxRateLabels();
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
    taxRate = DEFAULT_TAX_RATE;
    taxRateInput.value = String(DEFAULT_TAX_RATE);
    updateTaxRateLabels();
    safeRemoveStorage(STORAGE_KEYS.settings);
    applyTheme('light', { animate: false });
  }
}

function setCustomDiscountError(message, { shake = false } = {}) {
  const hasError = Boolean(message);
  customDiscountInput.setAttribute('aria-invalid', hasError ? 'true' : 'false');
  customDiscountError.textContent = message;
  setInputMotionError(customDiscountInput, hasError, { shake });
}

function validateCustomDiscount({ shake = false } = {}) {
  const raw = customDiscountInput.value.trim();
  const discount = Number(raw);
  const valid = Boolean(raw) && DECIMAL_PATTERN.test(raw) &&
    Number.isFinite(discount) && discount >= 0 && discount <= 100;
  const message = valid
    ? ''
    : 'Enter a custom discount from 0% to 100%, with up to 2 decimals.';
  setCustomDiscountError(message, { shake });
  return valid;
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

function setFieldError(input, errorId, message, { shake = false } = {}) {
  const hasError = Boolean(message);
  const field = input.closest('.field');
  const error = document.getElementById(errorId);
  field.classList.toggle('invalid', hasError);
  error.textContent = message;
  input.setAttribute('aria-invalid', hasError ? 'true' : 'false');
  setInputMotionError(input, hasError, { shake });
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

function validate({ showErrors = false, shakeErrors = false } = {}) {
  const values = readValues();

  const backerMessage = values.validBacker
    ? ''
    : 'Enter a valid price from $0.00 with up to 2 decimals.';
  const discountMessage = values.validDiscount
    ? ''
    : 'Enter a discount from 0% to 100%, with up to 2 decimals.';

  if (showErrors || values.backerRaw) {
    setFieldError(backerInput, 'backerError', backerMessage, { shake: shakeErrors });
  } else {
    setFieldError(backerInput, 'backerError', '');
  }

  if (showErrors || values.discountRaw) {
    setFieldError(discountInput, 'discountError', discountMessage, { shake: shakeErrors });
  } else {
    setFieldError(discountInput, 'discountError', '');
  }

  return values.validBacker && values.validDiscount
    ? { backer: values.backer, discount: values.discount }
    : null;
}

const MOTION_INPUT_PAUSE_MS = 200;

function cancelDigitDisplay(element, value = element.textContent) {
  if (element._digitAnimationTimer) window.clearTimeout(element._digitAnimationTimer);
  element._digitAnimationTimer = null;
  const nextText = String(value);
  element.textContent = nextText;
  element._digitStableText = nextText.replace(/\s+/g, '');
}

function renderDigitAnimation(element, previousText, nextText) {
  let same = 0;
  while (same < previousText.length && same < nextText.length && previousText[same] === nextText[same]) {
    same += 1;
  }

  const group = document.createElement('span');
  group.className = 't-digit-group';
  nextText.split('').forEach((character, index, characters) => {
    const digit = document.createElement('span');
    digit.className = 't-digit';
    digit.textContent = character;
    if (index < same) digit.dataset.same = '';
    if (index === characters.length - 2) digit.dataset.stagger = '1';
    else if (index === characters.length - 1) digit.dataset.stagger = '2';
    group.appendChild(digit);
  });

  element.replaceChildren(group);
  void group.offsetHeight;
  group.classList.add('is-animating');
  element._digitStableText = nextText;
}

function scheduleDigitAnimation(element, previousStableText, nextText) {
  if (element._digitAnimationTimer) window.clearTimeout(element._digitAnimationTimer);
  element._digitAnimationTimer = null;
  if (prefersReducedMotion() || !previousStableText || previousStableText === nextText) {
    element.textContent = nextText;
    element._digitStableText = nextText;
    return;
  }

  element._digitAnimationTimer = window.setTimeout(() => {
    element._digitAnimationTimer = null;
    if (element.textContent.replace(/\s+/g, '') !== nextText) return;
    if (prefersReducedMotion()) {
      element.textContent = nextText;
      element._digitStableText = nextText;
      return;
    }
    renderDigitAnimation(element, previousStableText, nextText);
  }, MOTION_INPUT_PAUSE_MS);
}

function setDigitDisplay(element, value, { restart = false } = {}) {
  const nextText = String(value);
  const visibleText = element.textContent.replace(/\s+/g, '');
  const previousStableText = element._digitStableText ?? visibleText;

  if (visibleText === nextText) {
    if (restart) scheduleDigitAnimation(element, previousStableText, nextText);
    return;
  }

  element._digitStableText = previousStableText;
  element.textContent = nextText;
  scheduleDigitAnimation(element, previousStableText, nextText);
}

function clearPopInputMotion(input) {
  if (input._digitPopDebounceTimer) window.clearTimeout(input._digitPopDebounceTimer);
  if (input._digitPopTimer) window.clearTimeout(input._digitPopTimer);
  input._digitPopDebounceTimer = null;
  input._digitPopTimer = null;
  input.classList.remove('t-number-field-pop');
}

function schedulePopInputAnimation(input, nextValue) {
  input._digitPopDebounceTimer = window.setTimeout(() => {
    input._digitPopDebounceTimer = null;
    if (input.value !== nextValue || prefersReducedMotion()) return;

    input.classList.remove('t-number-field-pop');
    void input.offsetWidth;
    input.classList.add('t-number-field-pop');
    input._digitPopTimer = window.setTimeout(() => {
      input.classList.remove('t-number-field-pop');
      input._digitPopTimer = null;
    }, motionMilliseconds('--digit-dur', 320) + 40);
  }, MOTION_INPUT_PAUSE_MS);
}

function setPopInputValue(input, value) {
  const nextValue = value === null || value === undefined ? '' : String(value);
  const previousValue = input.value;
  input.value = nextValue;

  if (!nextValue) {
    clearPopInputMotion(input);
    return;
  }
  if (prefersReducedMotion()) {
    clearPopInputMotion(input);
    return;
  }
  if (previousValue === nextValue) {
    if (input._digitPopDebounceTimer) {
      window.clearTimeout(input._digitPopDebounceTimer);
      input._digitPopDebounceTimer = null;
      schedulePopInputAnimation(input, nextValue);
    } else if (input._digitPopTimer) {
      clearPopInputMotion(input);
      schedulePopInputAnimation(input, nextValue);
    }
    return;
  }

  clearPopInputMotion(input);
  schedulePopInputAnimation(input, nextValue);
}

function animateMoney(element, from, to) {
  setDigitDisplay(element, money(to), { restart: from === to });
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

function estimateTaxCents(amountCents) {
  return Math.round((amountCents * taxRate) / 100);
}

function adjustmentCents(amountValue, shipValue, taxOverrideCents = null, includeTax = true) {
  const amountCents = Math.round(amountValue * 100);
  const shipCents = Math.round(shipValue * 100);
  const taxCents = includeTax
    ? (taxOverrideCents === null ? estimateTaxCents(amountCents) : Math.max(0, Math.round(taxOverrideCents)))
    : 0;
  const subtotalCents = amountCents + taxCents;
  return { amountCents, taxCents, subtotalCents, shipCents, totalCents: subtotalCents + shipCents };
}

function updateMintedTotalComparison(input, status, totalCents) {
  const raw = input.value.trim();
  status.classList.remove('is-success', 'is-warning');
  input.setAttribute('aria-invalid', 'false');
  if (!raw) {
    status.textContent = '';
    return;
  }

  const mintedTotal = readAdjustmentField(input);
  if (!mintedTotal.ok) {
    input.setAttribute('aria-invalid', 'true');
    status.textContent = 'Enter a valid Minted total (up to 2 decimals).';
    status.classList.add('is-warning');
    return;
  }
  if (!Number.isSafeInteger(totalCents)) {
    status.textContent = 'Enter valid adjustment values to compare with Minted.';
    status.classList.add('is-warning');
    return;
  }

  const mintedCents = Math.round(mintedTotal.value * 100);
  if (totalCents === mintedCents) {
    status.textContent = 'Matches Minted';
    status.classList.add('is-success');
    return;
  }
  status.textContent = 'Mismatch: app ' + money(totalCents / 100) +
    ', Minted ' + money(mintedCents / 100) +
    ', difference ' + money(Math.abs(totalCents - mintedCents) / 100);
  status.classList.add('is-warning');
}

// Per-row version of computeAdjustment() for Batch.
function applyBatchAdjustment(row, data) {
  const amountInput = row.querySelector('.batch-adj-amount');
  const shipInput = row.querySelector('.batch-adj-ship');
  const taxOut = row.querySelector('.batch-adj-tax');
  const useTaxInput = row.querySelector('.batch-adj-use-tax');
  const subtotalOut = row.querySelector('.batch-adj-subtotal');
  const totalOut = row.querySelector('.batch-adj-total');
  const mintedTotalInput = row.querySelector('.batch-adj-minted-total');
  const mintedTotalStatus = row.querySelector('.batch-adj-total-check');
  const status = row.querySelector('.batch-adj-status');
  const limitWarning = row.querySelector('.batch-adj-limit-warning');

  const clear = (message, warn = false) => {
    taxOut.disabled = !useTaxInput.checked;
    taxOut.value = useTaxInput.checked ? '' : '0.00';
    subtotalOut.value = '';
    totalOut.value = '';
    totalOut.classList.remove('t-number-field-pop');
    clearPopInputMotion(totalOut);
    limitWarning.hidden = true;
    status.textContent = message;
    status.classList.remove('is-success', 'is-warning');
    if (warn) status.classList.add('is-warning');
    updateMintedTotalComparison(mintedTotalInput, mintedTotalStatus, null);
    return null;
  };

  const amount = readAdjustmentField(amountInput);
  const ship = readAdjustmentField(shipInput);
  const taxRaw = taxOut.value.trim();
  const tax = readAdjustmentField(taxOut);
  let taxEdited = row.dataset.taxEdited === '1';
  if (taxEdited && !taxRaw && document.activeElement !== taxOut) {
    row.dataset.taxEdited = '';
    taxEdited = false;
  }
  const taxLabel = taxOut.closest('.batch-adj-field')?.querySelector('.batch-adj-label > span');
  const totalLabel = totalOut.closest('.batch-adj-field')?.querySelector('.batch-adj-label > span');
  const taxUnconfirmed = useTaxInput.checked && !taxEdited;
  taxLabel.textContent = !useTaxInput.checked ? 'Tax excluded'
    : (taxEdited ? 'Tax from Minted' : 'Estimated tax');
  if (totalLabel) totalLabel.textContent = taxUnconfirmed ? 'Total Adjustment (estimate)' : 'Total Adjustment';
  totalOut.classList.toggle('is-unconfirmed', taxUnconfirmed);
  totalOut.setAttribute('aria-label', taxUnconfirmed
    ? 'Estimated total adjustment, not final until tax is replaced with Minted tax'
    : 'Calculated total adjustment');
  taxOut.disabled = !useTaxInput.checked;
  amountInput.setAttribute('aria-invalid', amount.ok ? 'false' : 'true');
  shipInput.setAttribute('aria-invalid', ship.ok ? 'false' : 'true');
  taxOut.setAttribute('aria-invalid', !useTaxInput.checked || !taxEdited || tax.ok ? 'false' : 'true');
  setInputMotionError(amountInput, !amount.ok);
  setInputMotionError(shipInput, !ship.ok);
  setInputMotionError(taxOut, useTaxInput.checked && taxEdited && !tax.ok);

  if (!data || amount.empty) return clear('Enter a price and discount to see the Minted adjustment.');
  if (!amount.ok || !ship.ok || (useTaxInput.checked && taxEdited && taxRaw && !tax.ok)) {
    return clear('Fix the highlighted values (up to 2 decimals).', true);
  }

  const amountCents = Math.round(amount.value * 100);
  const taxCents = !useTaxInput.checked
    ? 0
    : (taxEdited ? (taxRaw ? Math.round(tax.value * 100) : 0) : estimateTaxCents(amountCents));
  const adj = adjustmentCents(amount.value, ship.value, taxCents, useTaxInput.checked);
  if (!useTaxInput.checked) taxOut.value = '0.00';
  else if (!taxEdited) taxOut.value = (adj.taxCents / 100).toFixed(2);
  else if (taxRaw && document.activeElement !== taxOut) taxOut.value = (adj.taxCents / 100).toFixed(2);
  subtotalOut.value = (adj.subtotalCents / 100).toFixed(2);
  setPopInputValue(totalOut, (adj.totalCents / 100).toFixed(2));
  updateMintedTotalComparison(mintedTotalInput, mintedTotalStatus, adj.totalCents);
  limitWarning.hidden = adj.totalCents < 5000000;
  if (!useTaxInput.checked) {
    status.textContent = 'Tax excluded. Subtotal equals Amount.';
    status.classList.remove('is-warning');
    status.classList.add('is-success');
  } else if (taxEdited) {
    status.textContent = 'Using tax from Minted.';
    status.classList.remove('is-warning');
    status.classList.add('is-success');
  } else {
    status.textContent = 'Unconfirmed total: tax is an estimate. Replace it with Minted\'s tax before using this total.';
    status.classList.remove('is-success');
    status.classList.add('is-warning');
  }
  return adj;
}

function clearAdjustmentResults() {
  currentAdjustment = null;
  if (!adjUseTaxInput.checked) adjTax.value = '0.00';
  adjSubtotal.value = '';
  adjTotal.value = '';
  adjLimitWarning.hidden = true;
  adjTotal.classList.remove('t-number-field-pop');
  clearPopInputMotion(adjTotal);
  updateMintedTotalComparison(adjMintedTotal, adjMintedTotalCheck, null);
}

// Live: runs whenever Amount or Shipping changes.
function computeAdjustment() {
  const amount = readAdjustmentField(adjAmount);
  const ship = readAdjustmentField(adjShipInput);
  const taxRaw = adjTax.value.trim();
  const tax = readAdjustmentField(adjTax);
  let taxEdited = adjTax.dataset.taxEdited === '1';
  if (taxEdited && !taxRaw && document.activeElement !== adjTax) {
    adjTax.dataset.taxEdited = '';
    taxEdited = false;
  }
  const includeTax = adjUseTaxInput.checked;
  adjTax.disabled = !includeTax;
  const taxUnconfirmed = includeTax && !taxEdited;
  if (adjTaxLabel) adjTaxLabel.textContent = !includeTax ? 'Tax excluded'
    : (taxEdited ? 'Tax from Minted' : 'Estimated tax');
  if (adjTotalLabel) adjTotalLabel.textContent = taxUnconfirmed ? 'Total Adjustment (estimate)' : 'Total Adjustment';
  adjTotal.classList.toggle('is-unconfirmed', taxUnconfirmed);
  adjTotal.setAttribute('aria-label', taxUnconfirmed
    ? 'Estimated total adjustment, not final until tax is replaced with Minted tax'
    : 'Calculated total adjustment');

  adjAmount.setAttribute('aria-invalid', amount.ok ? 'false' : 'true');
  adjShipInput.setAttribute('aria-invalid', ship.ok ? 'false' : 'true');
  adjTax.setAttribute('aria-invalid', !includeTax || !taxEdited || tax.ok ? 'false' : 'true');
  setInputMotionError(adjAmount, !amount.ok);
  setInputMotionError(adjShipInput, !ship.ok);
  setInputMotionError(adjTax, includeTax && taxEdited && !tax.ok);
  adjStatus.classList.remove('is-success', 'is-warning');

  const stop = (message, warn = false) => {
    clearAdjustmentResults();
    adjStatus.textContent = message;
    if (warn) adjStatus.classList.add('is-warning');
    updateNote(calculated);
  };

  if (amount.empty) return stop('Enter a price and discount to see the Minted adjustment.');
  if (!amount.ok || !ship.ok || (includeTax && taxEdited && taxRaw && !tax.ok)) {
    return stop('Fix the highlighted values (up to 2 decimals).', true);
  }

  const amountCents = Math.round(amount.value * 100);
  const taxCents = !includeTax ? 0
    : (taxEdited ? (taxRaw ? Math.round(tax.value * 100) : 0) : estimateTaxCents(amountCents));
  currentAdjustment = adjustmentCents(amount.value, ship.value, taxCents, includeTax);
  const { amountCents: adjustedAmountCents, taxCents: appliedTaxCents, subtotalCents, totalCents } = currentAdjustment;

  if (!includeTax) adjTax.value = '0.00';
  else if (!taxEdited) adjTax.value = (appliedTaxCents / 100).toFixed(2);
  else if (taxRaw && document.activeElement !== adjTax) adjTax.value = (appliedTaxCents / 100).toFixed(2);
  adjSubtotal.value = (subtotalCents / 100).toFixed(2);
  setPopInputValue(adjTotal, (totalCents / 100).toFixed(2));
  updateMintedTotalComparison(adjMintedTotal, adjMintedTotalCheck, totalCents);
  adjLimitWarning.hidden = totalCents < 5000000;
  if (!includeTax) {
    adjStatus.textContent = 'Tax excluded. Subtotal equals Amount.';
    adjStatus.classList.add('is-success');
  } else if (taxEdited) {
    adjStatus.textContent = 'Using tax from Minted.';
    adjStatus.classList.add('is-success');
  } else {
    adjStatus.textContent = 'Unconfirmed total: tax is an estimate. Replace it with Minted\'s tax before using this total.';
    adjStatus.classList.add('is-warning');
  }
  updateNote(calculated);
}

// Called whenever the Final Backer Fee changes: Amount follows the fee, tax follows the Amount.
function updateAdjustment(finalFee, { resetTax = true } = {}) {
  adjAmount.value = calculated ? (Math.round(Number(finalFee) * 100) / 100).toFixed(2) : '';
  if (resetTax) {
    adjTax.dataset.taxEdited = '';
    if (!calculated) adjTax.value = '';
  }
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

function isSingleCustomerNoteReady() {
  if (!calculated || !currentAdjustment || !adjUseTaxInput.checked) return false;

  const tax = readAdjustmentField(adjTax);
  const mintedTotal = readAdjustmentField(adjMintedTotal);
  return adjTax.dataset.taxEdited === '1' &&
    !tax.empty && tax.ok &&
    !mintedTotal.empty && mintedTotal.ok &&
    Number.isSafeInteger(currentAdjustment.totalCents) &&
    adjMintedTotalCheck.textContent.trim() === 'Matches Minted';
}

function updateSingleNoteCopyState() {
  const hasDetails = Boolean(calculated && noteText.value.trim());
  const ready = hasDetails && isSingleCustomerNoteReady();
  copyBtn.disabled = !ready;
  noteCopyGuard.hidden = !hasDetails || ready;
  noteCopyGuard.textContent = ready ? '' :
    "Enter Minted's tax and total, then confirm “Matches Minted” before copying this note.";

  if (!calculated) {
    noteState.textContent = 'Waiting for valid details';
  } else if (!ready) {
    noteState.textContent = noteWasEdited ? 'Edited — tax and total not confirmed' : 'Tax and total not confirmed';
  } else {
    noteState.textContent = noteWasEdited ? 'Edited — ready to copy' : 'Updated automatically';
  }
}

function updateNote(data, { force = false } = {}) {
  if (!data) {
    if (force || !noteWasEdited) noteText.value = '';
    noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
    fitNote(noteText);
    updateSingleNoteCopyState();
    return;
  }

  const generated = buildCustomerNote({ ...data, discountedPrice: noteFee(data) });
  if (force || !noteWasEdited || !noteText.value.trim()) {
    noteText.value = generated;
    noteWasEdited = false;
  }
  noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
  fitNote(noteText);
  updateSingleNoteCopyState();
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
      taxRate: String(taxRate),
      customDiscount: customDiscountPreset,
      theme
    }));
  } catch (_) {
    safeRemoveStorage(STORAGE_KEYS.settings);
  }
}


function resetCalculator({ returnFocusToReset = false } = {}) {
  if (currentMode === 'batch') {
    lastResetSnapshot = { mode: 'batch', rows: batchRowsData() };
    renderBatchRows([createEmptyBatchRow(), createEmptyBatchRow()]);
    batchResults = [];
    batchStatus.textContent = '';
    copyAllNotesBtn.disabled = true;
    saveSettings();
    showResetUndoToast();
    if (!returnFocusToReset) batchRows.querySelector('.batch-price')?.focus();
    return;
  }

  lastResetSnapshot = {
    mode: 'single',
    backer: backerInput.value,
    discount: discountInput.value
  };

  const retainedTaxRate = taxRate;
  form.reset();
  taxRateInput.value = String(retainedTaxRate);
  taxRate = retainedTaxRate;
  updateTaxRateLabels();
  adjMintedTotal.value = '';
  updateMintedTotalComparison(adjMintedTotal, adjMintedTotalCheck, null);
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
  if (!returnFocusToReset) backerInput.focus();
}



function createEmptyBatchRow() {
  batchRowId += 1;
  return { id: batchRowId, name: '', backer: '', discount: '', amount: '', ship: '', tax: '', mintedTotal: '', taxEdited: false, useTax: true, amountEdited: false };
}

function batchRowsData() {
  return Array.from(batchRows.querySelectorAll('.batch-row')).map((row) => ({
    id: Number(row.dataset.id),
    name: row.querySelector('.batch-name')?.value ?? '',
    backer: row.querySelector('.batch-price')?.value ?? '',
    discount: row.querySelector('.batch-discount')?.value ?? '',
    amount: row.querySelector('.batch-adj-amount')?.value ?? '',
    ship: row.querySelector('.batch-adj-ship')?.value ?? '',
    tax: row.querySelector('.batch-adj-tax')?.value ?? '',
    mintedTotal: row.querySelector('.batch-adj-minted-total')?.value ?? '',
    taxEdited: row.dataset.taxEdited === '1',
    useTax: row.querySelector('.batch-adj-use-tax')?.checked ?? true,
    amountEdited: row.dataset.amountEdited === '1'
  }));
}

function saveBatchDraft(rows = batchRowsData()) {
  try {
    localStorage.setItem(STORAGE_KEYS.batchDraft, JSON.stringify(rows.map((rowData) => ({
      id: rowData.id,
      name: rowData.name ?? '',
      backer: rowData.backer ?? '',
      discount: rowData.discount ?? '',
      amount: rowData.amount ?? '',
      ship: rowData.ship ?? '',
      tax: rowData.tax ?? '',
      mintedTotal: rowData.mintedTotal ?? '',
      taxEdited: rowData.taxEdited === true,
      useTax: rowData.useTax !== false,
      amountEdited: rowData.amountEdited === true
    }))));
  } catch (_) {}
}

function loadBatchDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.batchDraft);
    if (!raw) return null;

    const savedRows = JSON.parse(raw);
    if (!Array.isArray(savedRows) || savedRows.length === 0) {
      throw new Error('Invalid Batch draft');
    }

    const usedIds = new Set();
    const rows = savedRows.map((rowData, index) => {
      if (!rowData || typeof rowData !== 'object' || Array.isArray(rowData)) {
        throw new Error('Invalid Batch draft row');
      }

      let id = Number(rowData.id);
      if (!Number.isSafeInteger(id) || id < 1 || usedIds.has(id)) {
        id = index + 1;
        while (usedIds.has(id)) id += 1;
      }
      usedIds.add(id);

      const textValue = (value, maxLength = 64) =>
        typeof value === 'string' ? value.slice(0, maxLength) : '';

      return {
        id,
        name: textValue(rowData.name, 60),
        backer: textValue(rowData.backer),
        discount: textValue(rowData.discount),
        amount: textValue(rowData.amount),
        ship: textValue(rowData.ship),
        tax: textValue(rowData.tax),
        mintedTotal: textValue(rowData.mintedTotal),
        taxEdited: rowData.taxEdited === true,
        useTax: rowData.useTax !== false,
        amountEdited: rowData.amountEdited === true
      };
    });

    batchRowId = rows.reduce((maxId, rowData) => Math.max(maxId, rowData.id), batchRowId);
    return rows;
  } catch (_) {
    safeRemoveStorage(STORAGE_KEYS.batchDraft);
    return null;
  }
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

function setBatchFieldError(input, errorElement, message, { shake = false } = {}) {
  const hasError = Boolean(message);
  input.setAttribute('aria-invalid', hasError ? 'true' : 'false');
  errorElement.textContent = message;
  input.closest('.batch-field')?.classList.toggle('invalid', hasError);
  setInputMotionError(input, hasError, { shake });
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

function validateBatchRow(row, { showErrors = false, shakeErrors = false } = {}) {
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
    showErrors || values.priceInput.value ? priceError : '',
    { shake: shakeErrors }
  );
  setBatchFieldError(
    values.discountInput,
    discountErrorElement,
    showErrors || values.discountInput.value ? discountError : '',
    { shake: shakeErrors }
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
        '<div class="batch-field"><span class="batch-cell-label">Original price</span>' +
        '<span class="input-wrap"><span class="prefix" aria-hidden="true">$</span>' +
        '<input class="batch-price" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Original price"></span>' +
        '<small class="error batch-error" role="alert"></small></div>' +
        '<div class="batch-field"><span class="batch-cell-label">Discount</span>' +
        '<span class="input-wrap"><input class="batch-discount" type="number" min="0" max="100" step="0.01" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Discount percentage">' +
        '<span class="suffix" aria-hidden="true">%</span></span>' +
        '<small class="error batch-discount-error" role="alert"></small></div>' +
        '<div class="batch-cell"><span class="batch-cell-label">Discount amount</span><div class="batch-result">$0.00</div></div>' +
        '<div class="batch-cell"><span class="batch-cell-label">Final fee</span><div class="batch-result batch-result-final">$0.00</div></div>' +
        '<button type="button" class="batch-remove" data-action="remove-batch-row" aria-label="Remove row" title="Remove row">×</button>' +
      '</div>' +
      '<div class="batch-adjust">' +
        '<div class="batch-adjust-head"><div><span class="section-kicker">FINANCIAL ADJUSTMENT</span><h3>Minted entry</h3></div>' +
        '<span class="adjustment-target-label">Estimate: ' + taxRate + '%</span></div>' +
        '<div class="batch-adjust-grid">' +
          adjField('Amount (enter in Minted)', '<input class="batch-adj-amount" type="number" min="0" step="0.01" placeholder="0.00" inputmode="decimal" autocomplete="off" aria-label="Amount to enter in Minted">',
            '<button type="button" class="adj-copy-btn" data-copy-from=".batch-adj-amount" aria-label="Copy Amount"><span class="t-text-swap">Copy</span></button>') +
          adjField('Estimated tax', '<input class="batch-adj-tax" type="number" min="0" step="0.01" placeholder="Enter Minted tax" inputmode="decimal" autocomplete="off" aria-label="Enter Minted tax to replace the estimate">',
            '<label class="adj-check">Include Tax: <input class="batch-adj-use-tax" type="checkbox" checked aria-label="Include tax"></label>') +
          adjField('Subtotal', '<input class="batch-adj-subtotal" type="number" min="0" step="0.01" placeholder="0.00" readonly aria-label="Calculated subtotal">') +
          adjField('Shipping Adjustment', '<input class="batch-adj-ship" type="number" min="0" step="0.01" placeholder="0.00" inputmode="decimal" autocomplete="off" aria-label="Shipping adjustment">') +
          adjField('Total Adjustment (estimate)', '<input class="batch-adj-total" type="number" min="0" step="0.01" placeholder="0.00" readonly aria-label="Estimated total adjustment, not final until tax is replaced with Minted tax">',
            '<button type="button" class="adj-copy-btn" data-copy-from=".batch-adj-total" aria-label="Copy Total Adjustment"><span class="t-text-swap">Copy</span></button>') +
          adjField('Total from Minted (optional)', '<input class="batch-adj-minted-total" type="number" min="0" step="0.01" placeholder="Enter Minted total" inputmode="decimal" autocomplete="off" aria-label="Total from Minted, optional">') +
        '</div>' +
        '<p class="adjustment-status batch-adj-total-check" role="status" aria-live="polite"></p>' +
        '<p class="adjustment-status batch-adj-status" role="status" aria-live="polite">Unconfirmed total: tax is an estimate. Replace it with Minted\'s tax before using this total.</p>' +
        '<p class="adjustment-limit-warning batch-adj-limit-warning" role="alert" hidden>Minted won\'t allow a charge of $50,000 or more.</p>' +
      '</div>';

    batchRows.appendChild(row);

    const priceInput = row.querySelector('.batch-price');
    const discountInputForRow = row.querySelector('.batch-discount');
    const amountInput = row.querySelector('.batch-adj-amount');
    const shipInput = row.querySelector('.batch-adj-ship');
    const taxInput = row.querySelector('.batch-adj-tax');
    const mintedTotalInput = row.querySelector('.batch-adj-minted-total');
    const useTaxInput = row.querySelector('.batch-adj-use-tax');
    priceInput.value = rowData.backer ?? '';
    discountInputForRow.value = rowData.discount ?? '';
    amountInput.value = rowData.amount ?? '';
    shipInput.value = rowData.ship ?? '';
    taxInput.value = rowData.tax ?? '';
    mintedTotalInput.value = rowData.mintedTotal ?? '';
    row.dataset.taxEdited = rowData.taxEdited ? '1' : '';
    useTaxInput.checked = rowData.useTax !== false;
    const nameInput = row.querySelector('.batch-name');
    nameInput.value = rowData.name ?? '';
    nameInput.addEventListener('input', () => calculateBatch());

    priceInput.addEventListener('focus', () => {
      priceInput.value = priceInput.value.replace(/,/g, '');
    });

    priceInput.addEventListener('input', () => {
      row.dataset.amountEdited = '';
      row.dataset.taxEdited = '';
      calculateBatch();
    });

    priceInput.addEventListener('blur', () => {
      formatBatchPrice(priceInput);
      validateBatchRow(row, { showErrors: true, shakeErrors: true });
    });

    priceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        discountInputForRow.focus();
      }
    });

    discountInputForRow.addEventListener('input', () => {
      row.dataset.amountEdited = '';
      row.dataset.taxEdited = '';
      const boundMessage = clampBatchDiscount(discountInputForRow);
      calculateBatch();
      if (boundMessage) {
        setBatchFieldError(discountInputForRow, row.querySelector('.batch-discount-error'), boundMessage);
      }
    });

    discountInputForRow.addEventListener('blur', () => {
      validateBatchRow(row, { showErrors: true, shakeErrors: true });
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
    amountInput.addEventListener('blur', () => {
      calculateBatch();
      const value = readAdjustmentField(amountInput);
      setInputMotionError(amountInput, !value.ok, { shake: true });
    });
    taxInput.addEventListener('input', () => {
      row.dataset.taxEdited = '1';
      calculateBatch();
    });
    taxInput.addEventListener('blur', () => {
      if (!taxInput.value.trim()) row.dataset.taxEdited = '';
      else {
        const value = readAdjustmentField(taxInput);
        if (value.ok) taxInput.value = (Math.round(value.value * 100) / 100).toFixed(2);
      }
      calculateBatch();
      const value = readAdjustmentField(taxInput);
      setInputMotionError(taxInput, useTaxInput.checked && row.dataset.taxEdited === '1' && !value.ok, { shake: true });
    });
    useTaxInput.addEventListener('change', () => {
      row.dataset.taxEdited = '';
      calculateBatch();
    });
    shipInput.addEventListener('input', () => calculateBatch());
    shipInput.addEventListener('blur', () => {
      calculateBatch();
      const value = readAdjustmentField(shipInput);
      setInputMotionError(shipInput, !value.ok, { shake: true });
    });
    mintedTotalInput.addEventListener('input', () => calculateBatch());
    mintedTotalInput.addEventListener('blur', () => {
      const value = readAdjustmentField(mintedTotalInput);
      if (!value.empty && value.ok) mintedTotalInput.value = (Math.round(value.value * 100) / 100).toFixed(2);
      calculateBatch();
      setInputMotionError(mintedTotalInput, !value.ok, { shake: true });
    });
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
      cancelDigitDisplay(discountBox, '$0.00');
      cancelDigitDisplay(finalBox, '$0.00');
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
      setDigitDisplay(discountBox, money(resultData.discountAmount));
      setDigitDisplay(finalBox, money(resultData.discountedPrice));
      if (row.dataset.amountEdited !== '1') amountInput.value = resultData.discountedPrice.toFixed(2);
      const adjustment = applyBatchAdjustment(row, resultData);
      const typedName = row.querySelector('.batch-name').value.trim();
      results.push({
        rowId: Number(row.dataset.id),
        name: typedName || 'Card ' + (index + 1),
        named: Boolean(typedName),
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
  batchStatus.textContent = invalidCount
    ? results.length + ' calculated · ' + invalidCount + ' row' + (invalidCount === 1 ? '' : 's') + ' need attention.'
    : (results.length
      ? results.length + ' row' + (results.length === 1 ? '' : 's') + ' calculated.'
      : 'Enter details in at least one row.');

  saveBatchDraft();
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

function areBatchCustomerNotesReady(results) {
  if (!results.length) return false;

  const rows = Array.from(batchRows.querySelectorAll('.batch-row'));
  return results.every((item) => {
    if (!item.adjustment) return false;
    const row = rows.find((candidate) => Number(candidate.dataset.id) === item.rowId);
    if (!row || row.dataset.taxEdited !== '1') return false;

    const taxInput = row.querySelector('.batch-adj-tax');
    const mintedTotalInput = row.querySelector('.batch-adj-minted-total');
    const useTaxInput = row.querySelector('.batch-adj-use-tax');
    const mintedTotalStatus = row.querySelector('.batch-adj-total-check');
    const tax = readAdjustmentField(taxInput);
    const mintedTotal = readAdjustmentField(mintedTotalInput);
    return useTaxInput.checked &&
      !tax.empty && tax.ok &&
      !mintedTotal.empty && mintedTotal.ok &&
      mintedTotalStatus.textContent.trim() === 'Matches Minted';
  });
}

function updateBatchNoteCopyState(results) {
  const ready = areBatchCustomerNotesReady(results);
  copyAllNotesBtn.disabled = !ready;
  batchNoteGuard.hidden = !results.length || ready;
  batchNoteGuard.textContent = ready ? '' :
    "Enter Minted's tax and total in every calculated row, then confirm “Matches Minted” before copying notes.";
}

function updateBatchNote(results) {
  const missing = results.filter((item) => !item.named).length;

  document.querySelectorAll('.batch-row').forEach((row) => {
    const input = row.querySelector('.batch-name');
    const hasResult = results.some((item) => item.rowId === Number(row.dataset.id));
    input.classList.toggle('needs-name', hasResult && !input.value.trim());
  });
  batchNoteState.classList.toggle('is-warning', missing > 0);

  if (!results.length) {
    batchNoteText.value = '';
    batchNoteState.textContent = 'Waiting for valid details';
    fitNote(batchNoteText);
    updateBatchNoteCopyState(results);
    return;
  }

  batchNoteText.value = buildBatchNote(results.map(({ name, data, adjustment }) => ({
    name,
    feeCents: adjustment ? adjustment.totalCents : Math.round(data.discountedPrice * 100)
  })));
  batchNoteState.textContent = missing
    ? missing + ' card name' + (missing === 1 ? '' : 's') + ' missing'
    : (areBatchCustomerNotesReady(results) ? 'Tax and total confirmed' : 'Tax and total not confirmed');
  fitNote(batchNoteText);
  updateBatchNoteCopyState(results);
}

async function copyAllNotes() {
  const notes = batchNoteText.value;
  if (!notes.trim()) return;
  if (!areBatchCustomerNotesReady(batchResults)) {
    updateBatchNoteCopyState(batchResults);
    batchStatus.textContent = "Enter Minted's tax and total in every calculated row, then confirm Matches Minted before copying notes.";
    return;
  }

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

  flashCopyButton(copyAllNotesBtn, '✓ Copied');
  batchStatus.textContent = 'Customer note copied.';
}

function removeBatchRow(row) {
  row.remove();
  if (!batchRows.querySelector('.batch-row')) {
    renderBatchRows([createEmptyBatchRow()]);
  }
  calculateBatch();
}

function replayPanelReveal(panel) {
  if (!panel || prefersReducedMotion()) return;
  panel.dataset.open = 'false';
  void panel.offsetHeight;
  panel.dataset.open = 'true';
}

function setMode(mode) {
  const nextMode = mode === 'batch' ? 'batch' : 'single';
  const modeChanged = currentMode !== nextMode;
  currentMode = nextMode;
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
  if (modeChanged) replayPanelReveal(dashboardCard);
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

function setCopyButtonText(button, nextText) {
  const label = button.querySelector('.t-text-swap');
  if (!label) {
    button.textContent = nextText;
    return;
  }

  const pending = textSwapTimers.get(label);
  if (pending) window.clearTimeout(pending);
  label.classList.remove('is-exit', 'is-enter-start');
  if (label.textContent === nextText) return;
  if (prefersReducedMotion()) {
    label.textContent = nextText;
    return;
  }

  label.classList.add('is-exit');
  const duration = motionMilliseconds('--text-swap-dur', 150);
  const timer = window.setTimeout(() => {
    if (label.isConnected) {
      label.textContent = nextText;
      label.classList.remove('is-exit');
      label.classList.add('is-enter-start');
      void label.offsetHeight;
      label.classList.remove('is-enter-start');
    }
    textSwapTimers.delete(label);
  }, duration);
  textSwapTimers.set(label, timer);
}

function restoreCopyButton() {
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = null;
  setCopyButtonText(copyBtn, 'Copy Note');
  copyBtn.classList.remove('is-copied');
}

function showCopyFeedback() {
  restoreCopyButton();
  setCopyButtonText(copyBtn, '✓ Copied');
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
  if (!isSingleCustomerNoteReady()) {
    updateSingleNoteCopyState();
    copyStatus.textContent = "Enter Minted's tax and total, then confirm Matches Minted before copying.";
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

function closeResetConfirmation({ restoreFocus = false } = {}) {
  resetConfirmation.hidden = true;
  resetConfirmation.removeAttribute('role');
  resetConfirmation.removeAttribute('aria-modal');
  resetConfirmation.removeAttribute('aria-labelledby');
  document.body.classList.remove('modal-open');
  document.documentElement.classList.remove('modal-open');
  if (pageShell) pageShell.inert = false;
  resetBtn.setAttribute('aria-expanded', 'false');
  if (restoreFocus) resetBtn.focus();
}

function requestReset() {
  if (!resetConfirmation.hidden) return;
  resetConfirmation.hidden = false;
  resetConfirmation.setAttribute('role', 'dialog');
  resetConfirmation.setAttribute('aria-modal', 'true');
  resetConfirmation.setAttribute('aria-labelledby', 'resetConfirmTitle');
  document.body.classList.add('modal-open');
  document.documentElement.classList.add('modal-open');
  if (pageShell) pageShell.inert = true;
  resetBtn.setAttribute('aria-expanded', 'true');
  cancelResetBtn.focus();
}

function trapResetModalTab(event) {
  const focusable = Array.from(resetConfirmation.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) {
    event.preventDefault();
    resetConfirmation.querySelector('.reset-modal')?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !resetConfirmation.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !resetConfirmation.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
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
taxRateInput.addEventListener('input', () => {
  const parsed = parseTaxRate(taxRateInput.value);
  taxRateInput.setAttribute('aria-invalid', parsed === null ? 'true' : 'false');
  taxRateError.textContent = parsed === null
    ? 'Enter a tax rate greater than 0% and no more than 100%.'
    : '';
  if (parsed === null) return;
  taxRate = parsed;
  updateTaxRateLabels();
  computeAdjustment();
  calculateBatch();
  saveSettings();
});
taxRateInput.addEventListener('blur', () => {
  const parsed = parseTaxRate(taxRateInput.value);
  if (parsed === null) {
    taxRate = DEFAULT_TAX_RATE;
    taxRateInput.value = String(DEFAULT_TAX_RATE);
  } else {
    taxRate = parsed;
    taxRateInput.value = String(taxRate);
  }
  taxRateInput.setAttribute('aria-invalid', 'false');
  taxRateError.textContent = '';
  saveSettings();
  updateTaxRateLabels();
  computeAdjustment();
  calculateBatch();
});
adjMintedTotal.addEventListener('input', () => {
  updateMintedTotalComparison(adjMintedTotal, adjMintedTotalCheck, currentAdjustment?.totalCents ?? null);
  updateSingleNoteCopyState();
});
adjMintedTotal.addEventListener('blur', () => {
  const value = readAdjustmentField(adjMintedTotal);
  if (!value.empty && value.ok) adjMintedTotal.value = (Math.round(value.value * 100) / 100).toFixed(2);
  updateMintedTotalComparison(adjMintedTotal, adjMintedTotalCheck, currentAdjustment?.totalCents ?? null);
  updateSingleNoteCopyState();
  setInputMotionError(adjMintedTotal, !value.ok, { shake: true });
});
adjTax.addEventListener('input', () => {
  adjTax.dataset.taxEdited = '1';
  computeAdjustment();
});
adjTax.addEventListener('blur', () => {
  if (!adjTax.value.trim()) adjTax.dataset.taxEdited = '';
  else {
    const value = readAdjustmentField(adjTax);
    if (value.ok) adjTax.value = (Math.round(value.value * 100) / 100).toFixed(2);
  }
  computeAdjustment();
  const value = readAdjustmentField(adjTax);
  setInputMotionError(adjTax, adjUseTaxInput.checked && adjTax.dataset.taxEdited === '1' && !value.ok, { shake: true });
});
adjUseTaxInput.addEventListener('change', () => {
  adjTax.dataset.taxEdited = '';
  computeAdjustment();
  saveSettings();
});
[adjAmount, adjShipInput].forEach((el) => {
  el.addEventListener('blur', () => {
    computeAdjustment();
    const value = readAdjustmentField(el);
    setInputMotionError(el, !value.ok, { shake: true });
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
cancelResetBtn.addEventListener('click', () => closeResetConfirmation({ restoreFocus: true }));
confirmResetBtn.addEventListener('click', () => {
  resetCalculator({ returnFocusToReset: true });
  closeResetConfirmation({ restoreFocus: true });
});
resetConfirmation.addEventListener('click', (event) => {
  if (event.target === resetConfirmation) closeResetConfirmation({ restoreFocus: true });
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
  validateCustomDiscount();
});

customDiscountInput.addEventListener('blur', () => {
  validateCustomDiscount({ shake: true });
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
  validate({ showErrors: true, shakeErrors: true });
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
  validate({ showErrors: true, shakeErrors: true });
});

discountInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (calculated) copyNote();
  }
});

noteText.addEventListener('input', () => {
  noteWasEdited = true;
  updateSingleNoteCopyState();
  copyStatus.textContent = '';
  restoreCopyButton();
  noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
  saveSettings();
  fitNote(noteText);
});

document.addEventListener('keydown', (event) => {
  if (!resetConfirmation.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeResetConfirmation({ restoreFocus: true });
      return;
    }
    if (event.key === 'Tab') {
      trapResetModalTab(event);
      return;
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    requestReset();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    copyNote();
  }
});


function flashCopyButton(button, text, ok = true) {
  if (!button.dataset.label) {
    button.dataset.label = button.querySelector('.t-text-swap')?.textContent ?? button.textContent;
  }
  setCopyButtonText(button, text);
  button.classList.toggle('is-copied', ok);
  const pending = copyFeedbackTimers.get(button);
  if (pending) window.clearTimeout(pending);
  const timer = window.setTimeout(() => {
    setCopyButtonText(button, button.dataset.label);
    button.classList.remove('is-copied');
    copyFeedbackTimers.delete(button);
  }, 1200);
  copyFeedbackTimers.set(button, timer);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('.adj-copy-btn');
  if (!button) return;

  // In Batch, look inside this row only; in Single, look in the whole page.
  const scope = button.closest('.batch-adjust') || document;
  const value = scope.querySelector(button.dataset.copyFrom)?.value.trim();
  if (!value) {
    flashCopyButton(button, 'Empty', false);
    return;
  }

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
  } catch (_) {
    if (!fallbackCopy(value)) {
      flashCopyButton(button, 'Failed', false);
      return;
    }
  }
  flashCopyButton(button, 'Copied ✓');
});

loadSettings();
applyUrlParams();
renderCustomPreset();
updatePresetState();
renderBatchRows(loadBatchDraft() ?? [createEmptyBatchRow(), createEmptyBatchRow()]);
setMode('single');
calculateBatch();

if (backerInput.value && discountInput.value) {
  noteWasEdited = false;
  calculateLive();
}

