import { describe, it, expect, beforeEach } from 'vitest';
import { resolveConfig } from './config';
import { toOrejimeConfig, loadOrejime, __resetLoader } from './loader';

const config = resolveConfig({
  privacyPolicyUrl: '/confidentialite',
  locale: 'en',
  assetsBaseUrl: '/assets/orejime/',
  ui: { bannerTitle: 'Cookies maison', logo: '/logo.gif' },
  purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: ['_ga', /^_ga_/], default: false }]
});

describe('toOrejimeConfig', () => {
  it('traduit le schéma vers celui attendu par Orejime', () => {
    const o = toOrejimeConfig(config) as any;
    expect(o.privacyPolicyUrl).toBe('/confidentialite');
    expect(o.cookie).toEqual({ name: 'getup-cookies', duration: 365 });
    expect(o.translations.banner.title).toBe('Cookies maison');
    expect(o.logo).toBe('/logo.gif');
    expect(o.purposes[0].default).toBe(false);
    expect(o.purposes[0].cookies).toHaveLength(2);
  });
});

describe('loadOrejime', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete (window as any).orejime;
    delete (window as any).orejimeConfig;
    __resetLoader();
  });

  it('injecte la CSS et le script de la bonne locale', async () => {
    const p = loadOrejime(config);
    const script = document.head.querySelector('script') as HTMLScriptElement;
    expect(script.src).toContain('/assets/orejime/orejime-standard-en.js');
    const links = [...document.head.querySelectorAll('link')].map((l) => l.getAttribute('href'));
    expect(links).toContain('/assets/orejime/orejime-standard.css');

    (window as any).orejime = { manager: {} };
    script.dispatchEvent(new Event('load'));
    await expect(p).resolves.toEqual({ manager: {} });
  });

  it('publie orejimeConfig avant de charger le script', () => {
    loadOrejime(config);
    expect((window as any).orejimeConfig).toBeDefined();
    expect((window as any).orejimeConfig.privacyPolicyUrl).toBe('/confidentialite');
  });

  it('rejette si le script échoue à charger', async () => {
    const p = loadOrejime(config);
    const script = document.head.querySelector('script') as HTMLScriptElement;
    script.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow(/chargement/i);
  });

  it('rejette si le script se charge sans exposer window.orejime', async () => {
    const p = loadOrejime(config);
    const script = document.head.querySelector('script') as HTMLScriptElement;
    script.dispatchEvent(new Event('load'));
    await expect(p).rejects.toThrow(/window.orejime/);
  });

  it("n'injecte qu'une seule fois si appelé deux fois", () => {
    loadOrejime(config);
    loadOrejime(config);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('peut réessayer après un échec de chargement du script', async () => {
    const p1 = loadOrejime(config);
    const script1 = document.head.querySelector('script') as HTMLScriptElement;
    script1.dispatchEvent(new Event('error'));
    await expect(p1).rejects.toThrow(/chargement/i);

    // Simuler une retentative après l'erreur
    const p2 = loadOrejime(config);
    const scripts = document.head.querySelectorAll('script');
    const script2 = scripts[scripts.length - 1] as HTMLScriptElement;
    (window as any).orejime = { manager: {} };
    script2.dispatchEvent(new Event('load'));
    await expect(p2).resolves.toEqual({ manager: {} });
  });

  it('n\'ajoute pas de feuille de style dupliquée lors d\'une retentative', async () => {
    const p1 = loadOrejime(config);
    const script1 = document.head.querySelector('script') as HTMLScriptElement;
    script1.dispatchEvent(new Event('error'));
    await expect(p1).rejects.toThrow(/chargement/i);
    const linksAfterError = [...document.head.querySelectorAll('link')].map((l) => l.getAttribute('href'));
    expect(linksAfterError).toContain('/assets/orejime/orejime-standard.css');

    // Retentative
    const p2 = loadOrejime(config);
    const linksAfterRetry = [...document.head.querySelectorAll('link')].map((l) => l.getAttribute('href'));
    expect(linksAfterRetry.filter((h) => h === '/assets/orejime/orejime-standard.css')).toHaveLength(1);
  });
});
