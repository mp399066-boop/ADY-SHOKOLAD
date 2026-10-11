import { describe, it, expect } from 'vitest';
import {
  parseCatalogPatch, rawMaterialPatchSchema, productPatchSchema, petitFourPatchSchema,
} from '@/lib/catalog-patch-schema';

describe('parseCatalogPatch', () => {
  it('strips unknown / computed keys from a full row sent back by the client', () => {
    const r = parseCatalogPatch(rawMaterialPatchSchema, {
      id: 'x', סטטוס_מלאי: 'תקין', תאריך_יצירה: '2026-01-01', parent_raw_material_id: 'y',
      שם_חומר_גלם: 'קמח', כמות_במלאי: '12.5', יחידת_מידה: 'ק"ג',
    });
    expect(r).toEqual({ data: { שם_חומר_גלם: 'קמח', כמות_במלאי: 12.5, יחידת_מידה: 'ק"ג' } });
  });

  it('keeps a partial patch partial', () => {
    expect(parseCatalogPatch(productPatchSchema, { כמות_במלאי: 3 })).toEqual({ data: { כמות_במלאי: 3 } });
  });

  it('rejects negative or non-finite numbers', () => {
    expect(parseCatalogPatch(rawMaterialPatchSchema, { כמות_במלאי: -1 })).toHaveProperty('error');
    expect(parseCatalogPatch(productPatchSchema, { מחיר: 'abc' })).toHaveProperty('error');
  });

  it('rejects an empty name', () => {
    expect(parseCatalogPatch(petitFourPatchSchema, { שם_פטיפור: '  ' })).toHaveProperty('error');
  });

  it('turns empty optional text/uuid/date into null', () => {
    const r = parseCatalogPatch(rawMaterialPatchSchema, { ספק_מועדף_id: '', תאריך_תפוגה: '', הערות: '' });
    expect(r).toEqual({ data: { ספק_מועדף_id: null, תאריך_תפוגה: null, הערות: null } });
  });

  it('ignores null in a NOT NULL column instead of failing the save', () => {
    expect(parseCatalogPatch(productPatchSchema, { כמות_במלאי: null, פעיל: true })).toEqual({ data: { פעיל: true } });
  });

  it('rejects a body with nothing editable', () => {
    expect(parseCatalogPatch(productPatchSchema, { id: 'x' })).toHaveProperty('error');
    expect(parseCatalogPatch(productPatchSchema, null)).toHaveProperty('error');
  });
});
