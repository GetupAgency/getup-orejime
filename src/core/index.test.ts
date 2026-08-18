import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initConsent } from './index';
import { __resetLoader } from './loader';

const config = {
  privacyPolicyUrl: '/c',
  purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false as const }]
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete (window as any).orejime;
  __resetLoader();
});

function resolveScript(manager: unknown) {
  const s = document.head.querySelector('script') as HTMLScriptElement;
  (window as any).orejime = { manager };
  s.dispatchEvent(new Event('load'));
}

const stubManager = () => ({
  confirmed: true,
  purposes: [{ id: 'analytics' }],
  getConsent: vi.fn(() => true),
  setConsent: vi.fn(),
  saveAndApplyConsents: vi.fn(),
  on: vi.fn()
});

describe('initConsent', () => {
  it('retourne une API branchée sur le manager', async () => {
    const p = initConsent(config);
    const m = stubManager();
    resolveScript(m);
    const api = await p;
    expect(api.isInert).toBe(false);
    api.acceptAll();
    expect(m.setConsent).toHaveBeenCalledWith('analytics', true);
    expect(m.saveAndApplyConsents).toHaveBeenCalled();
  });

  it('retourne une API inerte si le script échoue, sans rejeter', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = initConsent(config);
    (document.head.querySelector('script') as HTMLScriptElement)
      .dispatchEvent(new Event('error'));
    const api = await p;
    expect(api.isInert).toBe(true);
    expect(api.getConsent('analytics')).toBe(false);
    expect(() => api.acceptAll()).not.toThrow();
    err.mockRestore();
  });

  it('retourne une API inerte si la config est invalide, sans rejeter', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = await initConsent({ ...config, privacyPolicyUrl: '' });
    expect(api.isInert).toBe(true);
    err.mockRestore();
  });

  it('est sans effet côté serveur', async () => {
    const doc = globalThis.document;
    // @ts-expect-error simulation SSR
    delete globalThis.document;
    const api = await initConsent(config);
    expect(api.isInert).toBe(true);
    globalThis.document = doc;
  });

  it('inerte signifie : aucun consentement accordé', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = initConsent(config);
    (document.head.querySelector('script') as HTMLScriptElement)
      .dispatchEvent(new Event('error'));
    const api = await p;
    expect(api.getConsent('analytics')).toBe(false);
    err.mockRestore();
  });

  it("protège l'écouteur update interne : un throw pendant le dispatch ne s'échappe pas et le module reste fonctionnel", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = initConsent(config);

    // Le premier appel (au montage, dans le sync() immédiat) réussit ;
    // les appels suivants (déclenchés par l'événement 'update') lèvent,
    // pour simuler un manager qui casse pendant le dispatch — hors du
    // try/catch d'initConsent.
    const getConsent = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockImplementation(() => { throw new Error('boom'); });

    const m = {
      confirmed: true,
      purposes: [{ id: 'analytics' }],
      getConsent,
      setConsent: vi.fn(),
      saveAndApplyConsents: vi.fn(),
      on: vi.fn()
    };
    resolveScript(m);
    const api = await p;

    // initConsent a enregistré son sync interne via manager.on('update', ...).
    // On récupère le callback effectivement passé au manager brut : s'il est
    // bien protégé par guardManager, ce n'est pas `sync` directement mais un
    // wrapper try/catch autour de lui.
    expect(m.on).toHaveBeenCalledWith('update', expect.any(Function));
    const registeredCallback = m.on.mock.calls[0][1] as () => void;

    // Déclencher l'événement fait planter getConsent à l'intérieur de sync(),
    // en dehors du try/catch d'initConsent. Le wrapper doit avaler l'erreur.
    expect(() => registeredCallback()).not.toThrow();
    expect(err).toHaveBeenCalled();

    // Le reste du module (l'API publique) reste utilisable après le throw.
    expect(() => api.acceptAll()).not.toThrow();
    expect(m.setConsent).toHaveBeenCalledWith('analytics', true);
    expect(m.saveAndApplyConsents).toHaveBeenCalled();

    err.mockRestore();
  });
});
