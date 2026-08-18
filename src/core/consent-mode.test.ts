import { describe, it, expect, beforeEach } from 'vitest';
import { resolveConfig } from './config';
import { consentDefaultsScript, mapConsentState, pushConsentUpdate } from './consent-mode';

const config = resolveConfig({
  privacyPolicyUrl: '/c',
  purposes: [
    { id: 'analytics', title: 'A', description: 'd', cookies: [], default: false },
    { id: 'advertising', title: 'P', description: 'd', cookies: [], default: false }
  ]
});

describe('consentDefaultsScript', () => {
  it('refuse les quatre signaux et attend une mise à jour', () => {
    const s = consentDefaultsScript(config);
    for (const sig of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) {
      expect(s).toContain(`${sig}:"denied"`);
    }
    expect(s).toContain('wait_for_update:500');
  });

  it("n'accorde jamais un signal, même si une finalité est en opt-in assumé", () => {
    const optIn = resolveConfig({
      privacyPolicyUrl: '/c',
      purposes: [{
        id: 'analytics', title: 'A', description: 'd', cookies: [],
        default: true as unknown as false, unsafeDefaultOptIn: true
      }]
    });
    expect(consentDefaultsScript(optIn)).not.toContain('granted');
  });

  it('ne contient pas de balise fermante susceptible de casser le script hôte', () => {
    expect(consentDefaultsScript(config)).not.toContain('</script');
  });
});

describe('mapConsentState', () => {
  it('accorde uniquement les signaux des finalités consenties', () => {
    expect(mapConsentState(config, { analytics: true, advertising: false })).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  });

  it('accorde les trois signaux publicitaires ensemble', () => {
    const r = mapConsentState(config, { analytics: false, advertising: true });
    expect(r.ad_storage).toBe('granted');
    expect(r.ad_user_data).toBe('granted');
    expect(r.ad_personalization).toBe('granted');
    expect(r.analytics_storage).toBe('denied');
  });

  it('ignore une finalité inconnue de la table de mapping', () => {
    const r = mapConsentState(config, { inconnue: true });
    expect(Object.values(r).every((v) => v === 'denied')).toBe(true);
  });
});

describe('pushConsentUpdate', () => {
  beforeEach(() => { (window as any).dataLayer = []; });

  it('empile un consent update dans dataLayer', () => {
    pushConsentUpdate(config, { analytics: true, advertising: false });
    const dl = (window as any).dataLayer;
    expect(dl[0][0]).toBe('consent');
    expect(dl[0][1]).toBe('update');
    expect(dl[0][2].analytics_storage).toBe('granted');
  });
});
