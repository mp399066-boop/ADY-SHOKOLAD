'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PricesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/import?tab=prices'); }, [router]);
  return null;
}
