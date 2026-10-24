import { describe, it, expect } from 'vitest';
import { salePriceBeforeVat, salePriceWithVat } from '@/lib/product-costs';

describe('sale price VAT conversion (/costs ↔ price list)', () => {
  it('adds VAT to the pre-VAT price for the private-customer price list', () => {
    expect(salePriceWithVat(100)).toBe(118);
    expect(salePriceWithVat(85)).toBe(100.3);
  });

  it('shows the price-list price before VAT on /costs', () => {
    expect(salePriceBeforeVat(118)).toBe(100);
    expect(salePriceBeforeVat(null)).toBeNull();
  });

  it('round-trips the price the owner entered', () => {
    for (const net of [12, 45.5, 85, 199.9]) expect(salePriceBeforeVat(salePriceWithVat(net))).toBe(net);
  });
});
