const form = document.getElementById('calculatorForm');
const backerInput = document.getElementById('backer');
const discountInput = document.getElementById('discount');
const result = document.getElementById('result');
const total = document.getElementById('total');
const noteText = document.getElementById('noteText');
const copyStatus = document.getElementById('copyStatus');

let calculated = null;
let generatedNote = '';

const money = (value) => `$${Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

function calculate() {
  const backer = Number(backerInput.value);
  const discount = Number(discountInput.value);

  if (!Number.isFinite(backer) || backer < 0) {
    backerInput.focus();
    return false;
  }
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    discountInput.focus();
    return false;
  }

  const discountAmount = backer * (discount / 100);
  const discountedPrice = backer - discountAmount;

  calculated = { backer, discount, discountAmount, discountedPrice };
  result.textContent = money(discountAmount);
  total.textContent = money(discountedPrice);
  return true;
}

function generateNote() {
  if (!calculate()) return;

  const { discountedPrice, discount } = calculated;
  generatedNote = `I noticed your interest in adding to the back of your card.\n\nI’d be happy to make this customization for you. Our back-of-card printing comes to an additional fee of ${money(discountedPrice)} for the quantity of cards you’ve purchased. This fee includes your ${discount}% discount.\n\nIf you’d like to continue with back-of-card printing, please request a change and leave a note approving the fee. If you’re happy with your card as-is and would no longer like printing on the back of your card, simply approve your design for print.`;
  noteText.textContent = generatedNote;
  copyStatus.textContent = '';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  calculate();
});

document.getElementById('noteBtn').addEventListener('click', generateNote);

document.getElementById('copyBtn').addEventListener('click', async () => {
  const text = generatedNote.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = 'Copied!';
    setTimeout(() => { copyStatus.textContent = ''; }, 1800);
  } catch {
    copyStatus.textContent = 'Copy failed — select the note manually.';
  }
});

[backerInput, discountInput].forEach((input) => {
  input.addEventListener('input', () => {
    if (calculated) calculate();
  });
});
