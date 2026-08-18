import type { ResolvedConfig } from './config';

export type OrejimeManager = {
  confirmed: boolean;
  purposes: { id: string }[];
  getConsent(id: string): boolean;
  setConsent(id: string, value: boolean): void;
  saveAndApplyConsents(): void;
  on(event: 'update', cb: () => void): void;
};

export type OrejimeGlobal = { manager: OrejimeManager };

export function toOrejimeConfig(config: ResolvedConfig): object {
  return {
    privacyPolicyUrl: config.privacyPolicyUrl,
    logo: config.ui.logo,
    translations: config.ui.bannerTitle
      ? { banner: { title: config.ui.bannerTitle } }
      : undefined,
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

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${base}/orejime-standard.css`;
  document.head.appendChild(link);

  pending = new Promise<OrejimeGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}/orejime-standard-${config.locale}.js`;
    script.async = true;
    script.addEventListener('load', () => {
      if (!w.orejime) {
        reject(new Error('[getup-consent] Script chargé mais window.orejime absent.'));
        return;
      }
      resolve(w.orejime);
    });
    script.addEventListener('error', () => {
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
