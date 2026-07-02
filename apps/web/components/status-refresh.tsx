'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-fetch the (server-rendered) status page on an interval so it stays live. */
export function StatusRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
