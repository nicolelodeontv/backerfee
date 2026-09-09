const form = document.getElementById('calculatorForm');
const backerInput = document.getElementById('backer');
const discountInput = document.getElementById('discount');
const taxInput = document.getElementById('tax');
const result = document.getElementById('result');
const total = document.getElementById('total');
const totaltax = document.getElementById('totaltax');
const noteText = document.getElementById('noteText');
const copyStatus = document.getElementById('copyStatus');

let calculated = null;

const money = (value) => `₱${Number(value).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

function calculate() {
  const backer = Number(backerInput.value);
  const discount = Number(discountInput.value);
  const tax = Number(taxInput.value || 0);

  if (!Number.isFinite(backer) || backer < 0) {
    backerInput.focus();
    return false;
  }
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    discountInput.focus();
    return false;
  }
  if (!Number.isFinite(tax) || tax < 0) {
    taxInput.focus();
    return false;
  }

  const discountAmount = backer * (discount / 100);
  const discountedPrice = backer - discountAmount;
  const finalPrice = discountedPrice + tax;

  calculated = { backer, discount, tax, discountAmount, discountedPrice, finalPrice };
  result.textContent = money(discountAmount);
  total.textContent = money(discountedPrice);
  totaltax.textContent = money(finalPrice);
  return true;
}

function generateNote() {
  if (!calculate()) return;

  const { discount, discountedPrice, finalPrice } = calculated;
  noteText.textContent = `Backer Fee: ${money(discountedPrice)} with ${discount}% discount + tax = ${money(finalPrice)}.`;
  copyStatus.textContent = '';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  calculate();
});

document.getElementById('noteBtn').addEventListener('click', generateNote);

document.getElementById('copyBtn').addEventListener('click', async () => {
  const text = noteText.textContent.trim();
  if (!text || text === 'Backer Fee note will generate here') return;

  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = 'Copied!';
    setTimeout(() => { copyStatus.textContent = ''; }, 1800);
  } catch {
    copyStatus.textContent = 'Copy failed — select the note manually.';
  }
});

[backerInput, discountInput, taxInput].forEach((input) => {
  input.addEventListener('input', () => {
    if (calculated) calculate();
  });
});
