import { test, expect, type Page } from '@playwright/test';

const TRACKER_HOSTS = ['googletagmanager.com', 'smartlook.com'];

function watchTrackers(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (TRACKER_HOSTS.some((h) => r.url().includes(h))) hits.push(r.url());
  });
  return hits;
}

/**
 * Le badge démarre replié : `.getup-rgpd-badge-actions` est `display: none`
 * tant que `.getup-rgpd-badge--expanded` n'est pas posée (voir
 * src/theme/tokens.css). Cette classe n'est ajoutée qu'au clic sur
 * `.getup-rgpd-badge-label` (src/core/badge.ts). Avant de pouvoir cliquer
 * accepter/refuser, il faut donc : faire apparaître le badge par un
 * défilement vers le bas puis vers le haut au-delà de 300px (le badge ne se
 * révèle que sur un scroll UP, src/core/badge.ts), puis déplier via un clic
 * sur le label. Ce clic d'expansion révèle accepter ET refuser
 * simultanément : refuser ne coûte donc pas plus cher qu'accepter.
 */
async function revealAndExpandBadge(page: Page): Promise<void> {
  // Deux `scrollTo` synchrones dans le même tick sont coalescés par le
  // navigateur en un seul événement `scroll` portant la position finale : le
  // scroll-listener (src/core/badge.ts) ne verrait alors jamais l'état
  // intermédiaire à 800px, `lastY` resterait à sa valeur de montage (0), et
  // `y < lastY` (400 < 0) ne serait jamais vrai. Un court intervalle entre
  // les deux appels garantit deux événements `scroll` distincts, comme lors
  // d'un vrai geste de défilement.
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(page.locator('.getup-rgpd-badge')).toHaveClass(/--visible/);
  await page.locator('.getup-rgpd-badge-label').click();
  await expect(page.locator('.getup-rgpd-badge')).toHaveClass(/--expanded/);
}

test('aucune requête tracker avant interaction', async ({ page }) => {
  const hits = watchTrackers(page);
  await page.goto('/');
  await page.waitForTimeout(6000);
  expect(hits).toEqual([]);
});

test('« Tout refuser » ne déclenche aucun tracker', async ({ page }) => {
  const hits = watchTrackers(page);
  await page.goto('/');
  await revealAndExpandBadge(page);

  // Propriété de conformité centrale : déplier révèle accepter ET refuser
  // en même temps, aucune des deux options n'est plus coûteuse à atteindre
  // que l'autre.
  await expect(page.locator('.getup-rgpd-btn--accept')).toBeVisible();
  await expect(page.locator('.getup-rgpd-btn--decline')).toBeVisible();

  await page.locator('.getup-rgpd-btn--decline').click();
  await page.waitForTimeout(2000);
  expect(hits).toEqual([]);
});

test('« OK pour moi » déclenche les trackers et accorde le consentement', async ({ page }) => {
  const hits = watchTrackers(page);
  await page.goto('/');
  await revealAndExpandBadge(page);

  await expect(page.locator('.getup-rgpd-btn--accept')).toBeVisible();
  await expect(page.locator('.getup-rgpd-btn--decline')).toBeVisible();

  await page.locator('.getup-rgpd-btn--accept').click();

  await expect.poll(() => hits.some((u) => u.includes('googletagmanager'))).toBe(true);
  await expect.poll(() => hits.some((u) => u.includes('smartlook'))).toBe(true);

  const granted = await page.evaluate(() => {
    const dl = (window as unknown as { dataLayer: unknown[][] }).dataLayer ?? [];
    return dl.some(
      (e) => e[0] === 'consent' && e[1] === 'update' &&
             (e[2] as Record<string, string>).analytics_storage === 'granted'
    );
  });
  expect(granted).toBe(true);
});
