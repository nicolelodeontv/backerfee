import { buildCustomerNote, calculateFee, formatMoney } from './calculator-utils.js';

const STORAGE_KEYS = {
  settings: 'backerfee-settings-v3',
  history: 'backerfee-history-v3'
};

const form = document.getElementById('calculatorForm');
const backerInput = document.getElementById('backer');
const discountInput = document.getElementById('discount');
const result = document.getElementById('result');
const total = document.getElementById('total');
const noteText = document.getElementById('noteText');
const noteState = document.getElementById('noteState');
const copyBtn = document.getElementById('copyBtn');
const copyStatus = document.getElementById('copyStatus');
const resetBtn = document.getElementById('resetBtn');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

let calculated = null;
let noteWasEdited = false;
let lastRecordedKey = '';

const money = formatMoney;

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      backer: backerInput.value,
      discount: discountInput.value,
      theme: document.documentElement.dataset.theme || 'light'
    }));
  } catch (_) {}
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
    if (typeof data.backer === 'string') backerInput.value = data.backer;
    if (typeof data.discount === 'string') discountInput.value = data.discount;
    applyTheme(data.theme === 'dark' || data.theme === 'light'
      ? data.theme
      : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  } catch (_) {
    applyTheme('light');
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
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
  const backer = Number(backerRaw);
  const discount = Number(discountRaw);

  return {
    backerRaw,
    discountRaw,
    backer,
    discount,
    validBacker: Boolean(backerRaw) && Number.isFinite(backer) && backer >= 0,
    validDiscount: Boolean(discountRaw) && Number.isFinite(discount) && discount >= 0 && discount <= 100
  };
}

function validate({ showErrors = false } = {}) {
  const values = readValues();

  if (showErrors || values.validBacker) {
    setFieldError(backerInput, 'backerError', values.validBacker ? '' : 'Enter a valid price of $0 or more.');
  } else {
    setFieldError(backerInput, 'backerError', '');
  }

  if (showErrors || values.validDiscount) {
    setFieldError(discountInput, 'discountError', values.validDiscount ? '' : 'Enter a discount between 0% and 100%.');
  } else {
    setFieldError(discountInput, 'discountError', '');
  }

  return values.validBacker && values.validDiscount ? { backer: values.backer, discount: values.discount } : null;
}

function updateResults(data) {
  result.textContent = money(data.discountAmount);
  total.textContent = money(data.discountedPrice);
}

function clearResults() {
  result.textContent = '$0.00';
  total.textContent = '$0.00';
}

function updateNote(data, { force = false } = {}) {
  if (!data) {
    noteState.textContent = 'Waiting for valid details';
    copyBtn.disabled = true;
    if (force || !noteWasEdited) noteText.value = '';
    return;
  }

  const generated = buildCustomerNote(data);
  if (force || !noteWasEdited || !noteText.value.trim()) {
    noteText.value = generated;
    noteWasEdited = false;
  }
  noteState.textContent = noteWasEdited ? 'Edited — ready to copy' : 'Updated automatically';
  copyBtn.disabled = !noteText.value.trim();
}

function calculateLive({ recordHistory = false } = {}) {
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
    updateNote(calculated);
    saveSettings();

    if (recordHistory) addHistory(calculated);
    return true;
  } catch (error) {
    calculated = null;
    clearResults();
    updateNote(null);
    setFieldError(backerInput, 'backerError', error instanceof RangeError ? error.message : 'Unable to calculate the fee.');
    return false;
  }
}

function getHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    return Array.isArray(history) ? history : [];
  } catch (_) {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(0, 8)));
  } catch (_) {}
}

function addHistory(data) {
  const key = `${data.backer}|${data.discount}`;
  if (key === lastRecordedKey) return;
  lastRecordedKey = key;

  const current = getHistory();
  const next = {
    ...data,
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString()
  };
  const deduped = current.filter((item) => !(Number(item.backer) === data.backer && Number(item.discount) === data.discount));
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

function renderHistory() {
  const history = getHistory();
  historyList.replaceChildren();

  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Your latest calculations will appear here.';
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
    const date = new Date(item.createdAt);
    const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
    const discountLabel = Number(item.discount) === 0 ? 'No discount' : `${item.discount}% discount`;
    meta.textContent = `${discountLabel}${dateLabel ? ` · ${dateLabel}` : ''}`;

    summary.append(title, meta);
    row.append(summary, createHistoryButton('Reuse', 'reuse', item.id), createHistoryButton('Delete', 'delete', item.id));
    historyList.appendChild(row);
  });
}

function resetCalculator() {
  form.reset();
  calculated = null;
  noteWasEdited = false;
  lastRecordedKey = '';
  clearResults();
  noteText.value = '';
  noteState.textContent = 'Waiting for valid details';
  copyBtn.disabled = true;
  copyStatus.textContent = '';
  setFieldError(backerInput, 'backerError', '');
  setFieldError(discountInput, 'discountError', '');
  updatePresetState();
  saveSettings();
  backerInput.focus();
}

async function copyNote() {
  const text = noteText.value.trim();
  if (!text) {
    copyStatus.textContent = 'Enter valid details to generate a note.';
    return;
  }

  try {
    await navigator.clipboard.writeText(noteText.value);
    copyStatus.textContent = 'Copied ✓';
    if (calculated) addHistory(calculated);
  } catch (_) {
    noteText.focus();
    noteText.select();
    copyStatus.textContent = 'Clipboard blocked — note selected for copying.';
  }
}

form.addEventListener('submit', (event) => event.preventDefault());

resetBtn.addEventListener('click', resetCalculator);
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveSettings();
});
copyBtn.addEventListener('click', copyNote);
clearHistoryBtn.addEventListener('click', () => {
  if (getHistory().length && window.confirm('Clear all calculation history?')) {
    saveHistory([]);
    lastRecordedKey = '';
    renderHistory();
  }
});

historyList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const history = getHistory();
  const item = history.find((entry) => entry.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'delete') {
    saveHistory(history.filter((entry) => entry.id !== item.id));
    renderHistory();
    return;
  }

  backerInput.value = item.backer;
  discountInput.value = item.discount;
  noteWasEdited = false;
  updatePresetState();
  calculateLive();
  backerInput.focus();
});

function updatePresetState() {
  document.querySelectorAll('.preset-btn').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.discount) === Number(discountInput.value));
  });
}

document.querySelectorAll('.preset-btn').forEach((button) => {
  button.addEventListener('click', () => {
    discountInput.value = button.dataset.discount;
    noteWasEdited = false;
    updatePresetState();
    calculateLive({ recordHistory: true });
    discountInput.focus();
  });
});

[backerInput, discountInput].forEach((input) => {
  input.addEventListener('input', () => {
    updatePresetState();
    saveSettings();
    calculateLive();
    copyStatus.textContent = '';
  });

  input.addEventListener('blur', () => {
    validate({ showErrors: true });
    const values = validate();
    if (values) addHistory(calculateFee(values.backer, values.discount));
  });
});

noteText.addEventListener('input', () => {
  noteWasEdited = true;
  noteState.textContent = 'Edited — ready to copy';
  copyBtn.disabled = !noteText.value.trim();
  copyStatus.textContent = '';
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') resetCalculator();
});

loadSettings();
updatePresetState();
renderHistory();

if (backerInput.value && discountInput.value) {
  noteWasEdited = false;
  calculateLive();
}
