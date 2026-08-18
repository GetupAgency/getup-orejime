import { describe, it, expect, beforeEach, vi } from 'vitest';

const initConsent = vi.fn(async () => ({}));
const consentDefaultsScript = vi.fn(() => '');

vi.mock('./core/index', () => ({ initConsent, consentDefaultsScript }));

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete (window as any).GetupConsent;
  initConsent.mockClear();
  vi.resetModules();
});

function addConfigElement(textContent: string) {
  const el = document.createElement('script');
  el.type = 'application/json';
  el.id = 'getup-consent-config';
  el.textContent = textContent;
  document.body.appendChild(el);
}

describe('point d\'entrée IIFE', () => {
  it('expose window.GetupConsent', async () => {
    await import('./iife');
    expect((window as any).GetupConsent.initConsent).toBe(initConsent);
    expect((window as any).GetupConsent.consentDefaultsScript).toBe(consentDefaultsScript);
  });

  it("n'appelle pas initConsent si l'élément de config est absent", async () => {
    await import('./iife');
    expect(initConsent).not.toHaveBeenCalled();
  });

  it('appelle initConsent avec la config parsée quand elle est présente', async () => {
    addConfigElement(JSON.stringify({ privacyPolicyUrl: '/c' }));
    await import('./iife');
    expect(initConsent).toHaveBeenCalledWith({ privacyPolicyUrl: '/c' });
  });

  it('ne casse pas la page hôte si le JSON publié par le PHP est malformé', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    addConfigElement('{ceci n\'est pas du JSON');

    await expect(import('./iife')).resolves.toBeDefined();

    expect(initConsent).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
