import { initConsent, consentDefaultsScript } from './core/index';

const api = { initConsent, consentDefaultsScript };
(window as unknown as { GetupConsent: typeof api }).GetupConsent = api;

const el = document.getElementById('getup-consent-config');
if (el?.textContent) {
  void initConsent(JSON.parse(el.textContent));
}
