import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveConfig } from './config';
import { mountBadge } from './badge';
import type { OrejimeManager } from './loader';

function fakeManager(confirmed = false) {
  const consent: Record<string, boolean> = { analytics: false, advertising: false };
  return {
    // Le vrai manager Orejime n'a pas de champ `confirmed` : `isDirty()`
    // reste `true` tant que rien n'a été décidé.
    isDirty: () => !confirmed,
    getConsent: (id: string) => consent[id],
    setConsent: vi.fn((id: string, v: boolean) => { consent[id] = v; }),
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

  it('applique la variante de placement à gauche', () => {
    const left = resolveConfig({
      privacyPolicyUrl: '/c',
      ui: { placement: 'bottom-left' },
      purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
    });
    mountBadge(left, fakeManager());
    expect(badge()!.classList.contains('getup-rgpd-badge--left')).toBe(true);
  });

  it('ne pose pas la variante gauche avec le placement par défaut', () => {
    mountBadge(config, fakeManager());
    expect(badge()!.classList.contains('getup-rgpd-badge--left')).toBe(false);
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
  });

  it('refuse toutes les finalités en un clic', () => {
    const m = fakeManager();
    mountBadge(config, m);
    btn('decline').click();
    expect(m.setConsent).toHaveBeenCalledWith('analytics', false);
    expect(m.setConsent).toHaveBeenCalledWith('advertising', false);
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

  it('retire le listener scroll après avoir cliqué accept', async () => {
    vi.useFakeTimers();
    try {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const m = fakeManager();
      mountBadge(config, m);
      btn('accept').click();
      await vi.runAllTimersAsync();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retire le listener scroll après avoir cliqué decline', async () => {
    vi.useFakeTimers();
    try {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const m = fakeManager();
      mountBadge(config, m);
      btn('decline').click();
      await vi.runAllTimersAsync();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retire le listener scroll après avoir cliqué plus', async () => {
    vi.useFakeTimers();
    try {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const m = fakeManager();
      mountBadge(config, m);
      btn('more').click();
      await vi.runAllTimersAsync();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('destroy est idempotent', () => {
    const h = mountBadge(config, fakeManager());
    h.destroy();
    expect(() => h.destroy()).not.toThrow();
  });
});
