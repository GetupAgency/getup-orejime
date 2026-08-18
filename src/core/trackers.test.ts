import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveConfig } from './config';
import { attachTrackers } from './trackers';
import type { OrejimeManager } from './loader';

function fakeManager(consent: Record<string, boolean>): OrejimeManager & { fire(): void } {
  const listeners: (() => void)[] = [];
  return {
    confirmed: false,
    purposes: Object.keys(consent).map((id) => ({ id })),
    getConsent: (id) => consent[id] ?? false,
    setConsent: (id, v) => { consent[id] = v; },
    saveAndApplyConsents: () => {},
    on: (_e, cb) => { listeners.push(cb); },
    fire: () => listeners.forEach((l) => l())
  };
}

const config = resolveConfig({
  privacyPolicyUrl: '/c',
  trackers: { gtm: { id: 'G-TEST', lazy: true }, smartlook: { key: 'abc', region: 'eu' } },
  purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
});

const srcs = () => [...document.head.querySelectorAll('script')].map((s) => s.src);

describe('attachTrackers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    vi.useFakeTimers();
  });

  it('ne charge pas Smartlook sans consentement analytics', () => {
    attachTrackers(config, fakeManager({ analytics: false }));
    expect(srcs().some((s) => s.includes('smartlook'))).toBe(false);
  });

  it('charge Smartlook dès que le consentement analytics est accordé', () => {
    const m = fakeManager({ analytics: false });
    attachTrackers(config, m);
    m.setConsent('analytics', true);
    m.fire();
    expect(srcs().some((s) => s.includes('smartlook'))).toBe(true);
  });

  it("ne charge Smartlook qu'une seule fois malgré des update répétés", () => {
    const m = fakeManager({ analytics: true });
    attachTrackers(config, m);
    m.fire(); m.fire(); m.fire();
    expect(srcs().filter((s) => s.includes('smartlook'))).toHaveLength(1);
  });

  it('diffère GTM jusquà la première interaction', () => {
    attachTrackers(config, fakeManager({ analytics: false }));
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
    document.dispatchEvent(new Event('scroll'));
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(true);
  });

  it('charge GTM après 5 secondes sans interaction', () => {
    attachTrackers(config, fakeManager({ analytics: false }));
    vi.advanceTimersByTime(5000);
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(true);
  });

  it('ne charge rien si aucun tracker nest configuré', () => {
    const bare = resolveConfig({
      privacyPolicyUrl: '/c',
      purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
    });
    attachTrackers(bare, fakeManager({ analytics: true }));
    expect(srcs()).toHaveLength(0);
  });
});
