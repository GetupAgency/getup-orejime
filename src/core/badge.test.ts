import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveConfig } from './config';
import { mountBadge } from './badge';
import type { OrejimeManager } from './loader';

function fakeManager(confirmed = false) {
  const consent: Record<string, boolean> = { analytics: false, advertising: false };
  return {
    confirmed,
    purposes: [{ id: 'analytics' }, { id: 'advertising' }],
    getConsent: (id: string) => consent[id],
    setConsent: vi.fn((id: string, v: boolean) => { consent[id] = v; }),
    saveAndApplyConsents: vi.fn(),
    on: vi.fn(),
    consent
  } as unknown as OrejimeManager & { consent: Record<string, boolean> };
}

const config = resolveConfig({
  privacyPolicyUrl: '/c',
  purposes: [
    { id: 'analytics', title: 'A', description: 'd', cookies: [], default: false },
    { id: 'advertising', title: 'P', description: 'd', cookies: [], default: false }
  ]
});

const badge = () => document.querySelector('.getup-rgpd-badge');
const btn = (mod: string) => document.querySelector(`.getup-rgpd-btn--${mod}`) as HTMLButtonElement;

describe('mountBadge', () => {
  beforeEach(() => { document.body.innerHTML = '<div class="orejime-Banner"></div>'; });

  it('monte le badge quand le consentement nest pas confirmé', () => {
    mountBadge(config, fakeManager(false));
    expect(badge()).not.toBeNull();
  });

  it('ne monte rien si le consentement est déjà confirmé', () => {
    mountBadge(config, fakeManager(true));
    expect(badge()).toBeNull();
  });

  it('expose accepter ET refuser au même niveau', () => {
    mountBadge(config, fakeManager());
    expect(btn('accept')).not.toBeNull();
    expect(btn('decline')).not.toBeNull();
    expect(btn('accept').parentElement).toBe(btn('decline').parentElement);
  });

  it('accepte toutes les finalités en un clic', () => {
    const m = fakeManager();
    mountBadge(config, m);
    btn('accept').click();
    expect(m.setConsent).toHaveBeenCalledWith('analytics', true);
    expect(m.setConsent).toHaveBeenCalledWith('advertising', true);
    expect(m.saveAndApplyConsents).toHaveBeenCalled();
  });

  it('refuse toutes les finalités en un clic', () => {
    const m = fakeManager();
    mountBadge(config, m);
    btn('decline').click();
    expect(m.setConsent).toHaveBeenCalledWith('analytics', false);
    expect(m.setConsent).toHaveBeenCalledWith('advertising', false);
    expect(m.saveAndApplyConsents).toHaveBeenCalled();
  });

  it('ouvre la bannière complète depuis « En savoir plus »', () => {
    mountBadge(config, fakeManager());
    btn('more').click();
    expect(document.querySelector('.orejime-Banner')!.classList.contains('orejime-Banner--show')).toBe(true);
  });

  it('nutilise jamais innerHTML pour construire son DOM', () => {
    const m = fakeManager();
    mountBadge(config, m);
    expect(badge()!.querySelector('script')).toBeNull();
    expect(btn('accept').textContent).toBe('OK pour moi');
  });

  it('retire le badge sur destroy', () => {
    const h = mountBadge(config, fakeManager());
    h.destroy();
    expect(badge()).toBeNull();
  });
});
