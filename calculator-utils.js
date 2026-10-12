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

export function calculateAdjustment(finalFee, taxRatePercent) {
  const target = Number(finalFee);
  const taxPercent = Number(taxRatePercent);
  if (!Number.isFinite(target) || target < 0) {
    throw new RangeError('Final fee must be a non-negative number.');
  }
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
    throw new RangeError('Tax rate must be between 0 and 100.');
  }

  const targetCents = Math.round(roundMoney(target) * CENT);
  const rate = taxPercent / 100;
  const estimate = Math.round(targetCents / (1 + rate));
  const candidates = [...new Set([estimate, estimate - 1, estimate + 1, estimate - 2, estimate + 2])]
    .filter((amountCents) => amountCents >= 0)
    .map((amountCents) => {
      const taxCents = Math.round((amountCents * rate) + Number.EPSILON);
      const subtotalCents = amountCents + taxCents;
      return {
        amountCents,
        taxCents,
        subtotalCents,
        differenceCents: subtotalCents - targetCents
      };
    });

  const exact = candidates.find((candidate) => candidate.subtotalCents === targetCents);
  const selected = exact ?? candidates.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate.differenceCents);
    const bestDistance = Math.abs(best.differenceCents);
    if (candidateDistance < bestDistance) return candidate;
    if (candidateDistance === bestDistance &&
        Math.abs(candidate.amountCents - estimate) < Math.abs(best.amountCents - estimate)) {
      return candidate;
    }
    return best;
  });

  return {
    targetCents,
    ...selected,
    exactMatch: Boolean(exact)
  };
}

export function formatMoney(value) {
  return `$${roundMoney(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function buildCustomerNote({ discountedPrice, discount }) {
  return `I noticed your interest in adding to the back of your card.\n\nI’d be happy to make this customization for you. Our back-of-card printing comes to an additional fee of ${formatMoney(discountedPrice)} for the quantity of cards you’ve purchased. This fee includes your ${discount}% discount and any local taxes.\n\nIf you’d like to continue with back-of-card printing, please request a change and leave a note approving the fee. If you’re happy with your card as-is and would no longer like printing on the back of your card, simply approve your design for print.`;
}
