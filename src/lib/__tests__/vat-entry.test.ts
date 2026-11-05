import { describe, expect, it } from 'vitest';
import { vatEntryFactor, typedToStored, storedToTyped } from '../vat-entry';

describe('vat-entry', () => {
  it('is a no-op when the typed basis matches the stored one', () => {
    expect(vatEntryFactor(true, true)).toBe(1);
    expect(vatEntryFactor(false, false)).toBe(1);
    expect(typedToStored(12.345, 1)).toBe(12.345);
  });

  it('business order, price typed including VAT → stored before VAT', () => {
    const f = vatEntryFactor(false, true);
    expect(typedToStored(118, f)).toBe(100);
    expect(typedToStored(100, f)).toBe(84.75);
    expect(storedToTyped(100, f)).toBe(118);
  });

  it('private order, price typed before VAT → stored including VAT', () => {
    const f = vatEntryFactor(true, false);
    expect(typedToStored(100, f)).toBe(118);
    expect(storedToTyped(118, f)).toBe(100);
  });

  it('treats non-numbers as zero', () => {
    expect(typedToStored(NaN, 1.18)).toBe(0);
    expect(storedToTyped(NaN, 1.18)).toBe(0);
  });
});
