import { describe, it, expect } from 'vitest';
import { matchesSearch, productSearchText } from '@/lib/normalize';

describe('product search by name or product code', () => {
  const text = productSearchText('טארט פיצוחים', 'PRD-012');

  it('finds a product by its name', () => {
    expect(matchesSearch(text, 'פיצוחים')).toBe(true);
  });

  it('finds a product by its code, with or without the separator', () => {
    for (const q of ['PRD-012', 'prd012', 'prd 012', '012']) expect(matchesSearch(text, q)).toBe(true);
  });

  it('does not match an unrelated code', () => {
    expect(matchesSearch(text, 'PRD-013')).toBe(false);
  });

  it('works for a product without a code', () => {
    expect(productSearchText('עוגה', null)).toBe('עוגה');
  });
});
