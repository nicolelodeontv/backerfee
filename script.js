import { buildCustomerNote, calculateFee, formatMoney } from './calculator-utils.js';

const STORAGE_KEYS = {
  settings: 'backerfee-settings-v3',
  history: 'backerfee-history-v3'
};

const MAX_HISTORY = 8;
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
const feeBreakdownBar = document.getElementById('feeBreakdownBar');
const discountBar = document.getElementById('discountBar');
const finalFeeBar = document.getElementById('finalFeeBar');
const feeBreakdownTotal = document.getElementById('feeBreakdownTotal');
const discountBreakdownValue = document.getElementById('discountBreakdownValue');
const finalBreakdownValue = document.getElementById('finalBreakdownValue');
const noteText = document.getElementById('noteText');
const noteEmpty = document.getElementById('noteEmpty');
const noteState = document.getElementById('noteState');
const copyBtn = document.getElementById('copyBtn');
const copyStatus = document.getElementById('copyStatus');
const resetBtn = document.getElementById('resetBtn');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmActionBtn = document.getElementById('confirmActionBtn');

let calculated = null;
let customDiscountPreset = '';
let noteWasEdited = false;
let lastRecordedKey = '';
let confirmAction = null;
let lastFocusedElement = null;
let copyFeedbackTimer = null;
let resultsAnimationTimer = null;
const resultAnimationFrames = new Map();
let displayedResults = {
  discountAmount: 0,
  discountedPrice: 0
};

const money = formatMoney;

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

function updateFeeBreakdown(data) {
  if (!data) {
    discountBar.style.width = '0%';
    finalFeeBar.style.width = '0%';
    feeBreakdownTotal.textContent = '$0.00 original';
    discountBreakdownValue.textContent = '$0.00';
    finalBreakdownValue.textContent = '$0.00';
    feeBreakdownBar.setAttribute('aria-label', 'Fee breakdown unavailable until valid details are entered.');
    return;
  }

  const original = Number(data.backer);
  const discountAmount = Number(data.discountAmount);
  const finalFee = Number(data.discountedPrice);
  const discountWidth = original > 0
    ? Math.min(100, Math.max(0, (discountAmount / original) * 100))
    : 0;
  const finalWidth = original > 0 ? Math.max(0, 100 - discountWidth) : 0;

  discountBar.style.width = `${discountWidth}%`;
  finalFeeBar.style.width = `${finalWidth}%`;
  feeBreakdownTotal.textContent = `${money(original)} original`;
  discountBreakdownValue.textContent = money(discountAmount);
  finalBreakdownValue.textContent = money(finalFee);
  feeBreakdownBar.setAttribute(
    'aria-label',
    `Fee breakdown: ${money(discountAmount)} discount and ${money(finalFee)} final fee.`
  );
}

function clearResults() {
  updateResults({ discountAmount: 0, discountedPrice: 0 });
  updateFeeBreakdown(null);
}

function updateNote(data, { force = false } = {}) {
  if (!data) {
    noteState.textContent = 'Waiting for valid details';
    copyBtn.disabled = true;
    if (force || !noteWasEdited) noteText.value = '';
    noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
    return;
  }

  const generated = buildCustomerNote(data);
  if (force || !noteWasEdited || !noteText.value.trim()) {
    noteText.value = generated;
    noteWasEdited = false;
  }
  noteState.textContent = noteWasEdited ? 'Edited — ready to copy' : 'Updated automatically';
  copyBtn.disabled = !noteText.value.trim();
  noteEmpty?.setAttribute('aria-hidden', noteText.value.trim() ? 'true' : 'false');
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
    updateFeeBreakdown(calculated);
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

function normalizeHistoryItem(item) {
  if (!item || typeof item !== 'object') return null;

  const backer = Number(item.backer);
  const discount = Number(item.discount);
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';

  if (!Number.isFinite(backer) || backer < 0) return null;
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) return null;
  if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) return null;

  try {
    const recalculated = calculateFee(backer, discount);
    return {
      ...recalculated,
      id: typeof item.id === 'string' && item.id ? item.id : `${Date.now()}-${Math.random()}`,
      createdAt
    };
  } catch (_) {
    return null;
  }
}

function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid history');

    const valid = [];
    const seen = new Set();
    for (const item of parsed) {
      const normalized = normalizeHistoryItem(item);
      if (!normalized) continue;
      const key = `${normalized.backer}|${normalized.discount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      valid.push(normalized);
    }

    if (valid.length !== parsed.length) saveHistory(valid);
    return valid;
  } catch (_) {
    safeRemoveStorage(STORAGE_KEYS.history);
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch (_) {}
}

function makeHistoryKey(data) {
  return `${Number(data.backer).toFixed(2)}|${Number(data.discount).toFixed(2)}`;
}

function addHistory(data) {
  if (!data) return;

  const key = makeHistoryKey(data);
  const current = getHistory();
  const existing = current.find((item) => makeHistoryKey(item) === key);
  const previousSameKey = lastRecordedKey === key;

  if (previousSameKey && existing) return;
  lastRecordedKey = key;

  const next = {
    ...data,
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString()
  };
  const deduped = current.filter((item) => makeHistoryKey(item) !== key);
  saveHistory([next, ...deduped]);
  renderHistory();
}

function createHistoryButton(label, action, id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-action';
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function renderHistory() {
  const history = getHistory();
  historyList.replaceChildren();

  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Saved calculations will appear here for quick reuse.';
    historyList.appendChild(empty);
    clearHistoryBtn.disabled = true;
    return;
  }

  clearHistoryBtn.disabled = false;

  history.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const summary = document.createElement('div');
    summary.className = 'history-summary';

    const title = document.createElement('strong');
    title.textContent = `${money(item.backer)} → ${money(item.discountedPrice)}`;

    const meta = document.createElement('span');
    const dateLabel = formatHistoryDate(item.createdAt);
    const discountLabel = Number(item.discount) === 0 ? 'No discount' : `${item.discount}% discount`;
    meta.textContent = `${discountLabel}${dateLabel ? ` · ${dateLabel}` : ''}`;

    summary.append(title, meta);
    row.append(summary, createHistoryButton('Reuse', 'reuse', item.id), createHistoryButton('Delete', 'delete', item.id));
    historyList.appendChild(row);
  });
}

function clearCalculatorStorage() {
  try {
    const theme = document.documentElement.dataset.theme || 'light';
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      backer: '',
      discount: '',
      customDiscount: customDiscountPreset,
      theme
    }));
  } catch (_) {
    safeRemoveStorage(STORAGE_KEYS.settings);
  }
}

function resetCalculator() {
  form.reset();
  calculated = null;
  noteWasEdited = false;
  lastRecordedKey = '';
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
  backerInput.focus();
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
    if (calculated) addHistory(calculated);
  } catch (_) {
    if (fallbackCopy(noteText.value)) {
      copyStatus.textContent = 'Copied ✓';
      showCopyFeedback();
      if (calculated) addHistory(calculated);
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

function requestClearHistory() {
  if (!getHistory().length) return;

  openConfirmModal({
    title: 'Clear calculation history?',
    message: 'This will permanently remove all saved calculations from this browser.',
    actionLabel: 'Clear history',
    onConfirm: () => {
      saveHistory([]);
      lastRecordedKey = '';
      renderHistory();
    }
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
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next, { animate: true });
  saveSettings();
});
copyBtn.addEventListener('click', copyNote);
clearHistoryBtn.addEventListener('click', requestClearHistory);
confirmCancelBtn.addEventListener('click', closeConfirmModal);
confirmActionBtn.addEventListener('click', () => {
  const action = confirmAction;
  closeConfirmModal();
  if (action) action();
});

confirmModal.addEventListener('click', (event) => {
  if (event.target === confirmModal) closeConfirmModal();
});

historyList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const history = getHistory();
  const item = history.find((entry) => entry.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'delete') {
    saveHistory(history.filter((entry) => entry.id !== item.id));
    lastRecordedKey = '';
    renderHistory();
    return;
  }

  backerInput.value = Number(item.backer).toFixed(2);
  discountInput.value = Number(item.discount).toFixed(2);
  noteWasEdited = false;
  updatePresetState();
  calculateLive();
  backerInput.focus();
});

document.querySelectorAll('.preset-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const discount = button.dataset.discount;
    if (!discount) return;

    discountInput.value = discount;
    noteWasEdited = false;
    updatePresetState();
    calculateLive();
    addHistory(calculated);
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
  if (calculateLive()) addHistory(calculated);
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
  if (calculateLive()) addHistory(calculated);
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
updateFeeBreakdown(null);
renderHistory();

if (backerInput.value && discountInput.value) {
  noteWasEdited = false;
  calculateLive();
}
