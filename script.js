const STORAGE_KEYS = {
  settings: 'backerfee-settings-v2',
  history: 'backerfee-history-v2'
};

const form = document.getElementById('calculatorForm');
const backerInput = document.getElementById('backer');
const discountInput = document.getElementById('discount');
const result = document.getElementById('result');
const total = document.getElementById('total');
const noteText = document.getElementById('noteText');
const copyStatus = document.getElementById('copyStatus');
const resetBtn = document.getElementById('resetBtn');
const generateBtn = document.getElementById('generateBtn');
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

let calculated = null;
let noteDirty = false;

const money = (value) => `$${Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      backer: backerInput.value,
      discount: discountInput.value,
      theme: document.documentElement.dataset.theme || 'light'
    }));
  } catch (_) {
    // Local persistence is optional.
  }
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
    if (typeof data.backer === 'string') backerInput.value = data.backer;
    if (typeof data.discount === 'string') discountInput.value = data.discount;
    if (data.theme === 'dark' || data.theme === 'light') {
      applyTheme(data.theme);
    } else {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
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
}

function validate() {
  const backerRaw = backerInput.value.trim();
  const discountRaw = discountInput.value.trim();
  const backer = Number(backerRaw);
  const discount = Number(discountRaw);
  let valid = true;

  if (!backerRaw || !Number.isFinite(backer) || backer < 0) {
    setFieldError(backerInput, 'backerError', 'Enter a valid price of $0 or more.');
    valid = false;
  } else {
    setFieldError(backerInput, 'backerError', '');
  }

  if (!discountRaw || !Number.isFinite(discount) || discount < 0 || discount > 100) {
    setFieldError(discountInput, 'discountError', 'Enter a discount between 0% and 100%.');
    valid = false;
  } else {
    setFieldError(discountInput, 'discountError', '');
  }

  return valid ? { backer, discount } : null;
}

function calculate({ record = true } = {}) {
  const values = validate();
  if (!values) return false;

  const { backer, discount } = values;
  const discountAmount = backer * (discount / 100);
  const discountedPrice = backer - discountAmount;

  calculated = { backer, discount, discountAmount, discountedPrice };
  result.textContent = money(discountAmount);
  total.textContent = money(discountedPrice);

  if (record) addHistory(calculated);
  noteDirty = true;
  saveSettings();
  return true;
}

function createNote(data = calculated) {
  if (!data) return '';
  const { discountedPrice, discount } = data;
  return `I noticed your interest in adding to the back of your card.\n\nI’d be happy to make this customization for you. Our back-of-card printing comes to an additional fee of ${money(discountedPrice)} for the quantity of cards you’ve purchased. This fee includes your ${discount}% discount.\n\nIf you’d like to continue with back-of-card printing, please request a change and leave a note approving the fee. If you’re happy with your card as-is and would no longer like printing on the back of your card, simply approve your design for print.`;
}

function generateNote() {
  if (!calculated && !calculate()) return;
  noteText.value = createNote();
  noteDirty = false;
  copyStatus.textContent = 'Ready to copy.';
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
  } catch (_) {
    // Local persistence is optional.
  }
}

function addHistory(data) {
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

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    historyList.innerHTML = '<div class="history-empty">Your latest calculations will appear here.</div>';
    return;
  }

  historyList.innerHTML = history.map((item) => {
    const date = new Date(item.createdAt);
    const label = Number(item.discount) === 0 ? 'No discount' : `${item.discount}% discount`;
    return `<div class="history-item">
      <div class="history-summary">
        <strong>${money(item.backer)} → ${money(item.discountedPrice)}</strong>
        <span>${label} · ${Number.isNaN(date.getTime()) ? '' : date.toLocaleString()}</span>
      </div>
      <button class="history-action" type="button" data-action="reuse" data-id="${item.id}">Reuse</button>
      <button class="history-action" type="button" data-action="delete" data-id="${item.id}">Delete</button>
    </div>`;
  }).join('');
}

function resetCalculator() {
  form.reset();
  calculated = null;
  noteDirty = false;
  result.textContent = '$0.00';
  total.textContent = '$0.00';
  noteText.value = '';
  copyStatus.textContent = '';
  setFieldError(backerInput, 'backerError', '');
  setFieldError(discountInput, 'discountError', '');
  document.querySelectorAll('.preset-btn').forEach((button) => button.classList.remove('active'));
  saveSettings();
  backerInput.focus();
}

async function copyNote() {
  const text = noteText.value.trim();
  if (!text) {
    copyStatus.textContent = 'Generate a note first.';
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = 'Copied ✓';
  } catch (_) {
    noteText.focus();
    noteText.select();
    copyStatus.textContent = 'Clipboard blocked — note selected for copying.';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  calculate();
});

generateBtn.addEventListener('click', generateNote);
resetBtn.addEventListener('click', resetCalculator);
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveSettings();
});

document.getElementById('copyBtn').addEventListener('click', copyNote);
clearHistoryBtn.addEventListener('click', () => {
  saveHistory([]);
  renderHistory();
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
  updatePresetState();
  calculate({ record: false });
  generateNote();
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
    updatePresetState();
    calculate();
  });
});

[backerInput, discountInput].forEach((input) => {
  input.addEventListener('input', () => {
    updatePresetState();
    saveSettings();
    const values = validate();
    if (values) {
      const discountAmount = values.backer * (values.discount / 100);
      result.textContent = money(discountAmount);
      total.textContent = money(values.backer - discountAmount);
      calculated = {
        backer: values.backer,
        discount: values.discount,
        discountAmount,
        discountedPrice: values.backer - discountAmount
      };
      noteDirty = true;
    }
  });
});

noteText.addEventListener('input', () => {
  noteDirty = true;
  copyStatus.textContent = '';
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') resetCalculator();
});

loadSettings();
updatePresetState();
renderHistory();

// Restore a valid saved calculation visually without adding it to history.
if (backerInput.value && discountInput.value && validate()) {
  calculate({ record: false });
  noteText.value = '';
  noteDirty = false;
}
