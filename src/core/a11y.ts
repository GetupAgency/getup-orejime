const DURATIONS = { accept: 550, decline: 400 } as const;

/**
 * Orejime rend le titre de sa bannière en <h1>, ce qui crée un second H1
 * sur toutes les pages. On le remplace par un <p> de même classe et attributs.
 */
export function fixBannerHeading(): void {
  const banner = document.querySelector('.orejime-Banner');
  const h1 = banner?.querySelector('h1');
  if (!h1) return;
  const p = document.createElement('p');
  p.textContent = h1.textContent;
  for (const attr of h1.attributes) {
    p.setAttribute(attr.name, attr.value);
  }
  h1.replaceWith(p);
}

function animateExit(btn: HTMLElement, type: keyof typeof DURATIONS): (e: Event) => void {
  return function handler(e: Event) {
    e.stopImmediatePropagation();
    e.preventDefault();
    const banner = document.querySelector('.orejime-Banner');
    if (!banner) return;
    banner.classList.add(`orejime-Banner--leaving-${type}`);
    setTimeout(() => {
      btn.removeEventListener('click', handler, true);
      btn.click();
    }, DURATIONS[type]);
  };
}

export function attachExitAnimations(): void {
  const banner = document.querySelector('.orejime-Banner');
  const save = banner?.querySelector<HTMLElement>('.orejime-Banner-saveButton');
  const decline = banner?.querySelector<HTMLElement>('.orejime-Banner-declineButton');
  if (!save || !decline) return;
  save.addEventListener('click', animateExit(save, 'accept'), true);
  decline.addEventListener('click', animateExit(decline, 'decline'), true);
}
