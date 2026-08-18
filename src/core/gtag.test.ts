import { describe, it, expect, beforeEach } from 'vitest';
import { gtag } from './gtag';

/**
 * Le test qui compte : `gtag.js` n'accepte une commande que sous forme
 * d'objet `arguments`. Assertion faite sur la *nature* de l'entrée empilée,
 * pas seulement sur son contenu — c'est précisément parce que les tests
 * historiques n'assertaient que le contenu qu'un `Array` (jamais dispatché
 * par Google) a pu survivre en production.
 */
const isArgumentsObject = (v: unknown): boolean =>
  Object.prototype.toString.call(v) === '[object Arguments]';

describe('gtag', () => {
  beforeEach(() => { delete (window as any).dataLayer; });

  it('empile un objet arguments, pas un Array', () => {
    gtag('consent', 'update', { analytics_storage: 'granted' });
    const entry = (window as any).dataLayer[0];
    expect(isArgumentsObject(entry)).toBe(true);
    expect(Array.isArray(entry)).toBe(false);
  });

  it('préserve les arguments dans l’ordre et leur nombre', () => {
    gtag('js', new Date(0));
    const entry = (window as any).dataLayer[0];
    expect(entry.length).toBe(2);
    expect(entry[0]).toBe('js');
    expect(entry[1]).toBeInstanceOf(Date);
  });

  it('crée dataLayer s’il n’existe pas encore', () => {
    gtag('config', 'G-TEST');
    expect(Array.isArray((window as any).dataLayer)).toBe(true);
    expect((window as any).dataLayer).toHaveLength(1);
  });

  it('conserve les entrées déjà présentes (phase 1)', () => {
    (window as any).dataLayer = ['déjà là'];
    gtag('config', 'G-TEST');
    expect((window as any).dataLayer).toHaveLength(2);
    expect((window as any).dataLayer[0]).toBe('déjà là');
  });
});
