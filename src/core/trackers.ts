import type { ResolvedConfig } from './config';
import type { OrejimeManager } from './loader';

const INTERACTIONS = ['scroll', 'click', 'touchstart', 'keydown'] as const;

function injectScript(src: string): void {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  document.head.appendChild(s);
}

function attachGtm(id: string, lazy: boolean): void {
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${id}`);
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push(['js', new Date()]);
    w.dataLayer.push(['config', id]);
    INTERACTIONS.forEach((e) => document.removeEventListener(e, load, true));
  };

  if (!lazy) { load(); return; }
  INTERACTIONS.forEach((e) =>
    document.addEventListener(e, load, { capture: true, passive: true })
  );
  setTimeout(load, 5000);
}

function attachSmartlook(key: string, region: string, manager: OrejimeManager): void {
  let loaded = false;
  const check = () => {
    if (loaded || !manager.getConsent('analytics')) return;
    loaded = true;
    injectScript('https://web-sdk.smartlook.com/recorder.js');
    const w = window as unknown as { smartlook?: { api: unknown[] } & ((...a: unknown[]) => void) };
    const api: unknown[] = [];
    const fn = ((...args: unknown[]) => { api.push(args); }) as typeof w.smartlook;
    (fn as { api: unknown[] }).api = api;
    w.smartlook = fn;
    fn!('init', key, { region });
  };
  check();
  manager.on('update', check);
}

export function attachTrackers(config: ResolvedConfig, manager: OrejimeManager): void {
  const { gtm, smartlook } = config.trackers;
  if (gtm) attachGtm(gtm.id, gtm.lazy ?? true);
  if (smartlook) attachSmartlook(smartlook.key, smartlook.region ?? 'eu', manager);
}
