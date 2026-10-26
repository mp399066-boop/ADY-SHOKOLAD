import { describe, expect, it } from 'vitest';
import { packageSizeFromPriceName } from '../package-prices';

describe('packageSizeFromPriceName', () => {
  it('reads the size from package price-list names', () => {
    expect(packageSizeFromPriceName('מארז 12')).toBe(12);
    expect(packageSizeFromPriceName(' מארז 25 פטיפורים ')).toBe(25);
  });

  it('ignores other products that start with מארז', () => {
    expect(packageSizeFromPriceName('מארז 4 מגנומים ו 6 כוסות מוס')).toBeNull();
    expect(packageSizeFromPriceName('מארז אישי -  4 פטיפורים')).toBeNull();
    expect(packageSizeFromPriceName('מארז 0')).toBeNull();
    expect(packageSizeFromPriceName(null)).toBeNull();
  });
});
