import { CONSENT_SIGNALS, type ConsentSignal, type ResolvedConfig } from './config';
import { gtag } from './gtag';

type SignalState = Record<ConsentSignal, 'granted' | 'denied'>;

function allDenied(): SignalState {
  return CONSENT_SIGNALS.reduce((acc, s) => { acc[s] = 'denied'; return acc; }, {} as SignalState);
}

export function mapConsentState(
  config: ResolvedConfig,
  state: Record<string, boolean>
): SignalState {
  const result = allDenied();
  if (!state || typeof state !== 'object') return result;
  for (const [purposeId, granted] of Object.entries(state)) {
    if (!granted) continue;
    for (const signal of config.consentMode.purposeSignals[purposeId] ?? []) {
      result[signal] = 'granted';
    }
  }
  return result;
}

export function consentDefaultsScript(_config: ResolvedConfig): string {
  const denied = CONSENT_SIGNALS.map((s) => `${s}:"denied"`).join(',');
  return (
    'window.dataLayer=window.dataLayer||[];' +
    'function gtag(){dataLayer.push(arguments);}' +
    `gtag("consent","default",{${denied},wait_for_update:500});`
  );
}

/**
 * Phase 2 — pousse l'état de consentement courant vers Consent Mode.
 *
 * Passe par le helper `gtag()` (objet `arguments`) et non par un
 * `dataLayer.push([...])` : un `Array` n'est jamais dispatché comme commande
 * par `gtag.js`, l'`update` n'atteindrait donc jamais Google. Voir
 * src/core/gtag.ts.
 */
export function pushConsentUpdate(
  config: ResolvedConfig,
  state: Record<string, boolean>
): void {
  gtag('consent', 'update', mapConsentState(config, state));
}
