import { resolveConfig, type ConsentConfig } from './config';
import { consentDefaultsScript, pushConsentUpdate } from './consent-mode';
import { loadOrejime, type OrejimeManager } from './loader';
import { attachTrackers } from './trackers';
import { mountBadge } from './badge';
import { fixBannerHeading, attachExitAnimations } from './a11y';

export type ConsentApi = {
  isInert: boolean;
  getConsent(purposeId: string): boolean;
  setConsent(purposeId: string, value: boolean): void;
  acceptAll(): void;
  declineAll(): void;
  openBanner(): void;
};

const INERT: ConsentApi = {
  isInert: true,
  getConsent: () => false,
  setConsent: () => {},
  acceptAll: () => {},
  declineAll: () => {},
  openBanner: () => {}
};

function readState(manager: OrejimeManager): Record<string, boolean> {
  return Object.fromEntries(manager.purposes.map((p) => [p.id, manager.getConsent(p.id)]));
}

/**
 * Enveloppe le manager Orejime pour que les écouteurs enregistrés via `on`
 * ne puissent jamais lever d'exception vers le code qui déclenche
 * l'événement (Orejime lui-même). Ces callbacks s'exécutent en dehors du
 * try/catch d'initConsent : sans cette garde, une erreur y échapperait vers
 * le site hôte, ce qui viole la contrainte « ne jamais casser le site
 * hôte ».
 *
 * `confirmed` et `purposes` sont exposés via des accesseurs (et non copiés)
 * pour ne jamais figer un instantané au moment de l'enveloppement — le
 * badge, par exemple, lit `confirmed` pour décider de se monter ou non.
 */
function guardManager(manager: OrejimeManager): OrejimeManager {
  return {
    get confirmed() {
      return manager.confirmed;
    },
    get purposes() {
      return manager.purposes;
    },
    getConsent: (id) => manager.getConsent(id),
    setConsent: (id, v) => manager.setConsent(id, v),
    saveAndApplyConsents: () => manager.saveAndApplyConsents(),
    on: (event, cb) =>
      manager.on(event, () => {
        try {
          cb();
        } catch (error) {
          console.error('[getup-consent] Erreur dans un écouteur de consentement.', error);
        }
      })
  };
}

export async function initConsent(input: ConsentConfig): Promise<ConsentApi> {
  if (typeof document === 'undefined') return INERT;

  try {
    const config = resolveConfig(input);
    const { manager: rawManager } = await loadOrejime(config);
    const manager = guardManager(rawManager);

    const sync = () => pushConsentUpdate(config, readState(manager));
    sync();
    manager.on('update', sync);

    attachTrackers(config, manager);
    if (config.ui.fixSeoH1) fixBannerHeading();
    if (config.ui.exitAnimation) attachExitAnimations();
    if (config.ui.badge) mountBadge(config, manager);

    const setAll = (value: boolean) => {
      manager.purposes.forEach((p) => manager.setConsent(p.id, value));
      manager.saveAndApplyConsents();
    };

    return {
      isInert: false,
      getConsent: (id) => manager.getConsent(id),
      setConsent: (id, v) => {
        manager.setConsent(id, v);
        manager.saveAndApplyConsents();
      },
      acceptAll: () => setAll(true),
      declineAll: () => setAll(false),
      openBanner: () => {
        document.querySelector('.orejime-Banner')?.classList.add('orejime-Banner--show');
      }
    };
  } catch (error) {
    console.error('[getup-consent] Initialisation impossible, mode inerte.', error);
    return INERT;
  }
}

export { consentDefaultsScript, resolveConfig };
export type { ConsentConfig, Purpose, ConsentSignal, ResolvedConfig } from './config';
