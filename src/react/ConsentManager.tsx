'use client';

import { useEffect, useRef } from 'react';
import { initConsent } from '../core/index';
import type { ConsentConfig } from '../core/config';

export function ConsentManager({ config }: { config: ConsentConfig }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void initConsent(config);
  }, [config]);

  return null;
}
