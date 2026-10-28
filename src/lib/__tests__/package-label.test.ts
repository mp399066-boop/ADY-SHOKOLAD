import { describe, expect, it } from 'vitest';
import { packageLabel } from '../packageCapacity';

describe('packageLabel', () => {
  it('always shows how many pieces are inside', () => {
    expect(packageLabel(9)).toBe('מארז 9 פטיפורים');
    expect(packageLabel(25, 'מארז פטיפורים ')).toBe('מארז 25 פטיפורים');
    expect(packageLabel('16', 'מארז')).toBe('מארז 16 פטיפורים');
  });

  it('keeps a real package name and adds the size only when missing', () => {
    expect(packageLabel(12, 'מארז יוקרה')).toBe('מארז יוקרה (12 פטיפורים)');
    expect(packageLabel(12, 'מארז יוקרה 12')).toBe('מארז יוקרה 12');
  });

  it('falls back when the size is unknown', () => {
    expect(packageLabel(null)).toBe('מארז פטיפורים');
    expect(packageLabel(0, 'מארז יוקרה')).toBe('מארז יוקרה');
  });
});
