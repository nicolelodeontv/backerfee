const CENT = 100;

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * CENT) / CENT;
}

export function calculateFee(backer, discount) {
  const originalPrice = Number(backer);
  const discountPercent = Number(discount);

  if (!Number.isFinite(originalPrice) || originalPrice < 0) {
    throw new RangeError('Backer price must be a non-negative number.');
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError('Discount must be between 0 and 100.');
  }

  const discountAmount = roundMoney(originalPrice * (discountPercent / 100));
  const discountedPrice = roundMoney(originalPrice - discountAmount);

  return {
    backer: roundMoney(originalPrice),
    discount: discountPercent,
    discountAmount,
    discountedPrice
  };
}

export function formatMoney(value) {
  return `$${roundMoney(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function buildCustomerNote({ discountedPrice, discount }) {
  return `I noticed your interest in adding to the back of your card.\n\nI’d be happy to make this customization for you. Our back-of-card printing comes to an additional fee of ${formatMoney(discountedPrice)}. This fee includes your ${discount}% discount.\n\nIf you’d like to continue with back-of-card printing, please request a change and leave a note approving the fee. If you’re happy with your card as-is and would no longer like printing on the back of your card, simply approve your design for print.`;
}
