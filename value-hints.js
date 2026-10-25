/*
 * Soft hints for unusual values. They never block or change the calculation;
 * they only show a short note under the Discount field.
 */
(() => {
  const HIGH_DISCOUNT = 50;
  const input = document.getElementById('discount');
  const hint = document.getElementById('discountSoftHint');
  if (!input || !hint) return;

  function update() {
    const raw = input.value.trim();
    const value = raw === '' ? NaN : Number(raw);
    let message = '';
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      if (value === 100) {
        message = '100% discount makes the backer fee $0.00. Double-check this is intended.';
      } else if (value > HIGH_DISCOUNT) {
        message = `${value}% is a large discount. Double-check before sending the note.`;
      }
    }
    hint.textContent = message;
    hint.hidden = message === '';
  }

  const later = () => window.setTimeout(update, 0);
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  // Presets, Reset and Undo set the value from script, so re-check after clicks.
  document.addEventListener('click', later);
  update();
})();
