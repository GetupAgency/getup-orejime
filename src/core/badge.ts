import type { ResolvedConfig } from './config';
import type { OrejimeManager } from './loader';

const LABELS = {
  badge: 'RGPD',
  accept: 'OK pour moi',
  decline: 'Tout refuser',
  more: 'En savoir plus'
};

function button(mod: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `getup-rgpd-btn getup-rgpd-btn--${mod}`;
  b.textContent = label;
  return b;
}

export function mountBadge(
  _config: ResolvedConfig,
  manager: OrejimeManager
): { destroy(): void } {
  if (manager.confirmed) return { destroy() {} };

  const root = document.createElement('div');
  root.className = 'getup-rgpd-badge';

  const label = document.createElement('span');
  label.className = 'getup-rgpd-badge-label';
  const dot = document.createElement('span');
  dot.className = 'getup-rgpd-badge-dot';
  label.appendChild(dot);
  label.appendChild(document.createTextNode(LABELS.badge));

  const actions = document.createElement('div');
  actions.className = 'getup-rgpd-badge-actions';
  const accept = button('accept', LABELS.accept);
  const decline = button('decline', LABELS.decline);
  const more = button('more', LABELS.more);
  actions.append(accept, decline, more);

  root.append(label, actions);
  document.body.appendChild(root);

  const remove = () => {
    root.classList.add('getup-rgpd-badge--leaving');
    root.classList.remove('getup-rgpd-badge--visible');
    setTimeout(() => root.remove(), 500);
  };

  const setAll = (value: boolean) => {
    manager.purposes.forEach((p) => manager.setConsent(p.id, value));
    manager.saveAndApplyConsents();
    remove();
  };

  label.addEventListener('click', () => {
    root.classList.toggle('getup-rgpd-badge--expanded');
  });
  accept.addEventListener('click', () => setAll(true));
  decline.addEventListener('click', () => setAll(false));
  more.addEventListener('click', () => {
    document.querySelector('.orejime-Banner')?.classList.add('orejime-Banner--show');
    remove();
  });

  let lastY = window.scrollY;
  let visible = false;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y < lastY && y > 300 && !visible) {
        root.classList.add('getup-rgpd-badge--visible');
        visible = true;
      } else if (y > lastY && visible) {
        root.classList.remove('getup-rgpd-badge--visible', 'getup-rgpd-badge--expanded');
        visible = false;
      }
      lastY = y;
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  return {
    destroy() {
      window.removeEventListener('scroll', onScroll);
      root.remove();
    }
  };
}
