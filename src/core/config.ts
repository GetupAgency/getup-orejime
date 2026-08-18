export type ConsentSignal =
  | 'analytics_storage' | 'ad_storage' | 'ad_user_data' | 'ad_personalization';

export const CONSENT_SIGNALS: ConsentSignal[] = [
  'analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'
];

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
    gtm?: { id: string; lazy?: boolean };
    smartlook?: { key: string; region?: string };
  };
  ui?: {
    badge?: boolean; exitAnimation?: boolean; fixSeoH1?: boolean;
    placement?: 'bottom-right' | 'bottom-left';
    logo?: string; bannerTitle?: string;
  };
  theme?: { preset?: string; customCss?: string };
  assetsBaseUrl?: string;
};

export type ResolvedConfig = {
  privacyPolicyUrl: string;
  locale: string;
  cookie: { name: string; duration: number };
  purposes: (Omit<Purpose, 'default'> & { default: boolean })[];
  consentMode: { purposeSignals: Record<string, ConsentSignal[]> };
  trackers: NonNullable<ConsentConfig['trackers']>;
  ui: Required<Omit<NonNullable<ConsentConfig['ui']>, 'logo' | 'bannerTitle'>> &
      { logo?: string; bannerTitle?: string };
  theme: { preset: string; customCss?: string };
  assetsBaseUrl: string;
};

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
    trackers: input.trackers ?? {},
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
