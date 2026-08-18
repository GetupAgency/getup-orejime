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
});
