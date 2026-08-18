import { CONSENT_SIGNALS, type ConsentSignal, type ResolvedConfig } from './config';

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

export function pushConsentUpdate(
  config: ResolvedConfig,
  state: Record<string, boolean>
): void {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(['consent', 'update', mapConsentState(config, state)]);
}
