import { describe, it, expect, vi } from 'vitest';
import { resolveConfig, DEFAULT_COOKIE_NAME, DEFAULT_COOKIE_DURATION } from './config';

const base = {
  privacyPolicyUrl: '/confidentialite',
  purposes: [
    { id: 'analytics', title: 'GA', description: 'd', cookies: ['_ga'], default: false as const }
  ]
};

describe('resolveConfig', () => {
  it('applique les défauts de cookie et de locale', () => {
    const c = resolveConfig(base);
    expect(c.cookie.name).toBe(DEFAULT_COOKIE_NAME);
    expect(c.cookie.duration).toBe(DEFAULT_COOKIE_DURATION);
    expect(c.locale).toBe('fr');
  });

  it('exige privacyPolicyUrl', () => {
    expect(() => resolveConfig({ ...base, privacyPolicyUrl: '' })).toThrow(/privacyPolicyUrl/);
  });

  it('exige au moins une finalité', () => {
    expect(() => resolveConfig({ ...base, purposes: [] })).toThrow(/purposes/);
  });

  it('force default à false quand unsafeDefaultGranted est absent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = resolveConfig({
      ...base,
      purposes: [{ ...base.purposes[0], default: true as unknown as false }]
    });
    expect(c.purposes[0].default).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unsafeDefaultGranted/));
    warn.mockRestore();
  });

  it('respecte un opt-in explicitement assumé, en avertissant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = resolveConfig({
      ...base,
      purposes: [{ ...base.purposes[0], default: true as unknown as false, unsafeDefaultGranted: true }]
    });
    expect(c.purposes[0].default).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/opt-in/i));
    warn.mockRestore();
  });

  it('mappe analytics et advertising vers les signaux Google par défaut', () => {
    const c = resolveConfig(base);
    expect(c.consentMode.purposeSignals.analytics).toEqual(['analytics_storage']);
    expect(c.consentMode.purposeSignals.advertising).toEqual([
      'ad_storage', 'ad_user_data', 'ad_personalization'
    ]);
  });
});

describe('finalité pilotant les traceurs', () => {
  const withTrackers = (purposes: unknown[], trackers: unknown) =>
    resolveConfig({ ...base, purposes, trackers } as never);

  it('rattache les traceurs à la finalité analytics par défaut', () => {
    const c = withTrackers(base.purposes, { gtm: { id: 'G-X' }, smartlook: { key: 'k' } });
    expect(c.trackers.gtm?.purposeId).toBe('analytics');
    expect(c.trackers.smartlook?.purposeId).toBe('analytics');
  });

  it('accepte une finalité pilotante explicite', () => {
    const c = withTrackers(
      [{ id: 'statistiques', title: 'S', description: 'd', cookies: [], default: false }],
      { gtm: { id: 'G-X', purposeId: 'statistiques' } }
    );
    expect(c.trackers.gtm?.purposeId).toBe('statistiques');
  });

  it('avertit quand la finalité pilotante n’est pas déclarée', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withTrackers(
      [{ id: 'statistiques', title: 'S', description: 'd', cookies: [], default: false }],
      { gtm: { id: 'G-X' } }
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/gtm.*"analytics".*statistiques/s)
    );
    warn.mockRestore();
  });

  it('n’avertit pas quand la finalité pilotante existe', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withTrackers(base.purposes, { gtm: { id: 'G-X' } });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('n’avertit pas quand aucun traceur n’est configuré', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig(base);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
