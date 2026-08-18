import { resolveConfig, type ConsentConfig } from './config';
import { consentDefaultsScript, pushConsentUpdate } from './consent-mode';
import { loadOrejime, type OrejimeManager } from './loader';
import { attachTrackers } from './trackers';
import { mountBadge } from './badge';
import { fixBannerHeading, attachExitAnimations } from './a11y';

/**
 * Posée sur <html> quand `ui.badge` est vrai. Le thème s'en sert pour masquer
 * la bannière Orejime, que le badge remplace : voir l'en-tête de
 * src/theme/tokens.css. Sans mode badge, la bannière est la seule interface
 * de consentement et ne doit jamais être masquée.
 */
const BADGE_MODE_CLASS = 'getup-consent--badge-mode';

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

function readState(manager: OrejimeManager, purposeIds: string[]): Record<string, boolean> {
  return Object.fromEntries(purposeIds.map((id) => [id, manager.getConsent(id)]));
}

/**
 * Enveloppe le manager Orejime pour qu'aucun appel déclenché depuis
 * l'extérieur du try/catch d'initConsent ne puisse lever vers le site hôte.
 * Trois chemins sont concernés, tous armés par le module lui-même :
 *
 *  - `on` : les écouteurs sont invoqués par Orejime au moment de l'émission ;
 *  - `setConsent` : appelé depuis les gestionnaires de clic du badge
 *    (badge.ts, « OK pour moi » / « Tout refuser ») et depuis l'API publique ;
 *  - `getConsent` : appelé depuis le load() différé de GTM (trackers.ts —
 *    setTimeout de 5 s et écouteurs d'interaction sur `document`).
 *
 * Un cookie corrompu ou un storage bloqué y ferait lever Orejime, et l'erreur
 * remonterait en exception non interceptée sur la page du client — violation
 * directe de « un module de consentement ne doit jamais casser le site hôte »
 * (docs/design.md §6).
 *
 * `getConsent` renvoie `false` en cas d'échec : c'est aussi la réponse
 * fail-closed exigée par la spec — en cas de doute, aucun tracker ne démarre.
 *
 * `isDirty` est exposé via un accesseur (et non copié) pour ne jamais
 * figer un instantané au moment de l'enveloppement — le badge, par
 * exemple, l'appelle pour décider de se monter ou non. Il n'est appelé que
 * depuis l'intérieur du try/catch d'initConsent, d'où l'absence de garde.
 */
function guardManager(manager: OrejimeManager): OrejimeManager {
  return {
    getConsent: (id) => {
      try {
        return manager.getConsent(id);
      } catch (error) {
        console.error(
          '[getup-consent] Lecture du consentement impossible, refus par défaut.',
          error
        );
        return false;
      }
    },
    setConsent: (id, v) => {
      try {
        manager.setConsent(id, v);
      } catch (error) {
        console.error('[getup-consent] Enregistrement du consentement impossible.', error);
      }
    },
    isDirty: () => manager.isDirty(),
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

    // Avant le chargement d'Orejime, donc avant que la bannière ne soit
    // rendue : en mode badge elle ne doit jamais être peinte, même un instant.
    document.documentElement.classList.toggle(BADGE_MODE_CLASS, config.ui.badge);

    const { manager: rawManager } = await loadOrejime(config);
    const manager = guardManager(rawManager);

    const purposeIds = config.purposes.map((p) => p.id);
    const sync = () => pushConsentUpdate(config, readState(manager, purposeIds));
    sync();
    manager.on('update', sync);

    attachTrackers(config, manager);
    // Variante de placement de la bannière : les classes du thème
    // (`.orejime-Banner--bottom-left` / `--bottom-right`) existaient sans que
    // rien ne les pose. Le badge reçoit la sienne dans mountBadge.
    document
      .querySelector('.orejime-Banner')
      ?.classList.add(`orejime-Banner--${config.ui.placement}`);
    if (config.ui.fixSeoH1) fixBannerHeading();
    if (config.ui.exitAnimation) attachExitAnimations();
    if (config.ui.badge) mountBadge(config, manager);

    // `manager.setConsent` persiste et applique déjà les conséquences
    // (cookies purgés, événement `update` émis) en interne — voir le
    // commentaire sur `OrejimeManager` dans loader.ts. Aucune étape de
    // sauvegarde séparée n'existe sur le vrai manager Orejime.
    const setAll = (value: boolean) => {
      purposeIds.forEach((id) => manager.setConsent(id, value));
    };

    return {
      isInert: false,
      getConsent: (id) => manager.getConsent(id),
      setConsent: (id, v) => manager.setConsent(id, v),
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
