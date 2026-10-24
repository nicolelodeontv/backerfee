import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerNote, calculateAdjustment, calculateFee, formatMoney, roundMoney } from '../calculator-utils.js';

test('calculates a standard discounted fee', () => {
  const result = calculateFee(100, 20);
  assert.equal(result.discountAmount, 20);
  assert.equal(result.discountedPrice, 80);
});

test('rounds calculated money to cents', () => {
  const result = calculateFee(49.99, 15);
  assert.equal(result.discountAmount, 7.5);
  assert.equal(result.discountedPrice, 42.49);
});

test('roundMoney handles floating point artifacts', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(42.49149999999999), 42.49);
});

test('allows decimal prices and discounts up to two decimal places', () => {
  const result = calculateFee(19.95, 12.5);
  assert.equal(result.discountAmount, 2.49);
  assert.equal(result.discountedPrice, 17.46);
});

test('allows zero discount and full discount', () => {
  assert.equal(calculateFee(100, 0).discountedPrice, 100);
  assert.equal(calculateFee(100, 100).discountedPrice, 0);
});

test('handles very small and very large valid prices', () => {
  assert.equal(calculateFee(0.01, 10).discountedPrice, 0.01);
  assert.equal(calculateFee(0.01, 100).discountedPrice, 0);
  assert.equal(calculateFee(999999999.99, 10).discountedPrice, 899999999.99);
  assert.equal(calculateFee(999999999.99, 100).discountedPrice, 0);
});

test('rejects invalid prices and discounts', () => {
  assert.throws(() => calculateFee(-1, 10), RangeError);
  assert.throws(() => calculateFee(10, -1), RangeError);
  assert.throws(() => calculateFee(10, 101), RangeError);
  assert.throws(() => calculateFee(Number.NaN, 10), RangeError);
  assert.throws(() => calculateFee(10, Number.POSITIVE_INFINITY), RangeError);
});

test('formats money as US dollars', () => {
  assert.equal(formatMoney(12), '$12.00');
  assert.equal(formatMoney(1234.5), '$1,234.50');
  assert.equal(formatMoney(42.491499999), '$42.49');
});

test('builds the note with paragraph breaks and the requested fee wording', () => {
  const note = buildCustomerNote({ discountedPrice: 80, discount: 20 });
  assert.match(note, /\$80\.00/);
  assert.match(note, /20% discount/);
  assert.ok(note.includes('\n\n'));
  assert.match(note, /for the quantity of cards you’ve purchased/);
  assert.match(note, /any local taxes/);
});


test('customer note accurately states when local taxes are excluded', () => {
  const note = buildCustomerNote({ discountedPrice: 55.55, discount: 20, includesLocalTaxes: false });
  assert.ok(note.includes('$55.55'));
  assert.match(note, /20% discount/);
  assert.match(note, /local taxes are excluded/);
  assert.doesNotMatch(note, /any local taxes/);
});

test('backs a tax-inclusive fee into the exact pre-tax Minted Amount', () => {
  const adjustment = calculateAdjustment(19.24, 9.77);
  assert.equal(adjustment.amountCents, 1753);
  assert.equal(adjustment.taxCents, 171);
  assert.equal(adjustment.subtotalCents, 1924);
  assert.equal(adjustment.exactMatch, true);
});

test('supports zero-tax totals without changing the amount', () => {
  const adjustment = calculateAdjustment(19.24, 0);
  assert.equal(adjustment.amountCents, 1924);
  assert.equal(adjustment.taxCents, 0);
  assert.equal(adjustment.subtotalCents, 1924);
  assert.equal(adjustment.exactMatch, true);
});

test('flags totals that cannot be matched at whole-cent precision', () => {
  const adjustment = calculateAdjustment(0.01, 100);
  assert.equal(adjustment.exactMatch, false);
  assert.notEqual(adjustment.subtotalCents, adjustment.targetCents);
});

test('rejects invalid adjustment totals and tax rates', () => {
  assert.throws(() => calculateAdjustment(-1, 9.77), RangeError);
  assert.throws(() => calculateAdjustment(Number.NaN, 9.77), RangeError);
  assert.throws(() => calculateAdjustment(19.24, -0.01), RangeError);
  assert.throws(() => calculateAdjustment(19.24, 100.01), RangeError);
});
