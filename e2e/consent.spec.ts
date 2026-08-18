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

/**
 * La fixture est paramétrable par query-string (voir e2e/fixture/index.html).
 * Les trois assertions de conformité historiques restent sur la configuration
 * par défaut — badge actif, sans titre de bannière, sans phase 1 — pour ne
 * rien affaiblir ; la matrice ci-dessous couvre les configurations dont
 * l'absence avait laissé passer les deux régressions critiques.
 */
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

  // `gtag.js` ne dispatche une commande que depuis sa branche « arguments »
  // (`Object.prototype.toString.call(a) === "[object Arguments]"`). Empilé en
  // Array, le consent update n'atteint jamais le registre de commandes de
  // Google : l'état Consent Mode resterait `denied` toute la session malgré
  // le clic. Le contenu ne suffit donc pas, la *nature* de l'entrée compte.
  const grantedAsCommand = await page.evaluate(() => {
    const dl = (window as unknown as { dataLayer: unknown[] }).dataLayer ?? [];
    return dl.some((e) => {
      const args = e as Record<number, unknown>;
      return Object.prototype.toString.call(e) === '[object Arguments]' &&
             args[0] === 'consent' && args[1] === 'update' &&
             (args[2] as Record<string, string>).analytics_storage === 'granted';
    });
  });
  expect(grantedAsCommand).toBe(true);
});

/* ─────────── Matrice de configuration ─────────── */

/**
 * Régression critique : `.orejime-Banner { display: none }` était appliqué
 * sans condition par le thème, alors qu'Orejime n'émet jamais de modificateur
 * `orejime-Banner--show`. Seuls badge.ts (« En savoir plus ») et openBanner()
 * posent cette classe. Avec `ui.badge: false` — le défaut de l'adaptateur
 * WordPress quand l'option est absente — plus aucune interface de
 * consentement n'était atteignable : le visiteur ne pouvait ni accepter, ni
 * refuser, et n'était pas informé.
 */
test('avec ui.badge: false, une interface de consentement reste visible (?badge=0)', async ({ page }) => {
  await page.goto('/?badge=0');

  await expect(page.locator('.getup-rgpd-badge')).toHaveCount(0);
  await expect(page.locator('.orejime-Banner')).toBeVisible();
  await expect(page.locator('.orejime-Banner-saveButton')).toBeVisible();
  await expect(page.locator('.orejime-Banner-declineButton')).toBeVisible();
});

test('sans badge, refuser depuis la bannière ne déclenche aucun tracker (?badge=0&phase1=1)', async ({ page }) => {
  const hits = watchTrackers(page);
  await page.goto('/?badge=0&phase1=1');

  await expect(page.locator('.orejime-Banner-declineButton')).toBeVisible();
  await page.locator('.orejime-Banner-declineButton').click();
  await page.waitForTimeout(2000);
  expect(hits).toEqual([]);
});

test('sans badge, accepter depuis la bannière accorde bien le consentement (?badge=0&phase1=1)', async ({ page }) => {
  const hits = watchTrackers(page);
  await page.goto('/?badge=0&phase1=1');

  await expect(page.locator('.orejime-Banner-saveButton')).toBeVisible();
  await page.locator('.orejime-Banner-saveButton').click();

  await expect.poll(() => hits.some((u) => u.includes('googletagmanager'))).toBe(true);
  await expect.poll(() => hits.some((u) => u.includes('smartlook'))).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dl = (window as unknown as { dataLayer: unknown[] }).dataLayer ?? [];
        return dl.some((e) => {
          const args = e as Record<number, unknown>;
          return Object.prototype.toString.call(e) === '[object Arguments]' &&
                 args[0] === 'consent' && args[1] === 'update' &&
                 (args[2] as Record<string, string>).analytics_storage === 'granted';
        });
      })
    )
    .toBe(true);
});

test('le correctif SEO H1→P s\'applique au vrai markup Orejime (?title=1)', async ({ page }) => {
  await page.goto('/?title=1');
  await expect(page.locator('.orejime-Banner-title')).toHaveText('Cookies maison');
  // Orejime ne rend son <h1> que si un titre de bannière est configuré : sans
  // ce paramètre, fixBannerHeading n'était jamais confronté au vrai markup.
  await expect(page.locator('.orejime-Banner h1')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveCount(1);
});

test('témoin : sans le correctif, Orejime rend bien un second H1 (?title=1&fixh1=0)', async ({ page }) => {
  await page.goto('/?title=1&fixh1=0');
  await expect(page.locator('.orejime-Banner h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(2);
});

test('la phase 1 pose les quatre signaux à denied avant toute balise (?phase1=1)', async ({ page }) => {
  const hits = watchTrackers(page);
  await page.goto('/?phase1=1');

  const first = await page.evaluate(() => {
    const dl = (window as unknown as { dataLayer: unknown[] }).dataLayer ?? [];
    const entry = dl[0] as Record<number, unknown> | undefined;
    if (!entry) return null;
    return {
      isArguments: Object.prototype.toString.call(entry) === '[object Arguments]',
      command: entry[0],
      action: entry[1],
      signals: entry[2] as Record<string, string>
    };
  });

  expect(first).not.toBeNull();
  expect(first!.isArguments).toBe(true);
  expect(first!.command).toBe('consent');
  expect(first!.action).toBe('default');
  expect(first!.signals).toMatchObject({
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
  expect(hits).toEqual([]);
});

test('phase 1 présente : « OK pour moi » émet un update granted en objet arguments (?phase1=1)', async ({ page }) => {
  await page.goto('/?phase1=1');
  await revealAndExpandBadge(page);
  await page.locator('.getup-rgpd-btn--accept').click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const dl = (window as unknown as { dataLayer: unknown[] }).dataLayer ?? [];
        const commands = dl.filter(
          (e) => Object.prototype.toString.call(e) === '[object Arguments]'
        ) as unknown as Record<number, unknown>[];
        const defaults = commands.find((e) => e[0] === 'consent' && e[1] === 'default');
        const update = commands.find(
          (e) => e[0] === 'consent' && e[1] === 'update' &&
                 (e[2] as Record<string, string>).analytics_storage === 'granted'
        );
        return Boolean(defaults) && Boolean(update);
      })
    )
    .toBe(true);
});
