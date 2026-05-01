'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/sw-register';

export function ServiceWorkerInit() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
