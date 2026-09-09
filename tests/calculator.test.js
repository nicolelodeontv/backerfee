import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerNote, calculateFee, formatMoney } from '../calculator-utils.js';

test('calculates a standard discounted fee', () => {
  const result = calculateFee(100, 20);
  assert.equal(result.discountAmount, 20);
  assert.equal(result.discountedPrice, 80);
});

test('calculates decimal prices and discounts', () => {
  const result = calculateFee(49.99, 15);
  assert.ok(Math.abs(result.discountedPrice - 42.4915) < 0.0000001);
});

test('allows zero discount and full discount', () => {
  assert.equal(calculateFee(100, 0).discountedPrice, 100);
  assert.equal(calculateFee(100, 100).discountedPrice, 0);
});

test('rejects invalid prices and discounts', () => {
  assert.throws(() => calculateFee(-1, 10), RangeError);
  assert.throws(() => calculateFee(10, -1), RangeError);
  assert.throws(() => calculateFee(10, 101), RangeError);
});

test('formats money as US dollars', () => {
  assert.equal(formatMoney(12), '$12.00');
  assert.equal(formatMoney(1234.5), '$1,234.50');
});

test('builds the note with paragraph breaks', () => {
  const note = buildCustomerNote({ discountedPrice: 80, discount: 20 });
  assert.match(note, /\$80\.00/);
  assert.match(note, /20% discount/);
  assert.ok(note.includes('\n\n'));
});
