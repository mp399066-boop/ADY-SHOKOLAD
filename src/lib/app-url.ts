// Public base URL of the CRM, for links that leave the app (emails, signed
// action links). Server-only: reads env at call time.
//
// Order: explicit APP_URL → Vercel's stable production domain → the
// per-deployment Vercel URL → the known production domain.
// NEXT_PUBLIC_BASE_URL is intentionally NOT read — it points at a dead domain.

const PRODUCTION_URL = 'https://ady-shokolad-crm.vercel.app';

function withProtocol(host: string): string {
  return /^https?:\/\//i.test(host) ? host : `https://${host}`;
}

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return withProtocol(explicit).replace(/\/+$/, '');

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return withProtocol(prod).replace(/\/+$/, '');

  const vercel = process.env.VERCEL_URL;
  if (vercel) return withProtocol(vercel).replace(/\/+$/, '');

  return PRODUCTION_URL;
}
