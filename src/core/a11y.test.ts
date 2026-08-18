import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fixBannerHeading, attachExitAnimations } from './a11y';

beforeEach(() => {
  document.body.innerHTML = `
    <div class="orejime-Banner">
      <h1 class="orejime-Banner-title">Cookies maison</h1>
      <button class="orejime-Banner-saveButton">Accepter</button>
      <button class="orejime-Banner-declineButton">Refuser</button>
    </div>`;
});

describe('fixBannerHeading', () => {
  it('remplace le h1 de la bannière par un p, en gardant classe et texte', () => {
    fixBannerHeading();
    const banner = document.querySelector('.orejime-Banner')!;
    expect(banner.querySelector('h1')).toBeNull();
    const p = banner.querySelector('p.orejime-Banner-title')!;
    expect(p.textContent).toBe('Cookies maison');
  });

  it('est sans effet si la bannière na pas de h1', () => {
    document.body.innerHTML = '<div class="orejime-Banner"></div>';
    expect(() => fixBannerHeading()).not.toThrow();
  });
});

describe('attachExitAnimations', () => {
  it('ajoute la classe de sortie puis relaie le clic dorigine', () => {
    vi.useFakeTimers();
    attachExitAnimations();
    const save = document.querySelector('.orejime-Banner-saveButton') as HTMLButtonElement;
    const spy = vi.fn();
    save.addEventListener('click', spy);

    save.click();
    const banner = document.querySelector('.orejime-Banner')!;
    expect(banner.classList.contains('orejime-Banner--leaving-accept')).toBe(true);

    vi.advanceTimersByTime(600);
    expect(spy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('utilise la classe decline pour le bouton de refus', () => {
    vi.useFakeTimers();
    attachExitAnimations();
    (document.querySelector('.orejime-Banner-declineButton') as HTMLButtonElement).click();
    expect(
      document.querySelector('.orejime-Banner')!.classList.contains('orejime-Banner--leaving-decline')
    ).toBe(true);
    vi.useRealTimers();
  });
});
