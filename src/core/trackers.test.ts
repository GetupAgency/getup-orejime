import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveConfig } from './config';
import { attachTrackers } from './trackers';
import type { OrejimeManager } from './loader';

function fakeManager(consent: Record<string, boolean>): OrejimeManager & { fire(): void } {
  const listeners: (() => void)[] = [];
  return {
    isDirty: () => true,
    getConsent: (id) => consent[id] ?? false,
    setConsent: (id, v) => { consent[id] = v; },
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
  // attachGtm enregistre ses écouteurs d'interaction directement sur
  // `document`, qui persiste entre les tests d'un même fichier (jsdom
  // n'est pas réinitialisé entre `it()`). Un test qui accorde le
  // consentement analytics (ex. le test Smartlook « une seule fois »
  // ci-dessous) arme donc aussi les écouteurs GTM en arrière-plan ; sans
  // nettoyage, un `dispatchEvent('scroll')` dans un test *suivant* — même
  // sans consentement — déclenche ce écouteur fantôme et fait « fuiter »
  // un chargement GTM d'un test à l'autre. On piste et retire donc tous
  // les écouteurs ajoutés à `document` après chaque test.
  const originalAddEventListener = document.addEventListener.bind(document);
  const originalRemoveEventListener = document.removeEventListener.bind(document);
  let addedListeners: Parameters<typeof document.addEventListener>[];

  beforeEach(() => {
    document.head.innerHTML = '';
    vi.useFakeTimers();
    addedListeners = [];
    vi.spyOn(document, 'addEventListener').mockImplementation((...args) => {
      addedListeners.push(args as Parameters<typeof document.addEventListener>);
      return originalAddEventListener(...args);
    });
  });

  afterEach(() => {
    addedListeners.forEach(([type, listener, options]) =>
      originalRemoveEventListener(type, listener, options)
    );
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it('ne charge pas GTM sans consentement analytics (lazy: true), ni sur interaction ni après le délai', () => {
    attachTrackers(config, fakeManager({ analytics: false }));
    document.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(5000);
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
  });

  it('ne charge pas GTM sans consentement analytics (lazy: false)', () => {
    const eager = resolveConfig({
      privacyPolicyUrl: '/c',
      trackers: { gtm: { id: 'G-TEST', lazy: false } },
      purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
    });
    attachTrackers(eager, fakeManager({ analytics: false }));
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
  });

  it('diffère GTM jusquà la première interaction une fois le consentement accordé (lazy: true)', () => {
    const m = fakeManager({ analytics: false });
    attachTrackers(config, m);
    m.setConsent('analytics', true);
    m.fire();
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
    document.dispatchEvent(new Event('scroll'));
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(true);
  });

  it('charge GTM après 5 secondes sans interaction, une fois le consentement accordé (lazy: true)', () => {
    const m = fakeManager({ analytics: false });
    attachTrackers(config, m);
    m.setConsent('analytics', true);
    m.fire();
    vi.advanceTimersByTime(5000);
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(true);
  });

  it('charge GTM immédiatement dès que le consentement analytics est accordé (lazy: false)', () => {
    const eager = resolveConfig({
      privacyPolicyUrl: '/c',
      trackers: { gtm: { id: 'G-TEST', lazy: false } },
      purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
    });
    const m = fakeManager({ analytics: false });
    attachTrackers(eager, m);
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
    m.setConsent('analytics', true);
    m.fire();
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(true);
  });

  it("ne charge GTM qu'une seule fois malgré des update répétés une fois le consentement accordé", () => {
    const m = fakeManager({ analytics: true });
    attachTrackers(config, m);
    document.dispatchEvent(new Event('scroll'));
    m.fire(); m.fire(); m.fire();
    document.dispatchEvent(new Event('scroll'));
    expect(srcs().filter((s) => s.includes('googletagmanager'))).toHaveLength(1);
  });

  // Fuite de révocation GTM (trouvée en revue) : une fois arm() déclenché
  // par un octroi de consentement, `armed` reste vrai en permanence — le
  // timer de 5s et les écouteurs d'interaction restent actifs même si le
  // visiteur refuse ensuite via le badge, et load() n'a jamais revérifié le
  // consentement au moment d'injecter le script. Smartlook n'a pas cette
  // fenêtre car son check() revérifie à chaque update et charge sur le même
  // tick que l'octroi ; ce sont les chemins différés de GTM (timer,
  // écouteurs d'interaction) qui l'ouvrent.
  it('ne charge pas GTM si le consentement est révoqué avant lexpiration du délai (lazy: true)', () => {
    const m = fakeManager({ analytics: false });
    attachTrackers(config, m);
    m.setConsent('analytics', true);
    m.fire();
    m.setConsent('analytics', false);
    m.fire();
    vi.advanceTimersByTime(5000);
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
  });

  it('ne charge pas GTM si le consentement est révoqué avant une interaction (lazy: true)', () => {
    const m = fakeManager({ analytics: false });
    attachTrackers(config, m);
    m.setConsent('analytics', true);
    m.fire();
    m.setConsent('analytics', false);
    m.fire();
    document.dispatchEvent(new Event('scroll'));
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
  });

  it('charge GTM une seule fois lors dune séquence accorder → révoquer → accorder (lazy: true)', () => {
    const m = fakeManager({ analytics: false });
    attachTrackers(config, m);
    m.setConsent('analytics', true);
    m.fire();
    m.setConsent('analytics', false);
    m.fire();
    m.setConsent('analytics', true);
    m.fire();
    vi.advanceTimersByTime(5000);
    expect(srcs().filter((s) => s.includes('googletagmanager'))).toHaveLength(1);
  });

  /**
   * `gtag.js` ne dispatche `js` et `config` que sous forme d'objet
   * `arguments` : empilés en `Array`, ils sont traités comme de simples
   * événements de data layer et GA4 n'est jamais configuré. Assertion sur la
   * nature de l'entrée, pas seulement sur son contenu.
   */
  it('empile js et config sous forme dobjets arguments, jamais dArray', () => {
    (window as any).dataLayer = [];
    const eager = resolveConfig({
      privacyPolicyUrl: '/c',
      trackers: { gtm: { id: 'G-TEST', lazy: false } },
      purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
    });
    attachTrackers(eager, fakeManager({ analytics: true }));

    const dl = (window as any).dataLayer as IArguments[];
    const isArgumentsObject = (v: unknown) =>
      Object.prototype.toString.call(v) === '[object Arguments]';

    expect(dl).toHaveLength(2);
    expect(dl.every(isArgumentsObject)).toBe(true);
    expect(dl.some(Array.isArray)).toBe(false);
    expect(dl[0][0]).toBe('js');
    expect(dl[0][1]).toBeInstanceOf(Date);
    expect(dl[1][0]).toBe('config');
    expect(dl[1][1]).toBe('G-TEST');
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
