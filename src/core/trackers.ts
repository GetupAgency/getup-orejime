import type { ResolvedConfig } from './config';
import type { OrejimeManager } from './loader';

const INTERACTIONS = ['scroll', 'click', 'touchstart', 'keydown'] as const;

function injectScript(src: string): void {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  document.head.appendChild(s);
}

/**
 * GTM est conditionné au consentement analytics, comme Smartlook.
 *
 * Décision du 2026-08-18 (voir task-11-report.md) : le design initial (Tâche
 * 4) chargeait `gtag.js` inconditionnellement — immédiatement si `lazy:
 * false`, sinon sur première interaction ou après 5s sans interaction —
 * en s'appuyant sur Consent Mode v2 pour restreindre ce que la balise
 * pouvait faire une fois chargée. Ce chargement transmet déjà l'IP du
 * visiteur à Google avant tout consentement ; le test prioritaire §9 de la
 * spec est sans ambiguïté (aucune requête vers googletagmanager.com avant
 * consentement explicite) et prime sur cette lecture de la recommandation
 * Google.
 *
 * `lazy` gouverne désormais uniquement le *moment* du chargement une fois
 * le consentement déjà acquis : immédiat si `lazy: false`, sur première
 * interaction ou après 5s sinon. Il n'y a pas d'échappatoire de
 * configuration pour revenir à l'ancien comportement (YAGNI — la spec ne
 * l'a jamais demandé, et une porte de sortie ici inviterait exactement la
 * régression silencieuse que ce projet existe pour empêcher).
 */
function attachGtm(id: string, lazy: boolean, manager: OrejimeManager): void {
  let loaded = false;
  let armed = false;

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

  const arm = () => {
    if (armed || loaded || !manager.getConsent('analytics')) return;
    armed = true;
    if (!lazy) { load(); return; }
    INTERACTIONS.forEach((e) =>
      document.addEventListener(e, load, { capture: true, passive: true })
    );
    setTimeout(load, 5000);
  };

  arm();
  manager.on('update', arm);
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
  if (gtm) attachGtm(gtm.id, gtm.lazy ?? true, manager);
  if (smartlook) attachSmartlook(smartlook.key, smartlook.region ?? 'eu', manager);
}
