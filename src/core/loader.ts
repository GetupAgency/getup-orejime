import type { ResolvedConfig } from './config';

/**
 * Forme réelle du manager exposé par `window.orejime.manager` (orejime
 * 3.2.1, `class eV extends eq` dans le bundle minifié). Vérifiée
 * empiriquement dans un vrai navigateur (Tâche 11, e2e/consent.spec.ts) :
 * il n'existe ni `confirmed`, ni `purposes`, ni `saveAndApplyConsents` sur
 * cet objet — seulement `getConsent`, `setConsent`/`setConsents`,
 * `isDirty`, `needsUpdate`, `acceptAll`, `declineAll`, `getAllConsents`,
 * `on`/`off`/`emit`. `setConsent` persiste et applique déjà les
 * conséquences (cookies, événement `update`) en interne — il n'y a pas
 * d'étape de sauvegarde séparée à appeler. La liste des finalités ne vient
 * pas non plus du manager : elle vient de `ResolvedConfig.purposes`
 * (Tâche 1), déjà disponible partout où `OrejimeManager` est utilisé.
 * `isDirty()` retourne `true` tant qu'il reste des finalités non
 * explicitement décidées ; l'absence de décision équivaut à « pas encore
 * confirmé ».
 */
export type OrejimeManager = {
  getConsent(id: string): boolean;
  setConsent(id: string, value: boolean): void;
  isDirty(): boolean;
  on(event: 'update', cb: () => void): void;
};

export type OrejimeGlobal = { manager: OrejimeManager };

export function toOrejimeConfig(config: ResolvedConfig): object {
  return {
    privacyPolicyUrl: config.privacyPolicyUrl,
    logo: config.ui.logo,
    // Orejime deep-merges cette config avec ses traductions par défaut
    // (Object.keys(source).forEach(...)) : une clé `translations` présente
    // avec la valeur `undefined` est tout de même itérée et écrase donc
    // entièrement l'objet par défaut (title/description/accept/decline...),
    // ce qui fait planter le rendu de la bannière (`Cannot read properties
    // of undefined (reading 'banner')`) dès qu'aucun `bannerTitle` n'est
    // fourni. Omettre la clé plutôt que la mettre à `undefined` laisse le
    // merge intact. Trouvé via le test E2E de la Tâche 11 (aucun mock, vrai
    // bundle Orejime) : les tests unitaires de la Tâche 3 ne couvraient que
    // le cas `bannerTitle` défini.
    ...(config.ui.bannerTitle ? { translations: { banner: { title: config.ui.bannerTitle } } } : {}),
    cookie: { name: config.cookie.name, duration: config.cookie.duration },
    purposes: config.purposes.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      cookies: p.cookies,
      default: p.default
    }))
  };
}

let pending: Promise<OrejimeGlobal> | null = null;

export function loadOrejime(config: ResolvedConfig): Promise<OrejimeGlobal> {
  if (pending) return pending;

  const base = config.assetsBaseUrl;
  const w = window as unknown as { orejime?: OrejimeGlobal; orejimeConfig?: object };

  w.orejimeConfig = toOrejimeConfig(config);

  // Inject stylesheet only if not already present
  const stylesheetHref = `${base}/orejime-standard.css`;
  const isStylesheetPresent = [...document.head.querySelectorAll('link')].some(
    (link) => link.getAttribute('href') === stylesheetHref
  );
  if (!isStylesheetPresent) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheetHref;
    document.head.appendChild(link);
  }

  pending = new Promise<OrejimeGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}/orejime-standard-${config.locale}.js`;
    script.async = true;
    script.addEventListener('load', () => {
      if (!w.orejime) {
        pending = null;
        reject(new Error('[getup-consent] Script chargé mais window.orejime absent.'));
        return;
      }
      resolve(w.orejime);
    });
    script.addEventListener('error', () => {
      pending = null;
      reject(new Error('[getup-consent] Échec de chargement du script Orejime.'));
    });
    document.head.appendChild(script);
  });

  return pending;
}

/** Réservé aux tests : remet à zéro la garde de chargement unique. */
export function __resetLoader(): void {
  pending = null;
}
