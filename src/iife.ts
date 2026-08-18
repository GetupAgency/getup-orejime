import { initConsent, consentDefaultsScript } from './core/index';

const api = { initConsent, consentDefaultsScript };
(window as unknown as { GetupConsent: typeof api }).GetupConsent = api;

/**
 * Lit la config publiée par l'adaptateur PHP dans
 * <script type="application/json" id="getup-consent-config"> et déclenche
 * l'initialisation. `JSON.parse` s'évalue en dehors du try/catch interne
 * d'initConsent (c'est un argument de l'appel, donc exécuté avant lui) :
 * sans ce try/catch séparé, un JSON malformé publié par l'adaptateur PHP
 * lèverait une exception non interceptée au moment de l'évaluation du
 * script, ce qui casserait la page hôte — violation directe de la
 * contrainte « ne jamais casser le site hôte » déjà appliquée par
 * `guardManager` dans core/index.ts.
 */
function initFromConfigElement(): void {
  const el = document.getElementById('getup-consent-config');
  if (!el?.textContent) return;

  try {
    const config = JSON.parse(el.textContent);
    void initConsent(config);
  } catch (error) {
    console.error('[getup-consent] Configuration JSON invalide, initialisation ignorée.', error);
  }
}

initFromConfigElement();
