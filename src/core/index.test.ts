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

/**
 * Capture les erreurs non interceptées de la page (celles qu'un throw dans
 * un gestionnaire d'événement produit : elles ne remontent pas à l'appelant,
 * elles atterrissent sur `window.onerror`). `preventDefault` évite qu'elles
 * soient reportées par jsdom pendant que le test les inspecte.
 */
function captureUncaught(): { stop(): unknown[] } {
  const errors: unknown[] = [];
  const onError = (e: ErrorEvent) => {
    e.preventDefault();
    errors.push(e.error ?? e.message);
  };
  window.addEventListener('error', onError);
  return {
    stop() {
      window.removeEventListener('error', onError);
      return errors;
    }
  };
}

const stubManager = () => ({
  isDirty: vi.fn(() => false),
  getConsent: vi.fn(() => true),
  setConsent: vi.fn(),
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

  /**
   * Le thème ne masque la bannière Orejime que sous
   * `.getup-consent--badge-mode`. Si initConsent ne posait pas cette classe,
   * le badge et la bannière s'afficheraient tous les deux ; s'il la posait
   * hors mode badge, plus aucune interface ne serait atteignable (la
   * régression critique : Orejime n'émet jamais `orejime-Banner--show`).
   */
  it('marque le mode badge sur <html> quand ui.badge est vrai', async () => {
    const p = initConsent({ ...config, ui: { badge: true } });
    // Posée avant même la résolution du script : la bannière ne doit jamais
    // être peinte en mode badge.
    expect(document.documentElement.classList.contains('getup-consent--badge-mode')).toBe(true);
    resolveScript(stubManager());
    await p;
    expect(document.documentElement.classList.contains('getup-consent--badge-mode')).toBe(true);
  });

  it('ne marque pas le mode badge quand ui.badge est faux', async () => {
    document.documentElement.classList.add('getup-consent--badge-mode');
    const p = initConsent({ ...config, ui: { badge: false } });
    resolveScript(stubManager());
    await p;
    expect(document.documentElement.classList.contains('getup-consent--badge-mode')).toBe(false);
  });

  /**
   * `on` n'est pas le seul chemin qui sort du try/catch d'initConsent. Deux
   * callbacks enregistrés par le module atteignent le manager brut depuis
   * l'extérieur :
   *   - badge.ts : le clic sur « OK pour moi » / « Tout refuser » appelle
   *     manager.setConsent depuis un gestionnaire de clic ;
   *   - trackers.ts : le load() différé de GTM (setTimeout 5s et écouteurs
   *     d'interaction) appelle manager.getConsent.
   * Un throw d'Orejime (cookie corrompu, storage bloqué) y remonterait en
   * erreur non interceptée sur la page du client — violation de « ne jamais
   * casser le site hôte » (docs/design.md §6).
   */
  it('getConsent renvoie false sans propager quand le manager lève', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = initConsent(config);
    const m = {
      isDirty: vi.fn(() => false),
      // Le premier appel (sync() au montage) réussit, les suivants lèvent.
      getConsent: vi.fn().mockReturnValueOnce(true).mockImplementation(() => {
        throw new Error('cookie corrompu');
      }),
      setConsent: vi.fn(),
      on: vi.fn()
    };
    resolveScript(m);
    const api = await p;

    expect(api.isInert).toBe(false);
    expect(() => api.getConsent('analytics')).not.toThrow();
    // Fail-closed : en cas de doute, aucun consentement accordé.
    expect(api.getConsent('analytics')).toBe(false);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('setConsent ne propage pas quand le manager lève', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = initConsent(config);
    const m = {
      isDirty: vi.fn(() => false),
      getConsent: vi.fn(() => false),
      setConsent: vi.fn(() => { throw new Error('storage bloqué'); }),
      on: vi.fn()
    };
    resolveScript(m);
    const api = await p;

    expect(() => api.setConsent('analytics', true)).not.toThrow();
    expect(() => api.acceptAll()).not.toThrow();
    expect(() => api.declineAll()).not.toThrow();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("le clic accepter du badge ne propage pas l'erreur du manager (chemin badge.ts)", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = initConsent({ ...config, ui: { badge: true } });
    const m = {
      isDirty: vi.fn(() => true),
      getConsent: vi.fn(() => false),
      setConsent: vi.fn(() => { throw new Error('storage bloqué'); }),
      on: vi.fn()
    };
    resolveScript(m);
    await p;

    const accept = document.querySelector('.getup-rgpd-btn--accept') as HTMLButtonElement;
    expect(accept).not.toBeNull();
    // Un throw dans un gestionnaire de clic ne remonte pas à l'appelant de
    // click() : il devient une erreur *non interceptée* sur la page hôte. On
    // l'observe donc via l'événement `error` de window, pas via toThrow().
    const uncaught = captureUncaught();
    accept.click();
    expect(uncaught.stop()).toEqual([]);
    err.mockRestore();
  });

  it("le load() différé de GTM ne propage pas l'erreur du manager (chemin trackers.ts)", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const p = initConsent({
      ...config,
      ui: { badge: false },
      trackers: { gtm: { id: 'G-TEST', lazy: true } }
    });
    const m = {
      isDirty: vi.fn(() => false),
      getConsent: vi.fn(() => {
        calls += 1;
        // Les deux premiers appels (sync() puis arm()) réussissent : les
        // écouteurs d'interaction et le timer 5s sont armés. Le manager casse
        // ensuite — c'est load(), hors try/catch, qui l'appellera.
        if (calls > 2) throw new Error('cookie corrompu');
        return true;
      }),
      setConsent: vi.fn(),
      on: vi.fn()
    };
    resolveScript(m);
    await p;

    const uncaught = captureUncaught();
    document.dispatchEvent(new Event('scroll'));
    expect(uncaught.stop()).toEqual([]);
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
      isDirty: vi.fn(() => false),
      getConsent,
      setConsent: vi.fn(),
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

    err.mockRestore();
  });
});
