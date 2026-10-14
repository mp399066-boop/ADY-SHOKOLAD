// wa.me links for Israeli phone numbers ("050-1234567", "+972 50 …", "972501234567").

/** International digits (972…) or null when the number can't be a phone. */
export function waNumber(phone: string | null | undefined): string | null {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length < 8 || d.length > 10) return null;
  return `972${d}`;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Fills {שם} (first name) in a message template. */
export function fillTemplate(template: string, firstName: string): string {
  return template.replace(/\{שם\}/g, firstName.trim() || '');
}
