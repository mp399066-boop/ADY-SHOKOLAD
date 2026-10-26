import { describe, it, expect } from 'vitest';
import { quoteApprovable, quoteChangeRequestable, quoteEditable, changeRequestSchema } from '@/lib/quotes';

describe('customer change request on a quote', () => {
  it('can be asked while the quote is open, also after it expired', () => {
    expect(quoteChangeRequestable('נשלחה')).toBe(true);
    expect(quoteChangeRequestable('טיוטה')).toBe(true);
    expect(quoteChangeRequestable('בקשת שינוי')).toBe(true);
  });

  it('cannot be asked once approved, converted or rejected', () => {
    expect(quoteChangeRequestable('אושרה')).toBe(false);
    expect(quoteChangeRequestable('הומרה להזמנה')).toBe(false);
    expect(quoteChangeRequestable('נדחתה')).toBe(false);
  });

  it('waits for the owner: not approvable, but editable', () => {
    expect(quoteApprovable({ סטטוס: 'בקשת שינוי', תוקף_עד: null }, '2026-10-26')).toBe(false);
    expect(quoteEditable('בקשת שינוי')).toBe(true);
  });

  it('needs a message, and only text', () => {
    expect(changeRequestSchema.safeParse({ action: 'request_change', message: ' ' }).success).toBe(false);
    expect(changeRequestSchema.safeParse({ action: 'request_change', message: 'x'.repeat(2001) }).success).toBe(false);
    const ok = changeRequestSchema.safeParse({ action: 'request_change', message: ' להוסיף 20 טארטלטים ', price: 1 });
    expect(ok.success && ok.data.message).toBe('להוסיף 20 טארטלטים');
    expect(ok.success && 'price' in ok.data).toBe(false);
  });
});
