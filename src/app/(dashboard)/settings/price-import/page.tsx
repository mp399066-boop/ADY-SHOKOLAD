'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PriceImportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/import?tab=price'); }, [router]);
  return null;
}
