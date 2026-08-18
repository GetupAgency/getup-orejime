export type ConsentSignal =
  | 'analytics_storage' | 'ad_storage' | 'ad_user_data' | 'ad_personalization';

export const CONSENT_SIGNALS: ConsentSignal[] = [
  'analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'
];

export const DEFAULT_TRACKER_PURPOSE = 'analytics';

export const DEFAULT_COOKIE_NAME = 'getup-cookies';
export const DEFAULT_COOKIE_DURATION = 365;

export const DEFAULT_PURPOSE_SIGNALS: Record<string, ConsentSignal[]> = {
  analytics: ['analytics_storage'],
  advertising: ['ad_storage', 'ad_user_data', 'ad_personalization']
};

export type Purpose = {
  id: string;
  title: string;
  description: string;
  cookies: (string | RegExp)[];
  default: false;
  unsafeDefaultOptIn?: true;
};

export type ConsentConfig = {
  privacyPolicyUrl: string;
  locale?: string;
  cookie?: { name?: string; duration?: number };
  purposes: Purpose[];
  consentMode?: { purposeSignals?: Record<string, ConsentSignal[]> };
  trackers?: {
    gtm?: { id: string; lazy?: boolean; purposeId?: string };
    smartlook?: { key: string; region?: string; purposeId?: string };
  };
  ui?: {
    badge?: boolean; exitAnimation?: boolean; fixSeoH1?: boolean;
    placement?: 'bottom-right' | 'bottom-left';
    logo?: string; bannerTitle?: string;
  };
  theme?: { preset?: string; customCss?: string };
  assetsBaseUrl?: string;
};

export type ResolvedTrackers = {
  gtm?: { id: string; lazy?: boolean; purposeId: string };
  smartlook?: { key: string; region?: string; purposeId: string };
};

export type ResolvedConfig = {
  privacyPolicyUrl: string;
  locale: string;
  cookie: { name: string; duration: number };
  purposes: (Omit<Purpose, 'default'> & { default: boolean })[];
  consentMode: { purposeSignals: Record<string, ConsentSignal[]> };
  trackers: ResolvedTrackers;
  ui: Required<Omit<NonNullable<ConsentConfig['ui']>, 'logo' | 'bannerTitle'>> &
      { logo?: string; bannerTitle?: string };
  theme: { preset: string; customCss?: string };
  assetsBaseUrl: string;
};

/**
 * Rattache chaque traceur à la finalité qui commande son chargement.
 *
 * Le défaut `analytics` était autrefois codé en dur dans trackers.ts : un site
 * nommant sa finalité autrement obtenait un module inerte — les traceurs ne
 * partaient jamais — sans le moindre diagnostic. L'échec restait fermé, donc
 * conforme, mais silencieux, et le client n'avait aucun moyen de comprendre.
 */
function resolveTrackers(
  input: ConsentConfig['trackers'],
  purposeIds: string[]
): ResolvedTrackers {
  if (!input) return {};

  const check = (name: string, purposeId: string): string => {
    if (!purposeIds.includes(purposeId)) {
      console.warn(
        `[getup-consent] Le traceur "${name}" est piloté par la finalité ` +
        `"${purposeId}", qui n'est pas déclarée dans purposes ` +
        `(${purposeIds.join(', ')}). Il ne se chargera jamais. ` +
        `Renseignez trackers.${name}.purposeId, ou donnez à votre finalité ` +
        `l'identifiant "${DEFAULT_TRACKER_PURPOSE}" — c'est la seule voie depuis ` +
        `les back-offices WordPress et PrestaShop, qui n'exposent pas ce réglage.`
      );
    }
    return purposeId;
  };

  const resolved: ResolvedTrackers = {};
  if (input.gtm) {
    resolved.gtm = {
      ...input.gtm,
      purposeId: check('gtm', input.gtm.purposeId ?? DEFAULT_TRACKER_PURPOSE)
    };
  }
  if (input.smartlook) {
    resolved.smartlook = {
      ...input.smartlook,
      purposeId: check('smartlook', input.smartlook.purposeId ?? DEFAULT_TRACKER_PURPOSE)
    };
  }
  return resolved;
}

export function resolveConfig(input: ConsentConfig): ResolvedConfig {
  if (!input.privacyPolicyUrl) {
    throw new Error('[getup-consent] privacyPolicyUrl est requis.');
  }
  if (!input.purposes || input.purposes.length === 0) {
    throw new Error('[getup-consent] purposes doit contenir au moins une finalité.');
  }

  const purposes = input.purposes.map((p) => {
    const wantsOptIn = (p as { default: boolean }).default === true;
    if (wantsOptIn && !p.unsafeDefaultOptIn) {
      console.warn(
        `[getup-consent] La finalité "${p.id}" est déclarée default: true sans ` +
        `unsafeDefaultOptIn. Valeur forcée à false : un consentement préalable est requis.`
      );
      return { ...p, default: false };
    }
    if (wantsOptIn) {
      console.warn(
        `[getup-consent] La finalité "${p.id}" est en opt-in par défaut. ` +
        `Cette configuration piste le visiteur avant son accord.`
      );
    }
    return { ...p, default: wantsOptIn };
  });

  return {
    privacyPolicyUrl: input.privacyPolicyUrl,
    locale: input.locale ?? 'fr',
    cookie: {
      name: input.cookie?.name ?? DEFAULT_COOKIE_NAME,
      duration: input.cookie?.duration ?? DEFAULT_COOKIE_DURATION
    },
    purposes,
    consentMode: {
      purposeSignals: { ...DEFAULT_PURPOSE_SIGNALS, ...input.consentMode?.purposeSignals }
    },
    trackers: resolveTrackers(input.trackers, purposes.map((p) => p.id)),
    ui: {
      badge: input.ui?.badge ?? true,
      exitAnimation: input.ui?.exitAnimation ?? true,
      fixSeoH1: input.ui?.fixSeoH1 ?? true,
      placement: input.ui?.placement ?? 'bottom-right',
      logo: input.ui?.logo,
      bannerTitle: input.ui?.bannerTitle
    },
    theme: { preset: input.theme?.preset ?? 'midnight-emerald', customCss: input.theme?.customCss },
    assetsBaseUrl: (input.assetsBaseUrl ?? '/orejime').replace(/\/$/, '')
  };
}
