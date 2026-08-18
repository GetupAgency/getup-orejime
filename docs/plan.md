# getup-consent v2.0.0 — Plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher (`- [ ]`).

**But :** créer le repo `getup-consent` livrant un cœur TypeScript unique de gestion du consentement, consommé par trois adaptateurs fins (WordPress, PrestaShop, React/Next), distribué en zips de release.

**Architecture :** un paquet npm racine avec sous-chemins d'export (`./core`, `./react`, `./theme`). Tout le comportement réglementaire vit dans `src/core`, compilé en bundle IIFE autonome que les adaptateurs PHP se contentent de charger en lui passant un objet de config sérialisé. Aucun `.php` ne contient de logique de consentement.

**Stack :** TypeScript, tsup (esbuild), Vitest + jsdom, Playwright, PHP 7.4+, GitHub Actions.

**Spec :** `docs/specs/2026-08-18-getup-consent-extraction-design.md` — à lire avant la première tâche. Le plan argumente depuis la spec ; les deux voyagent ensemble.

## Contraintes globales

Ces valeurs sont exactes et non négociables. Elles font implicitement partie des exigences de chaque tâche.

- Dépendance amont : `orejime@^3.1.0`, chargée par `<script>` — le paquet n'expose ni `main`, ni `exports`, ni types.
- Nom de cookie par défaut : `getup-cookies`. Durée par défaut : `365` jours. **Ne jamais changer** — les consentements déjà enregistrés chez les clients en dépendent.
- Locale par défaut : `fr`. 14 locales disponibles via `orejime-standard-<lang>.js`.
- Consent Mode v2 : les quatre signaux `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization` sont émis à `denied` par défaut, avec `wait_for_update: 500`. Non paramétrable.
- `Purpose.default` est typé littéral `false`. Seul `unsafeDefaultOptIn: true` permet l'opt-in, avec avertissement console.
- Version du produit : `2.0.0`, identique pour les trois cibles.
- Orejime est sous **BSD-3-Clause** (le code Getup est MIT). Sa notice de copyright et son disclaimer doivent être présents dans tout artefact redistribué.
- Le module ne doit jamais lever d'exception vers le site hôte, ni en cas d'échec de chargement, ni en cas de config invalide en production.

## Écart assumé par rapport à la spec

La spec liste `core/index.ts` comme point d'entrée sans détailler le chargement d'Orejime. Le plan ajoute **`src/core/loader.ts`**, module dédié à l'injection du script et de la CSS et à la promesse `onload`. Motif : `index.ts` doit rester une orchestration lisible, et le chargement est l'unité la plus délicate à tester isolément (échec réseau, ordre, double init).

Le plan ajoute aussi `consentMode.purposeSignals` à la config (Tâche 2). La spec fixe le mapping finalité → signaux sans dire comment un client dont les finalités ne s'appellent pas `analytics`/`advertising` s'y raccroche. Cinq lignes rendent la table surchargeable, ce qui évite une refonte au premier client qui nomme ses finalités autrement. Les valeurs par défaut restent celles de la spec.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/core/config.ts` | Types de config, défauts, validation, garde-fou d'opt-in |
| `src/core/consent-mode.ts` | Génération du script phase 1, mapping finalités → signaux Google |
| `src/core/loader.ts` | Injection CSS/JS Orejime par locale, promesse `onload`, échec fermé |
| `src/core/trackers.ts` | Chargement différé GTM, chargement conditionnel Smartlook |
| `src/core/badge.ts` | Badge RGPD scroll-up, trois actions |
| `src/core/a11y.ts` | Correctif H1→P, animations de sortie |
| `src/core/index.ts` | `consentDefaultsScript()`, `initConsent()`, API inerte |
| `src/react/ConsentManager.tsx` | Wrapper React, garde SSR et double montage |
| `src/theme/tokens.css` | Variables CSS, aucune couleur en dur |
| `src/theme/presets/midnight-emerald.css` | Preset par défaut |
| `adapters/wordpress/` | Écran d'options, sérialisation, migration des clés |
| `adapters/prestashop/` | Idem, hooks PrestaShop |
| `scripts/build-zips.mjs` | Assemblage des zips + notices de licence |

---

### Tâche 1 : Amorçage du repo et module de config

Le squelette du projet est plié dans cette tâche : il n'a d'intérêt que porté par un premier livrable testable.

**Fichiers :**
- Créer : `package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `LICENSE`
- Créer : `src/core/config.ts`
- Test : `src/core/config.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit : `ConsentSignal`, `Purpose`, `ConsentConfig`, `ResolvedConfig`, `resolveConfig(input: ConsentConfig): ResolvedConfig`, `DEFAULT_COOKIE_NAME`, `DEFAULT_COOKIE_DURATION`, `DEFAULT_PURPOSE_SIGNALS`.

- [ ] **Étape 1 : initialiser le dépôt et les manifestes**

```bash
mkdir -p getup-consent/src/core && cd getup-consent && git init
npm init -y
npm i orejime@^3.1.0
npm i -D typescript tsup vitest jsdom @types/node
```

`package.json` (remplacer le généré) :

```json
{
  "name": "@getup/consent",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "exports": {
    "./core": { "types": "./dist/core/index.d.ts", "import": "./dist/core/index.js" },
    "./react": { "types": "./dist/react/index.d.ts", "import": "./dist/react/index.js" },
    "./theme/*": "./dist/theme/*"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "prepare": "npm run build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": { "orejime": "^3.1.0" }
}
```

`tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "declaration": true,
    "jsx": "react-jsx",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] }
});
```

- [ ] **Étape 2 : écrire les tests qui échouent**

`src/core/config.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveConfig, DEFAULT_COOKIE_NAME, DEFAULT_COOKIE_DURATION } from './config';

const base = {
  privacyPolicyUrl: '/confidentialite',
  purposes: [
    { id: 'analytics', title: 'GA', description: 'd', cookies: ['_ga'], default: false as const }
  ]
};

describe('resolveConfig', () => {
  it('applique les défauts de cookie et de locale', () => {
    const c = resolveConfig(base);
    expect(c.cookie.name).toBe(DEFAULT_COOKIE_NAME);
    expect(c.cookie.duration).toBe(DEFAULT_COOKIE_DURATION);
    expect(c.locale).toBe('fr');
  });

  it('exige privacyPolicyUrl', () => {
    expect(() => resolveConfig({ ...base, privacyPolicyUrl: '' })).toThrow(/privacyPolicyUrl/);
  });

  it('exige au moins une finalité', () => {
    expect(() => resolveConfig({ ...base, purposes: [] })).toThrow(/purposes/);
  });

  it('force default à false quand unsafeDefaultOptIn est absent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = resolveConfig({
      ...base,
      purposes: [{ ...base.purposes[0], default: true as unknown as false }]
    });
    expect(c.purposes[0].default).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unsafeDefaultOptIn/));
    warn.mockRestore();
  });

  it('respecte un opt-in explicitement assumé, en avertissant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = resolveConfig({
      ...base,
      purposes: [{ ...base.purposes[0], default: true as unknown as false, unsafeDefaultOptIn: true }]
    });
    expect(c.purposes[0].default).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/opt-in/i));
    warn.mockRestore();
  });

  it('mappe analytics et advertising vers les signaux Google par défaut', () => {
    const c = resolveConfig(base);
    expect(c.consentMode.purposeSignals.analytics).toEqual(['analytics_storage']);
    expect(c.consentMode.purposeSignals.advertising).toEqual([
      'ad_storage', 'ad_user_data', 'ad_personalization'
    ]);
  });
});
```

- [ ] **Étape 3 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/core/config.test.ts`
Attendu : ÉCHEC — `Failed to resolve import "./config"`.

- [ ] **Étape 4 : écrire l'implémentation minimale**

`src/core/config.ts` :

```ts
export type ConsentSignal =
  | 'analytics_storage' | 'ad_storage' | 'ad_user_data' | 'ad_personalization';

export const CONSENT_SIGNALS: ConsentSignal[] = [
  'analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'
];

export const DEFAULT_COOKIE_NAME = 'getup-cookies';
export const DEFAULT_COOKIE_DURATION = 365;

export const DEFAULT_PURPOSE_SIGNALS: Record<string, ConsentSignal[]> = {
  analytics: ['analytics_storage'],
  advertising: ['ad_storage', 'ad_user_data', 'ad_personalization']
};

export type Purpose = {
  id: string;
  title: string;
  description: string;
  cookies: (string | RegExp)[];
  default: false;
  unsafeDefaultOptIn?: true;
};

export type ConsentConfig = {
  privacyPolicyUrl: string;
  locale?: string;
  cookie?: { name?: string; duration?: number };
  purposes: Purpose[];
  consentMode?: { purposeSignals?: Record<string, ConsentSignal[]> };
  trackers?: {
    gtm?: { id: string; lazy?: boolean };
    smartlook?: { key: string; region?: string };
  };
  ui?: {
    badge?: boolean; exitAnimation?: boolean; fixSeoH1?: boolean;
    placement?: 'bottom-right' | 'bottom-left';
    logo?: string; bannerTitle?: string;
  };
  theme?: { preset?: string; customCss?: string };
  assetsBaseUrl?: string;
};

export type ResolvedConfig = {
  privacyPolicyUrl: string;
  locale: string;
  cookie: { name: string; duration: number };
  purposes: (Omit<Purpose, 'default'> & { default: boolean })[];
  consentMode: { purposeSignals: Record<string, ConsentSignal[]> };
  trackers: NonNullable<ConsentConfig['trackers']>;
  ui: Required<Omit<NonNullable<ConsentConfig['ui']>, 'logo' | 'bannerTitle'>> &
      { logo?: string; bannerTitle?: string };
  theme: { preset: string; customCss?: string };
  assetsBaseUrl: string;
};

export function resolveConfig(input: ConsentConfig): ResolvedConfig {
  if (!input.privacyPolicyUrl) {
    throw new Error('[getup-consent] privacyPolicyUrl est requis.');
  }
  if (!input.purposes || input.purposes.length === 0) {
    throw new Error('[getup-consent] purposes doit contenir au moins une finalité.');
  }

  const purposes = input.purposes.map((p) => {
    const wantsOptIn = (p as { default: boolean }).default === true;
    if (wantsOptIn && !p.unsafeDefaultOptIn) {
      console.warn(
        `[getup-consent] La finalité "${p.id}" est déclarée default: true sans ` +
        `unsafeDefaultOptIn. Valeur forcée à false : un consentement préalable est requis.`
      );
      return { ...p, default: false };
    }
    if (wantsOptIn) {
      console.warn(
        `[getup-consent] La finalité "${p.id}" est en opt-in par défaut. ` +
        `Cette configuration piste le visiteur avant son accord.`
      );
    }
    return { ...p, default: wantsOptIn };
  });

  return {
    privacyPolicyUrl: input.privacyPolicyUrl,
    locale: input.locale ?? 'fr',
    cookie: {
      name: input.cookie?.name ?? DEFAULT_COOKIE_NAME,
      duration: input.cookie?.duration ?? DEFAULT_COOKIE_DURATION
    },
    purposes,
    consentMode: {
      purposeSignals: { ...DEFAULT_PURPOSE_SIGNALS, ...input.consentMode?.purposeSignals }
    },
    trackers: input.trackers ?? {},
    ui: {
      badge: input.ui?.badge ?? true,
      exitAnimation: input.ui?.exitAnimation ?? true,
      fixSeoH1: input.ui?.fixSeoH1 ?? true,
      placement: input.ui?.placement ?? 'bottom-right',
      logo: input.ui?.logo,
      bannerTitle: input.ui?.bannerTitle
    },
    theme: { preset: input.theme?.preset ?? 'midnight-emerald', customCss: input.theme?.customCss },
    assetsBaseUrl: (input.assetsBaseUrl ?? '/orejime').replace(/\/$/, '')
  };
}
```

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run src/core/config.test.ts`
Attendu : 6 tests PASS.

- [ ] **Étape 6 : ajouter la CI**

`.github/workflows/ci.yml` :

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm test
```

- [ ] **Étape 7 : commit**

```bash
git add -A
git commit -m "feat(core): schéma de config et garde-fou d'opt-in"
```

---

### Tâche 2 : Consent Mode v2

**Fichiers :**
- Créer : `src/core/consent-mode.ts`
- Test : `src/core/consent-mode.test.ts`

**Interfaces :**
- Consomme : `ResolvedConfig`, `ConsentSignal`, `CONSENT_SIGNALS`, `resolveConfig` (Tâche 1).
- Produit : `consentDefaultsScript(config: ResolvedConfig): string`, `mapConsentState(config: ResolvedConfig, state: Record<string, boolean>): Record<ConsentSignal, 'granted' | 'denied'>`, `pushConsentUpdate(config: ResolvedConfig, state: Record<string, boolean>): void`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/core/consent-mode.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveConfig } from './config';
import { consentDefaultsScript, mapConsentState, pushConsentUpdate } from './consent-mode';

const config = resolveConfig({
  privacyPolicyUrl: '/c',
  purposes: [
    { id: 'analytics', title: 'A', description: 'd', cookies: [], default: false },
    { id: 'advertising', title: 'P', description: 'd', cookies: [], default: false }
  ]
});

describe('consentDefaultsScript', () => {
  it('refuse les quatre signaux et attend une mise à jour', () => {
    const s = consentDefaultsScript(config);
    for (const sig of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) {
      expect(s).toContain(`${sig}:"denied"`);
    }
    expect(s).toContain('wait_for_update:500');
  });

  it("n'accorde jamais un signal, même si une finalité est en opt-in assumé", () => {
    const optIn = resolveConfig({
      privacyPolicyUrl: '/c',
      purposes: [{
        id: 'analytics', title: 'A', description: 'd', cookies: [],
        default: true as unknown as false, unsafeDefaultOptIn: true
      }]
    });
    expect(consentDefaultsScript(optIn)).not.toContain('granted');
  });

  it('ne contient pas de balise fermante susceptible de casser le script hôte', () => {
    expect(consentDefaultsScript(config)).not.toContain('</script');
  });
});

describe('mapConsentState', () => {
  it('accorde uniquement les signaux des finalités consenties', () => {
    expect(mapConsentState(config, { analytics: true, advertising: false })).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  });

  it('accorde les trois signaux publicitaires ensemble', () => {
    const r = mapConsentState(config, { analytics: false, advertising: true });
    expect(r.ad_storage).toBe('granted');
    expect(r.ad_user_data).toBe('granted');
    expect(r.ad_personalization).toBe('granted');
    expect(r.analytics_storage).toBe('denied');
  });

  it('ignore une finalité inconnue de la table de mapping', () => {
    const r = mapConsentState(config, { inconnue: true });
    expect(Object.values(r).every((v) => v === 'denied')).toBe(true);
  });
});

describe('pushConsentUpdate', () => {
  beforeEach(() => { (window as any).dataLayer = []; });

  it('empile un consent update dans dataLayer', () => {
    pushConsentUpdate(config, { analytics: true, advertising: false });
    const dl = (window as any).dataLayer;
    expect(dl[0][0]).toBe('consent');
    expect(dl[0][1]).toBe('update');
    expect(dl[0][2].analytics_storage).toBe('granted');
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/core/consent-mode.test.ts`
Attendu : ÉCHEC — module `./consent-mode` introuvable.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`src/core/consent-mode.ts` :

```ts
import { CONSENT_SIGNALS, type ConsentSignal, type ResolvedConfig } from './config';

type SignalState = Record<ConsentSignal, 'granted' | 'denied'>;

function allDenied(): SignalState {
  return CONSENT_SIGNALS.reduce((acc, s) => { acc[s] = 'denied'; return acc; }, {} as SignalState);
}

export function mapConsentState(
  config: ResolvedConfig,
  state: Record<string, boolean>
): SignalState {
  const result = allDenied();
  for (const [purposeId, granted] of Object.entries(state)) {
    if (!granted) continue;
    for (const signal of config.consentMode.purposeSignals[purposeId] ?? []) {
      result[signal] = 'granted';
    }
  }
  return result;
}

export function consentDefaultsScript(_config: ResolvedConfig): string {
  const denied = CONSENT_SIGNALS.map((s) => `${s}:"denied"`).join(',');
  return (
    'window.dataLayer=window.dataLayer||[];' +
    'function gtag(){dataLayer.push(arguments);}' +
    `gtag("consent","default",{${denied},wait_for_update:500});`
  );
}

export function pushConsentUpdate(
  config: ResolvedConfig,
  state: Record<string, boolean>
): void {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(['consent', 'update', mapConsentState(config, state)]);
}
```

Le paramètre de `consentDefaultsScript` est préfixé `_` : la sortie est volontairement invariante. Aucune config ne peut produire un `granted` en phase 1, ce que verrouille le deuxième test.

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run src/core/consent-mode.test.ts`
Attendu : 7 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git add src/core/consent-mode.ts src/core/consent-mode.test.ts
git commit -m "feat(core): Consent Mode v2, refus par défaut non contournable"
```

---

### Tâche 3 : Chargeur Orejime

**Fichiers :**
- Créer : `src/core/loader.ts`
- Test : `src/core/loader.test.ts`

**Interfaces :**
- Consomme : `ResolvedConfig` (Tâche 1).
- Produit : `OrejimeManager`, `OrejimeGlobal`, `toOrejimeConfig(config: ResolvedConfig): object`, `loadOrejime(config: ResolvedConfig): Promise<OrejimeGlobal>`.

`OrejimeManager` est la surface d'Orejime 3.1.0 utilisée par le reste du cœur :

```ts
export type OrejimeManager = {
  confirmed: boolean;
  purposes: { id: string }[];
  getConsent(id: string): boolean;
  setConsent(id: string, value: boolean): void;
  saveAndApplyConsents(): void;
  on(event: 'update', cb: () => void): void;
};
export type OrejimeGlobal = { manager: OrejimeManager };
```

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/core/loader.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveConfig } from './config';
import { toOrejimeConfig, loadOrejime } from './loader';

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
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/core/loader.test.ts`
Attendu : ÉCHEC — module `./loader` introuvable.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`src/core/loader.ts` :

```ts
import type { ResolvedConfig } from './config';

export type OrejimeManager = {
  confirmed: boolean;
  purposes: { id: string }[];
  getConsent(id: string): boolean;
  setConsent(id: string, value: boolean): void;
  saveAndApplyConsents(): void;
  on(event: 'update', cb: () => void): void;
};

export type OrejimeGlobal = { manager: OrejimeManager };

export function toOrejimeConfig(config: ResolvedConfig): object {
  return {
    privacyPolicyUrl: config.privacyPolicyUrl,
    logo: config.ui.logo,
    translations: config.ui.bannerTitle
      ? { banner: { title: config.ui.bannerTitle } }
      : undefined,
    cookie: { name: config.cookie.name, duration: config.cookie.duration },
    purposes: config.purposes.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      cookies: p.cookies,
      default: p.default
    }))
  };
}

let pending: Promise<OrejimeGlobal> | null = null;

export function loadOrejime(config: ResolvedConfig): Promise<OrejimeGlobal> {
  if (pending) return pending;

  const base = config.assetsBaseUrl;
  const w = window as unknown as { orejime?: OrejimeGlobal; orejimeConfig?: object };

  w.orejimeConfig = toOrejimeConfig(config);

  for (const href of [`${base}/orejime-standard.css`, `${base}/theme.css`]) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  pending = new Promise<OrejimeGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}/orejime-standard-${config.locale}.js`;
    script.async = true;
    script.addEventListener('load', () => {
      if (!w.orejime) {
        reject(new Error('[getup-consent] Script chargé mais window.orejime absent.'));
        return;
      }
      resolve(w.orejime);
    });
    script.addEventListener('error', () => {
      reject(new Error('[getup-consent] Échec de chargement du script Orejime.'));
    });
    document.head.appendChild(script);
  });

  return pending;
}

/** Réservé aux tests : remet à zéro la garde de chargement unique. */
export function __resetLoader(): void {
  pending = null;
}
```

Ajouter `__resetLoader()` dans un `beforeEach` du fichier de test, sans quoi la garde de chargement unique fait échouer les cas suivants :

```ts
import { __resetLoader } from './loader';
// dans beforeEach :
__resetLoader();
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run src/core/loader.test.ts`
Attendu : 6 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git add src/core/loader.ts src/core/loader.test.ts
git commit -m "feat(core): chargeur Orejime avec promesse onload, sans polling"
```

---

### Tâche 4 : Trackers conditionnels

**Fichiers :**
- Créer : `src/core/trackers.ts`
- Test : `src/core/trackers.test.ts`

**Interfaces :**
- Consomme : `ResolvedConfig` (Tâche 1), `OrejimeManager` (Tâche 3).
- Produit : `attachTrackers(config: ResolvedConfig, manager: OrejimeManager): void`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/core/trackers.test.ts` :

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveConfig } from './config';
import { attachTrackers } from './trackers';
import type { OrejimeManager } from './loader';

function fakeManager(consent: Record<string, boolean>): OrejimeManager & { fire(): void } {
  const listeners: (() => void)[] = [];
  return {
    confirmed: false,
    purposes: Object.keys(consent).map((id) => ({ id })),
    getConsent: (id) => consent[id] ?? false,
    setConsent: (id, v) => { consent[id] = v; },
    saveAndApplyConsents: () => {},
    on: (_e, cb) => { listeners.push(cb); },
    fire: () => listeners.forEach((l) => l())
  };
}

const config = resolveConfig({
  privacyPolicyUrl: '/c',
  trackers: { gtm: { id: 'G-TEST', lazy: true }, smartlook: { key: 'abc', region: 'eu' } },
  purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
});

const srcs = () => [...document.head.querySelectorAll('script')].map((s) => s.src);

describe('attachTrackers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    vi.useFakeTimers();
  });

  it('ne charge pas Smartlook sans consentement analytics', () => {
    attachTrackers(config, fakeManager({ analytics: false }));
    expect(srcs().some((s) => s.includes('smartlook'))).toBe(false);
  });

  it('charge Smartlook dès que le consentement analytics est accordé', () => {
    const m = fakeManager({ analytics: false });
    attachTrackers(config, m);
    m.setConsent('analytics', true);
    m.fire();
    expect(srcs().some((s) => s.includes('smartlook'))).toBe(true);
  });

  it("ne charge Smartlook qu'une seule fois malgré des update répétés", () => {
    const m = fakeManager({ analytics: true });
    attachTrackers(config, m);
    m.fire(); m.fire(); m.fire();
    expect(srcs().filter((s) => s.includes('smartlook'))).toHaveLength(1);
  });

  it('diffère GTM jusquà la première interaction', () => {
    attachTrackers(config, fakeManager({ analytics: false }));
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(false);
    document.dispatchEvent(new Event('scroll'));
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(true);
  });

  it('charge GTM après 5 secondes sans interaction', () => {
    attachTrackers(config, fakeManager({ analytics: false }));
    vi.advanceTimersByTime(5000);
    expect(srcs().some((s) => s.includes('googletagmanager'))).toBe(true);
  });

  it('ne charge rien si aucun tracker nest configuré', () => {
    const bare = resolveConfig({
      privacyPolicyUrl: '/c',
      purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false }]
    });
    attachTrackers(bare, fakeManager({ analytics: true }));
    expect(srcs()).toHaveLength(0);
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/core/trackers.test.ts`
Attendu : ÉCHEC — module `./trackers` introuvable.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`src/core/trackers.ts` :

```ts
import type { ResolvedConfig } from './config';
import type { OrejimeManager } from './loader';

const INTERACTIONS = ['scroll', 'click', 'touchstart', 'keydown'] as const;

function injectScript(src: string): void {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  document.head.appendChild(s);
}

function attachGtm(id: string, lazy: boolean): void {
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${id}`);
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push(['js', new Date()]);
    w.dataLayer.push(['config', id]);
    INTERACTIONS.forEach((e) => document.removeEventListener(e, load, true));
  };

  if (!lazy) { load(); return; }
  INTERACTIONS.forEach((e) =>
    document.addEventListener(e, load, { capture: true, passive: true })
  );
  setTimeout(load, 5000);
}

function attachSmartlook(key: string, region: string, manager: OrejimeManager): void {
  let loaded = false;
  const check = () => {
    if (loaded || !manager.getConsent('analytics')) return;
    loaded = true;
    injectScript('https://web-sdk.smartlook.com/recorder.js');
    const w = window as unknown as { smartlook?: { api: unknown[] } & ((...a: unknown[]) => void) };
    const api: unknown[] = [];
    const fn = ((...args: unknown[]) => { api.push(args); }) as typeof w.smartlook;
    (fn as { api: unknown[] }).api = api;
    w.smartlook = fn;
    fn!('init', key, { region });
  };
  check();
  manager.on('update', check);
}

export function attachTrackers(config: ResolvedConfig, manager: OrejimeManager): void {
  const { gtm, smartlook } = config.trackers;
  if (gtm) attachGtm(gtm.id, gtm.lazy ?? true);
  if (smartlook) attachSmartlook(smartlook.key, smartlook.region ?? 'eu', manager);
}
```

GTM n'est pas conditionné au consentement : c'est Consent Mode v2 qui régule ce que la balise a le droit de faire, et c'est le comportement recommandé par Google. Smartlook, lui, n'a pas d'équivalent et reste donc conditionné explicitement.

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run src/core/trackers.test.ts`
Attendu : 6 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git add src/core/trackers.ts src/core/trackers.test.ts
git commit -m "feat(core): chargement différé GTM et Smartlook conditionné au consentement"
```

---

### Tâche 5 : Badge RGPD

Le badge remplace la bannière intrusive par un encart qui apparaît au défilement vers le haut. C'est ici que se corrige l'asymétrie accepter/refuser relevée au constat 4 de la spec.

**Fichiers :**
- Créer : `src/core/badge.ts`
- Test : `src/core/badge.test.ts`

**Interfaces :**
- Consomme : `ResolvedConfig` (Tâche 1), `OrejimeManager` (Tâche 3).
- Produit : `mountBadge(config: ResolvedConfig, manager: OrejimeManager): { destroy(): void }`.

Classes CSS produites, reprises telles quelles par le thème (Tâche 8) : `getup-rgpd-badge`, `--visible`, `--expanded`, `--leaving`, `getup-rgpd-badge-label`, `getup-rgpd-badge-dot`, `getup-rgpd-badge-actions`, `getup-rgpd-btn`, `--accept`, `--decline`, `--more`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/core/badge.test.ts` :

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveConfig } from './config';
import { mountBadge } from './badge';
import type { OrejimeManager } from './loader';

function fakeManager(confirmed = false) {
  const consent: Record<string, boolean> = { analytics: false, advertising: false };
  return {
    confirmed,
    purposes: [{ id: 'analytics' }, { id: 'advertising' }],
    getConsent: (id: string) => consent[id],
    setConsent: vi.fn((id: string, v: boolean) => { consent[id] = v; }),
    saveAndApplyConsents: vi.fn(),
    on: vi.fn(),
    consent
  } as unknown as OrejimeManager & { consent: Record<string, boolean> };
}

const config = resolveConfig({
  privacyPolicyUrl: '/c',
  purposes: [
    { id: 'analytics', title: 'A', description: 'd', cookies: [], default: false },
    { id: 'advertising', title: 'P', description: 'd', cookies: [], default: false }
  ]
});

const badge = () => document.querySelector('.getup-rgpd-badge');
const btn = (mod: string) => document.querySelector(`.getup-rgpd-btn--${mod}`) as HTMLButtonElement;

describe('mountBadge', () => {
  beforeEach(() => { document.body.innerHTML = '<div class="orejime-Banner"></div>'; });

  it('monte le badge quand le consentement nest pas confirmé', () => {
    mountBadge(config, fakeManager(false));
    expect(badge()).not.toBeNull();
  });

  it('ne monte rien si le consentement est déjà confirmé', () => {
    mountBadge(config, fakeManager(true));
    expect(badge()).toBeNull();
  });

  it('expose accepter ET refuser au même niveau', () => {
    mountBadge(config, fakeManager());
    expect(btn('accept')).not.toBeNull();
    expect(btn('decline')).not.toBeNull();
    expect(btn('accept').parentElement).toBe(btn('decline').parentElement);
  });

  it('accepte toutes les finalités en un clic', () => {
    const m = fakeManager();
    mountBadge(config, m);
    btn('accept').click();
    expect(m.setConsent).toHaveBeenCalledWith('analytics', true);
    expect(m.setConsent).toHaveBeenCalledWith('advertising', true);
    expect(m.saveAndApplyConsents).toHaveBeenCalled();
  });

  it('refuse toutes les finalités en un clic', () => {
    const m = fakeManager();
    mountBadge(config, m);
    btn('decline').click();
    expect(m.setConsent).toHaveBeenCalledWith('analytics', false);
    expect(m.setConsent).toHaveBeenCalledWith('advertising', false);
    expect(m.saveAndApplyConsents).toHaveBeenCalled();
  });

  it('ouvre la bannière complète depuis « En savoir plus »', () => {
    mountBadge(config, fakeManager());
    btn('more').click();
    expect(document.querySelector('.orejime-Banner')!.classList.contains('orejime-Banner--show')).toBe(true);
  });

  it('nutilise jamais innerHTML pour construire son DOM', () => {
    const m = fakeManager();
    mountBadge(config, m);
    expect(badge()!.querySelector('script')).toBeNull();
    expect(btn('accept').textContent).toBe('OK pour moi');
  });

  it('retire le badge sur destroy', () => {
    const h = mountBadge(config, fakeManager());
    h.destroy();
    expect(badge()).toBeNull();
  });
});
```


- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/core/badge.test.ts`
Attendu : ÉCHEC — module `./badge` introuvable.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`src/core/badge.ts` :

```ts
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
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run src/core/badge.test.ts`
Attendu : 8 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git add src/core/badge.ts src/core/badge.test.ts
git commit -m "feat(core): badge RGPD avec refus en un clic"
```

---

### Tâche 6 : Correctifs d'accessibilité et animations

**Fichiers :**
- Créer : `src/core/a11y.ts`
- Test : `src/core/a11y.test.ts`

**Interfaces :**
- Consomme : rien du cœur.
- Produit : `fixBannerHeading(): void`, `attachExitAnimations(): void`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/core/a11y.test.ts` :

```ts
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
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/core/a11y.test.ts`
Attendu : ÉCHEC — module `./a11y` introuvable.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`src/core/a11y.ts` :

```ts
const DURATIONS = { accept: 550, decline: 400 } as const;

/**
 * Orejime rend le titre de sa bannière en <h1>, ce qui crée un second H1
 * sur toutes les pages. On le remplace par un <p> de même classe.
 */
export function fixBannerHeading(): void {
  const banner = document.querySelector('.orejime-Banner');
  const h1 = banner?.querySelector('h1');
  if (!h1) return;
  const p = document.createElement('p');
  p.className = h1.className;
  p.textContent = h1.textContent;
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
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run src/core/a11y.test.ts`
Attendu : 4 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git add src/core/a11y.ts src/core/a11y.test.ts
git commit -m "feat(core): correctif H1 dupliqué et animations de sortie"
```

---

### Tâche 7 : Orchestration et API inerte

C'est la tâche qui garantit qu'un module de consentement ne casse jamais son site hôte.

**Fichiers :**
- Créer : `src/core/index.ts`
- Test : `src/core/index.test.ts`

**Interfaces :**
- Consomme : tout ce qui précède.
- Produit : `ConsentApi`, `initConsent(config: ConsentConfig): Promise<ConsentApi>`, et la ré-exportation de `consentDefaultsScript`, `resolveConfig` et des types publics.

```ts
export type ConsentApi = {
  isInert: boolean;
  getConsent(purposeId: string): boolean;
  setConsent(purposeId: string, value: boolean): void;
  acceptAll(): void;
  declineAll(): void;
  openBanner(): void;
};
```

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/core/index.test.ts` :

```ts
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

const stubManager = () => ({
  confirmed: true,
  purposes: [{ id: 'analytics' }],
  getConsent: vi.fn(() => true),
  setConsent: vi.fn(),
  saveAndApplyConsents: vi.fn(),
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
    expect(m.saveAndApplyConsents).toHaveBeenCalled();
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
});
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/core/index.test.ts`
Attendu : ÉCHEC — `initConsent` non exporté.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`src/core/index.ts` :

```ts
import { resolveConfig, type ConsentConfig } from './config';
import { consentDefaultsScript, pushConsentUpdate } from './consent-mode';
import { loadOrejime, type OrejimeManager } from './loader';
import { attachTrackers } from './trackers';
import { mountBadge } from './badge';
import { fixBannerHeading, attachExitAnimations } from './a11y';

export type ConsentApi = {
  isInert: boolean;
  getConsent(purposeId: string): boolean;
  setConsent(purposeId: string, value: boolean): void;
  acceptAll(): void;
  declineAll(): void;
  openBanner(): void;
};

const INERT: ConsentApi = {
  isInert: true,
  getConsent: () => false,
  setConsent: () => {},
  acceptAll: () => {},
  declineAll: () => {},
  openBanner: () => {}
};

function readState(manager: OrejimeManager): Record<string, boolean> {
  return Object.fromEntries(manager.purposes.map((p) => [p.id, manager.getConsent(p.id)]));
}

export async function initConsent(input: ConsentConfig): Promise<ConsentApi> {
  if (typeof document === 'undefined') return INERT;

  try {
    const config = resolveConfig(input);
    const { manager } = await loadOrejime(config);

    const sync = () => pushConsentUpdate(config, readState(manager));
    sync();
    manager.on('update', sync);

    attachTrackers(config, manager);
    if (config.ui.fixSeoH1) fixBannerHeading();
    if (config.ui.exitAnimation) attachExitAnimations();
    if (config.ui.badge) mountBadge(config, manager);

    const setAll = (value: boolean) => {
      manager.purposes.forEach((p) => manager.setConsent(p.id, value));
      manager.saveAndApplyConsents();
    };

    return {
      isInert: false,
      getConsent: (id) => manager.getConsent(id),
      setConsent: (id, v) => { manager.setConsent(id, v); manager.saveAndApplyConsents(); },
      acceptAll: () => setAll(true),
      declineAll: () => setAll(false),
      openBanner: () => {
        document.querySelector('.orejime-Banner')?.classList.add('orejime-Banner--show');
      }
    };
  } catch (error) {
    console.error('[getup-consent] Initialisation impossible, mode inerte.', error);
    return INERT;
  }
}

export { consentDefaultsScript, resolveConfig };
export type { ConsentConfig, Purpose, ConsentSignal, ResolvedConfig } from './config';
```

Le mode inerte est le comportement conforme : les défauts `denied` de la phase 1 restent en place et rien ne les met à jour.

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run`
Attendu : la suite complète PASS (31 tests).

- [ ] **Étape 5 : commit**

```bash
git add src/core/index.ts src/core/index.test.ts
git commit -m "feat(core): initConsent et API inerte en cas d'échec"
```

---

### Tâche 8 : Thème tokenisé

Portage du thème existant en séparant structure et couleurs. Fichier source : `public/orejime/orejime-overrides.css` du repo `getup-2K26` (629 lignes — la version PrestaShop, plus courte de 172 lignes, est obsolète et ne doit pas servir de base).

**Fichiers :**
- Créer : `src/theme/tokens.css`, `src/theme/presets/midnight-emerald.css`
- Test : vérification par commande, pas de test unitaire (voir spec §9)

**Interfaces :**
- Consomme : les classes produites par `badge.ts` (Tâche 5) et par Orejime.
- Produit : deux feuilles de style ; `tokens.css` contient toute la structure et référence exclusivement des variables, `midnight-emerald.css` ne contient que des déclarations de variables.

- [ ] **Étape 1 : copier le thème existant comme base**

```bash
cp ../getup-2K26/public/orejime/orejime-overrides.css src/theme/tokens.css
wc -l src/theme/tokens.css   # attendu : 629
```

- [ ] **Étape 2 : créer le preset avec les couleurs relevées**

`src/theme/presets/midnight-emerald.css` — ces onze valeurs sont celles déjà présentes dans le `:root` du fichier source, complétées des couleurs jusque-là codées en dur :

```css
:root {
  --orejime-color-background: #101820;
  --orejime-color-surface: #0a0f14;
  --orejime-color-text: #f0f4f3;
  --orejime-color-text-muted: #a3b3ad;
  --orejime-color-subdued: #7e9189;
  --orejime-color-border: #3f4f49;
  --orejime-color-border-strong: #5e726b;
  --orejime-color-interactive: #10b981;
  --orejime-color-interactive-hover: #34d399;
  --orejime-color-interactive-active: #059669;
  --orejime-color-on-interactive: #0a0f14;
  --orejime-color-on-light: #fff;
  --orejime-color-shadow: 0, 0, 0;
  --orejime-color-backdrop: rgba(6, 11, 16, 0.8);
  --orejime-font-family: var(--font-inter), 'Inter', -apple-system, sans-serif;
  --orejime-radius: 16px;
  --orejime-space-m: 1.25em;
  --orejime-font-size-small: 0.8rem;
}
```

- [ ] **Étape 3 : remplacer chaque couleur en dur de `tokens.css` par sa variable**

Le fichier source contient 40 occurrences hexadécimales. Correspondance à appliquer :

| Valeur | Variable |
|---|---|
| `#10b981` (7×) | `var(--orejime-color-interactive)` |
| `#34d399` (7×) | `var(--orejime-color-interactive-hover)` |
| `#059669` (1×) | `var(--orejime-color-interactive-active)` |
| `#f0f4f3` (6×) | `var(--orejime-color-text)` |
| `#a3b3ad` (4×) | `var(--orejime-color-text-muted)` |
| `#7e9189` (3×) | `var(--orejime-color-subdued)` |
| `#5e726b` (3×) | `var(--orejime-color-border-strong)` |
| `#3f4f49` (2×) | `var(--orejime-color-border)` |
| `#0a0f14` (3×) | `var(--orejime-color-surface)` |
| `#101820` (2×) | `var(--orejime-color-background)` |
| `#fff` (1×) | `var(--orejime-color-on-light)` |

Retirer ensuite le bloc `:root` du haut de `tokens.css` : il a migré dans le preset.

- [ ] **Étape 4 : vérifier qu'aucune couleur ne subsiste hors du preset**

```bash
grep -cE '#[0-9a-fA-F]{3,8}|rgba?\(' src/theme/tokens.css
```
Attendu : `0`. Toute valeur restante est une couleur non tokenisée.

```bash
grep -c 'getup-rgpd-badge' src/theme/tokens.css
```
Attendu : ≥ 10 — confirme que le bloc badge est bien présent, celui qui manquait à la version PrestaShop.

- [ ] **Étape 5 : ajouter la règle de masquage de la bannière**

Elle vivait dans `src/design-system/main.scss` du site et doit voyager avec le thème. Ajouter en tête de `tokens.css` :

```css
.orejime-Banner { display: none !important; }
.orejime-Banner.orejime-Banner--show { display: block !important; }
```

- [ ] **Étape 6 : commit**

```bash
git add src/theme
git commit -m "feat(theme): tokenisation complète, midnight-emerald en preset"
```

---

### Tâche 9 : Wrapper React

**Fichiers :**
- Créer : `src/react/ConsentManager.tsx`, `src/react/index.ts`
- Test : `src/react/ConsentManager.test.tsx`

**Interfaces :**
- Consomme : `initConsent`, `ConsentConfig`, `ConsentApi` (Tâche 7).
- Produit : `<ConsentManager config={ConsentConfig} />`.

- [ ] **Étape 1 : installer les dépendances de test React**

```bash
npm i -D react react-dom @types/react @testing-library/react
npm pkg set peerDependencies.react=">=18"
```

- [ ] **Étape 2 : écrire les tests qui échouent**

`src/react/ConsentManager.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ConsentManager } from './ConsentManager';

const initConsent = vi.hoisted(() => vi.fn(async () => ({ isInert: false })));
vi.mock('../core/index', () => ({ initConsent }));

const config = {
  privacyPolicyUrl: '/c',
  purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false as const }]
};

beforeEach(() => initConsent.mockClear());

describe('ConsentManager', () => {
  it('initialise le consentement au montage', () => {
    render(<ConsentManager config={config} />);
    expect(initConsent).toHaveBeenCalledWith(config);
  });

  it("n'initialise qu'une fois malgré un double montage React 18", () => {
    const { rerender } = render(<ConsentManager config={config} />);
    rerender(<ConsentManager config={config} />);
    expect(initConsent).toHaveBeenCalledTimes(1);
  });

  it('ne rend aucun DOM', () => {
    const { container } = render(<ConsentManager config={config} />);
    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Étape 3 : lancer les tests et vérifier qu'ils échouent**

Run : `npx vitest run src/react`
Attendu : ÉCHEC — module `./ConsentManager` introuvable.

- [ ] **Étape 4 : écrire l'implémentation minimale**

`src/react/ConsentManager.tsx` :

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { initConsent } from '../core/index';
import type { ConsentConfig } from '../core/config';

export function ConsentManager({ config }: { config: ConsentConfig }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void initConsent(config);
  }, [config]);

  return null;
}
```

`src/react/index.ts` :

```ts
export { ConsentManager } from './ConsentManager';
```

La garde `started` couvre le double effet du mode strict React 18/19 ; la garde de chargement unique de `loader.ts` en est la seconde ligne de défense.

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Run : `npx vitest run`
Attendu : suite complète PASS.

- [ ] **Étape 6 : commit**

```bash
git add src/react
git commit -m "feat(react): composant ConsentManager"
```

---

### Tâche 10 : Build et bundle IIFE

Les adaptateurs PHP ne peuvent pas consommer d'ESM : il leur faut un fichier unique à charger par `<script>`.

**Fichiers :**
- Créer : `tsup.config.ts`, `src/iife.ts`
- Modifier : `package.json` (scripts)

**Interfaces :**
- Consomme : `initConsent`, `consentDefaultsScript` (Tâche 7).
- Produit : `dist/core/index.js`, `dist/react/index.js`, `dist/getup-consent.iife.js` exposant `window.GetupConsent`, `dist/theme/*.css`, `dist/vendor/orejime/*`.

- [ ] **Étape 1 : écrire le point d'entrée global**

`src/iife.ts` :

```ts
import { initConsent, consentDefaultsScript } from './core/index';

const api = { initConsent, consentDefaultsScript };
(window as unknown as { GetupConsent: typeof api }).GetupConsent = api;

const el = document.getElementById('getup-consent-config');
if (el?.textContent) {
  void initConsent(JSON.parse(el.textContent));
}
```

Les adaptateurs PHP publient la config dans une balise `<script type="application/json" id="getup-consent-config">`. Ce transport évite toute concaténation de chaînes côté PHP — la cause des accents échappés à la main relevée en spec §6.

- [ ] **Étape 2 : configurer tsup**

`tsup.config.ts` :

```ts
import { defineConfig } from 'tsup';
import { cp } from 'node:fs/promises';

export default defineConfig([
  {
    entry: { 'core/index': 'src/core/index.ts', 'react/index': 'src/react/index.ts' },
    format: ['esm'],
    dts: true,
    external: ['react'],
    clean: true
  },
  {
    entry: { 'getup-consent.iife': 'src/iife.ts' },
    format: ['iife'],
    minify: true,
    async onSuccess() {
      await cp('src/theme', 'dist/theme', { recursive: true });
      await cp('node_modules/orejime/dist', 'dist/vendor/orejime', { recursive: true });
      await cp('node_modules/orejime/LICENSE', 'dist/vendor/orejime/LICENSE');
    }
  }
]);
```

La copie du `LICENSE` d'Orejime est l'obligation BSD-3-Clause de la spec §8. Elle est dans le build, pas seulement dans le script de zip, pour qu'elle suive aussi les installations npm.

- [ ] **Étape 3 : lancer le build et vérifier les artefacts**

```bash
npm run build
ls dist/getup-consent.iife.js dist/core/index.d.ts dist/theme/tokens.css dist/vendor/orejime/LICENSE
```
Attendu : les quatre fichiers existent.

- [ ] **Étape 4 : vérifier que le bundle ne contient pas de « granted » en dur**

```bash
grep -c 'wait_for_update' dist/getup-consent.iife.js
```
Attendu : ≥ 1 — la phase 1 est bien embarquée.

- [ ] **Étape 5 : commit**

```bash
git add tsup.config.ts src/iife.ts package.json
git commit -m "build: bundles ESM, IIFE et copie des actifs Orejime"
```

---

### Tâche 11 : Test de bout en bout — aucun tracker avant consentement

Le test prioritaire de la spec §9. Il vérifie le comportement réel du réseau, sans mock.

**Fichiers :**
- Créer : `playwright.config.ts`, `e2e/fixture/index.html`, `e2e/consent.spec.ts`

**Interfaces :**
- Consomme : `dist/getup-consent.iife.js`, `dist/vendor/orejime/*`, `dist/theme/*` (Tâche 10).
- Produit : rien de consommé par d'autres tâches.

- [ ] **Étape 1 : installer Playwright**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

- [ ] **Étape 2 : créer la page de test**

`e2e/fixture/index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Fixture consentement</title>
    <script type="application/json" id="getup-consent-config">
      {
        "privacyPolicyUrl": "/confidentialite",
        "assetsBaseUrl": "/vendor/orejime",
        "trackers": {
          "gtm": { "id": "G-FIXTURE", "lazy": false },
          "smartlook": { "key": "fixture-key" }
        },
        "purposes": [
          { "id": "analytics", "title": "Analytics", "description": "d", "cookies": ["_ga"], "default": false },
          { "id": "advertising", "title": "Publicité", "description": "d", "cookies": ["_fbp"], "default": false }
        ]
      }
    </script>
    <link rel="stylesheet" href="/theme/tokens.css" />
    <link rel="stylesheet" href="/theme/presets/midnight-emerald.css" />
    <script src="/getup-consent.iife.js" defer></script>
  </head>
  <body style="height: 300vh">
    <h1>Fixture</h1>
  </body>
</html>
```

- [ ] **Étape 3 : configurer Playwright pour servir `dist` et la fixture**

`playwright.config.ts` :

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npx http-server -p 4173 -c-1 .playwright-root',
    port: 4173,
    reuseExistingServer: true
  }
});
```

Préparer la racine servie avant de lancer les tests :

```bash
npm i -D http-server
rm -rf .playwright-root && mkdir -p .playwright-root
cp -R dist/* .playwright-root/
cp e2e/fixture/index.html .playwright-root/index.html
echo ".playwright-root/" >> .gitignore
```

- [ ] **Étape 4 : écrire le test qui échoue**

`e2e/consent.spec.ts` :

```ts
import { test, expect, type Page } from '@playwright/test';

const TRACKER_HOSTS = ['googletagmanager.com', 'smartlook.com'];

function watchTrackers(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (TRACKER_HOSTS.some((h) => r.url().includes(h))) hits.push(r.url());
  });
  return hits;
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
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.locator('.getup-rgpd-btn--decline').click();
  await page.waitForTimeout(2000);
  expect(hits).toEqual([]);
});

test('« OK pour moi » déclenche les trackers et accorde le consentement', async ({ page }) => {
  const hits = watchTrackers(page);
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.evaluate(() => window.scrollTo(0, 400));
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
```

- [ ] **Étape 5 : lancer les tests**

Run : `npx playwright test`
Attendu : 3 tests PASS. Un échec du premier test signale une régression de conformité, jamais un test fragile — investiguer avant toute autre chose.

- [ ] **Étape 6 : ajouter Playwright à la CI**

Dans `.github/workflows/ci.yml`, après `npm test` :

```yaml
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: |
          rm -rf .playwright-root && mkdir -p .playwright-root
          cp -R dist/* .playwright-root/
          cp e2e/fixture/index.html .playwright-root/index.html
      - run: npx playwright test
```

- [ ] **Étape 7 : commit**

```bash
git add playwright.config.ts e2e .github/workflows/ci.yml .gitignore package.json
git commit -m "test(e2e): aucun tracker ne part avant consentement"
```

---

### Tâche 12 : Adaptateur WordPress

Règle de frontière de la spec §3 : aucune logique de consentement en PHP. L'adaptateur construit un tableau de config et le sérialise. C'est tout.

Les deux fonctions porteuses de logique sont **pures** — elles reçoivent un tableau et en retournent un — ce qui les rend testables sans amorcer WordPress.

**Fichiers :**
- Créer : `adapters/wordpress/getup-orejime.php`, `includes/config.php`, `includes/migrate.php`, `includes/frontend.php`, `includes/admin.php`
- Créer : `adapters/wordpress/tests/ConfigTest.php`, `tests/MigrateTest.php`, `phpunit.xml`

**Interfaces :**
- Consomme : `dist/getup-consent.iife.js`, `dist/theme/*`, `dist/vendor/orejime/*` (Tâche 10).
- Produit : `getup_orejime_build_config(array $options): array`, `getup_orejime_migrate_options(array $legacy): array`.

- [ ] **Étape 1 : installer PHPUnit**

```bash
cd adapters/wordpress
composer require --dev phpunit/phpunit ^9
```

`phpunit.xml` :

```xml
<?xml version="1.0"?>
<phpunit bootstrap="vendor/autoload.php" colors="true">
  <testsuites>
    <testsuite name="adapter">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

- [ ] **Étape 2 : écrire les tests qui échouent**

`adapters/wordpress/tests/MigrateTest.php` :

```php
<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../includes/migrate.php';

class MigrateTest extends TestCase
{
    private function legacy(array $over = []): array
    {
        return array_merge([
            'getup_orejime_cookie_name'         => 'getup-cookies',
            'getup_orejime_cookie_duration'     => 365,
            'getup_orejime_privacy_policy_url'  => '/politique-de-confidentialite',
            'getup_orejime_logo_url'            => '/logo.gif',
            'getup_orejime_banner_title'        => 'Cookies maison',
            'getup_orejime_placement'           => 'bottom-right',
            'getup_orejime_custom_css'          => '.x{color:red}',
            'getup_orejime_google_consent_mode' => true,
            'getup_orejime_exit_animation'      => true,
            'getup_orejime_fix_seo_h1'          => true,
            'getup_orejime_badge_mode'          => false,
            'getup_orejime_smartlook_key'       => 'sl-key',
            'getup_orejime_purposes'            => json_encode([[
                'id' => 'analytics', 'title' => 'GA', 'description' => 'd',
                'cookies' => '_ga, _ga_*, _gid', 'default' => false,
            ]]),
        ], $over);
    }

    public function testRemapsFlatKeysToNestedStructure(): void
    {
        $c = getup_orejime_migrate_options($this->legacy());

        $this->assertSame('/politique-de-confidentialite', $c['privacyPolicyUrl']);
        $this->assertSame('getup-cookies', $c['cookie']['name']);
        $this->assertSame(365, $c['cookie']['duration']);
        $this->assertSame('/logo.gif', $c['ui']['logo']);
        $this->assertSame('Cookies maison', $c['ui']['bannerTitle']);
        $this->assertSame('bottom-right', $c['ui']['placement']);
        $this->assertSame('.x{color:red}', $c['theme']['customCss']);
        $this->assertSame('sl-key', $c['trackers']['smartlook']['key']);
    }

    public function testPreservesBadgeModeInsteadOfApplyingNewDefault(): void
    {
        $c = getup_orejime_migrate_options($this->legacy());
        $this->assertFalse($c['ui']['badge']);
    }

    public function testDropsTheGoogleConsentModeToggle(): void
    {
        $c = getup_orejime_migrate_options($this->legacy(['getup_orejime_google_consent_mode' => false]));
        $this->assertArrayNotHasKey('googleConsentMode', $c);
        $this->assertArrayNotHasKey('consentMode', $c);
    }

    public function testSplitsCookieListIntoArray(): void
    {
        $c = getup_orejime_migrate_options($this->legacy());
        $this->assertSame(['_ga', '_ga_*', '_gid'], $c['purposes'][0]['cookies']);
    }

    public function testForcesOptInPurposesBackToOptOut(): void
    {
        $legacy = $this->legacy([
            'getup_orejime_purposes' => json_encode([[
                'id' => 'analytics', 'title' => 'GA', 'description' => 'd',
                'cookies' => '_ga', 'default' => true,
            ]]),
        ]);
        $c = getup_orejime_migrate_options($legacy);
        $this->assertFalse($c['purposes'][0]['default']);
    }

    public function testSurvivesMissingLegacyOptions(): void
    {
        $c = getup_orejime_migrate_options([]);
        $this->assertSame('getup-cookies', $c['cookie']['name']);
        $this->assertSame([], $c['purposes']);
    }
}
```

`adapters/wordpress/tests/ConfigTest.php` :

```php
<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../includes/config.php';

class ConfigTest extends TestCase
{
    public function testSerializesToJsonSafeForInlineScriptTag(): void
    {
        $json = getup_orejime_encode_config([
            'privacyPolicyUrl' => '/c',
            'ui' => ['bannerTitle' => '</script><script>alert(1)</script>'],
        ]);
        $this->assertStringNotContainsString('</script>', $json);
        $this->assertNotNull(json_decode($json, true));
    }

    public function testKeepsAccentedCharactersReadable(): void
    {
        $json = getup_orejime_encode_config(['ui' => ['bannerTitle' => 'Publicité']]);
        $this->assertStringContainsString('Publicité', $json);
    }

    public function testRoundTripsWithoutLoss(): void
    {
        $config = ['privacyPolicyUrl' => '/c', 'purposes' => [
            ['id' => 'analytics', 'title' => 'A', 'description' => 'd', 'cookies' => ['_ga'], 'default' => false],
        ]];
        $this->assertSame($config, json_decode(getup_orejime_encode_config($config), true));
    }
}
```

- [ ] **Étape 3 : lancer les tests et vérifier qu'ils échouent**

Run : `cd adapters/wordpress && ./vendor/bin/phpunit`
Attendu : ÉCHEC — `failed to open stream: includes/migrate.php`.

- [ ] **Étape 4 : écrire les implémentations minimales**

`adapters/wordpress/includes/config.php` :

```php
<?php
if (!defined('ABSPATH') && !defined('GETUP_OREJIME_TESTING')) {
    define('GETUP_OREJIME_TESTING', true);
}

require_once __DIR__ . '/migrate.php';

/**
 * Sérialise la config pour injection dans une balise <script type="application/json">.
 * Les drapeaux HEX empêchent toute fermeture prématurée de balise.
 */
function getup_orejime_encode_config(array $config): string
{
    return json_encode(
        $config,
        JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE
    );
}

/** Construit la config depuis les options WordPress courantes. */
function getup_orejime_build_config(array $options): array
{
    return getup_orejime_migrate_options($options);
}
```

`adapters/wordpress/includes/migrate.php` :

```php
<?php

function getup_orejime_split_cookies($raw): array
{
    if (is_array($raw)) {
        return array_values($raw);
    }
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    return array_values(array_filter(array_map('trim', explode(',', $raw)), 'strlen'));
}

/**
 * Remappe les clés plates historiques vers la structure imbriquée de @getup/consent.
 *
 * L'option getup_orejime_google_consent_mode est volontairement abandonnée :
 * Consent Mode v2 n'est plus désactivable.
 */
function getup_orejime_migrate_options(array $legacy): array
{
    $get = static function (string $key, $default = null) use ($legacy) {
        return array_key_exists($key, $legacy) && $legacy[$key] !== '' ? $legacy[$key] : $default;
    };

    $rawPurposes = $get('getup_orejime_purposes', '[]');
    $purposes = is_string($rawPurposes) ? json_decode($rawPurposes, true) : $rawPurposes;
    if (!is_array($purposes)) {
        $purposes = [];
    }

    $config = [
        'privacyPolicyUrl' => (string) $get('getup_orejime_privacy_policy_url', '/politique-de-confidentialite'),
        'cookie' => [
            'name'     => (string) $get('getup_orejime_cookie_name', 'getup-cookies'),
            'duration' => (int) $get('getup_orejime_cookie_duration', 365),
        ],
        'purposes' => array_values(array_map(static function (array $p): array {
            return [
                'id'          => (string) ($p['id'] ?? ''),
                'title'       => (string) ($p['title'] ?? ''),
                'description' => (string) ($p['description'] ?? ''),
                'cookies'     => getup_orejime_split_cookies($p['cookies'] ?? ''),
                // Opt-in historique neutralisé : le consentement préalable prime.
                'default'     => false,
            ];
        }, $purposes)),
        'ui' => [
            'badge'         => (bool) $get('getup_orejime_badge_mode', false),
            'exitAnimation' => (bool) $get('getup_orejime_exit_animation', true),
            'fixSeoH1'      => (bool) $get('getup_orejime_fix_seo_h1', true),
            'placement'     => (string) $get('getup_orejime_placement', 'bottom-right'),
            'logo'          => $get('getup_orejime_logo_url'),
            'bannerTitle'   => $get('getup_orejime_banner_title', 'Cookies maison'),
        ],
        'theme' => [
            'preset'    => 'midnight-emerald',
            'customCss' => $get('getup_orejime_custom_css'),
        ],
    ];

    $smartlook = $get('getup_orejime_smartlook_key');
    if ($smartlook) {
        $config['trackers']['smartlook'] = ['key' => (string) $smartlook];
    }

    return $config;
}
```

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Run : `cd adapters/wordpress && ./vendor/bin/phpunit`
Attendu : 9 tests PASS.

- [ ] **Étape 6 : écrire le chargement front**

`adapters/wordpress/includes/frontend.php` :

```php
<?php
if (!defined('ABSPATH')) { exit; }

require_once GETUP_OREJIME_DIR . 'includes/config.php';

add_action('wp_head', 'getup_orejime_consent_defaults', 1);
add_action('wp_enqueue_scripts', 'getup_orejime_enqueue', 99);
add_action('wp_footer', 'getup_orejime_print_config', 5);

/** Phase 1 — doit précéder toute balise de mesure. */
function getup_orejime_consent_defaults(): void
{
    $signals = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];
    $denied  = implode(',', array_map(static fn($s) => $s . ':"denied"', $signals));
    echo '<script id="getup-orejime-consent-defaults">'
       . 'window.dataLayer=window.dataLayer||[];'
       . 'function gtag(){dataLayer.push(arguments);}'
       . 'gtag("consent","default",{' . $denied . ',wait_for_update:500});'
       . '</script>';
}

function getup_orejime_enqueue(): void
{
    wp_enqueue_style('getup-consent-tokens', GETUP_OREJIME_URL . 'dist/theme/tokens.css', [], GETUP_OREJIME_VERSION);
    wp_enqueue_style('getup-consent-preset', GETUP_OREJIME_URL . 'dist/theme/presets/midnight-emerald.css', ['getup-consent-tokens'], GETUP_OREJIME_VERSION);

    $custom = get_option('getup_orejime_custom_css', '');
    if ($custom !== '') {
        wp_add_inline_style('getup-consent-preset', wp_strip_all_tags($custom));
    }

    wp_enqueue_script('getup-consent', GETUP_OREJIME_URL . 'dist/getup-consent.iife.js', [], GETUP_OREJIME_VERSION, true);
}

/** Phase 2 — la config est publiée en JSON, jamais concaténée dans du JS. */
function getup_orejime_print_config(): void
{
    $options = [];
    foreach (wp_load_alloptions() as $key => $value) {
        if (strpos($key, 'getup_orejime_') === 0) {
            $options[$key] = $value;
        }
    }
    $config = getup_orejime_build_config($options);
    $config['assetsBaseUrl'] = GETUP_OREJIME_URL . 'dist/vendor/orejime';

    echo '<script type="application/json" id="getup-consent-config">'
       . getup_orejime_encode_config($config)
       . '</script>';
}
```

- [ ] **Étape 7 : écrire le fichier principal et l'écran d'options**

`adapters/wordpress/getup-orejime.php` :

```php
<?php
/**
 * Plugin Name:       Getup Orejime — Cookie Consent
 * Plugin URI:        https://getup.agency
 * Description:       Bandeau de cookies RGPD, Google Consent Mode v2, badge scroll-up. Propulsé par Orejime.
 * Version:           2.0.0
 * Requires PHP:      7.4
 * Author:            Getup Agency
 * License:           MIT
 * Text Domain:       getup-orejime
 */

if (!defined('ABSPATH')) { exit; }

define('GETUP_OREJIME_VERSION', '2.0.0');
define('GETUP_OREJIME_DIR', plugin_dir_path(__FILE__));
define('GETUP_OREJIME_URL', plugin_dir_url(__FILE__));

require_once GETUP_OREJIME_DIR . 'includes/migrate.php';
require_once GETUP_OREJIME_DIR . 'includes/config.php';
require_once GETUP_OREJIME_DIR . 'includes/frontend.php';
if (is_admin()) {
    require_once GETUP_OREJIME_DIR . 'includes/admin.php';
}

register_activation_hook(__FILE__, static function (): void {
    if (get_option('getup_orejime_privacy_policy_url') === false) {
        add_option('getup_orejime_privacy_policy_url', '/politique-de-confidentialite');
        add_option('getup_orejime_cookie_name', 'getup-cookies');
        add_option('getup_orejime_cookie_duration', 365);
        add_option('getup_orejime_banner_title', 'Cookies maison');
        add_option('getup_orejime_badge_mode', true);
        add_option('getup_orejime_purposes', wp_json_encode([]));
    }
    update_option('getup_orejime_schema_version', '2.0.0');
});
```

`adapters/wordpress/includes/admin.php` — porter l'écran d'options depuis `wp-plugin/getup-orejime/includes/admin.php` du repo `getup-2K26` (353 lignes). Les champs à enregistrer via `register_setting('getup_orejime_settings', …)` sont exactement :

`getup_orejime_privacy_policy_url`, `getup_orejime_cookie_name`, `getup_orejime_cookie_duration`, `getup_orejime_banner_title`, `getup_orejime_logo_url`, `getup_orejime_placement`, `getup_orejime_custom_css`, `getup_orejime_exit_animation`, `getup_orejime_fix_seo_h1`, `getup_orejime_badge_mode`, `getup_orejime_smartlook_key`, `getup_orejime_purposes`.

Soit les douze champs de la 1.4.0 **moins** `getup_orejime_google_consent_mode`, supprimé parce que Consent Mode v2 n'est plus désactivable. Ajouter en tête de page l'avertissement de migration :

```php
add_action('admin_notices', static function (): void {
    if (get_option('getup_orejime_optin_neutralized') !== '1') { return; }
    echo '<div class="notice notice-warning"><p>'
       . esc_html__('Getup Orejime 2.0 : une finalité était activée par défaut. Elle a été repassée en opt-in pour respecter le consentement préalable.', 'getup-orejime')
       . '</p></div>';
});
```

Et positionner ce drapeau depuis l'activation quand une finalité historique portait `default: true`.

- [ ] **Étape 8 : vérifier la syntaxe PHP**

```bash
find adapters/wordpress -name '*.php' -not -path '*/vendor/*' -exec php -l {} \;
```
Attendu : `No syntax errors detected` pour chaque fichier.

- [ ] **Étape 9 : commit**

```bash
git add adapters/wordpress
git commit -m "feat(wordpress): adaptateur fin, sérialisation JSON et migration des options"
```

---

### Tâche 13 : Adaptateur PrestaShop

Même règle de frontière. Les clients PrestaShop reçoivent à cette occasion le badge RGPD, absent de leur thème depuis l'origine (spec §1, constat 2).

**Fichiers :**
- Créer : `adapters/prestashop/getuporejime.php`, `config.xml`, `index.php`, `views/index.php`

**Interfaces :**
- Consomme : `dist/*` (Tâche 10). Reprend la même structure de config que la Tâche 12.
- Produit : rien de consommé par d'autres tâches.

- [ ] **Étape 1 : écrire le module**

`adapters/prestashop/getuporejime.php` :

```php
<?php
/**
 * Getup Orejime — Cookie Consent (RGPD / Consent Mode v2)
 *
 * @author    Getup Agency <contact@getup.agency>
 * @copyright 2026 Getup Agency
 * @license   MIT
 */

if (!defined('_PS_VERSION_')) { exit; }

class GetupOrejime extends Module
{
    private const SIGNALS = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

    public function __construct()
    {
        $this->name = 'getuporejime';
        $this->tab = 'front_office_features';
        $this->version = '2.0.0';
        $this->author = 'Getup Agency';
        $this->need_instance = 0;
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('Getup Orejime — Cookie Consent');
        $this->description = $this->l('Bandeau cookies RGPD avec Google Consent Mode v2, badge scroll-up et thème personnalisable.');
        $this->ps_versions_compliancy = ['min' => '1.7.0.0', 'max' => '9.99.99'];
    }

    public function install(): bool
    {
        return parent::install()
            && $this->registerHook('displayHeader')
            && Configuration::updateValue('GETUPOREJIME_PRIVACY_URL', '/content/2-mentions-legales')
            && Configuration::updateValue('GETUPOREJIME_COOKIE_NAME', 'getup-cookies')
            && Configuration::updateValue('GETUPOREJIME_COOKIE_DURATION', 365)
            && Configuration::updateValue('GETUPOREJIME_BANNER_TITLE', 'Cookies maison')
            && Configuration::updateValue('GETUPOREJIME_BADGE', true)
            && Configuration::updateValue('GETUPOREJIME_PURPOSES', json_encode([]));
    }

    /** Phase 1 puis phase 2, dans cet ordre. */
    public function hookDisplayHeader(): string
    {
        $denied = implode(',', array_map(
            static fn($s) => $s . ':"denied"',
            self::SIGNALS
        ));

        $base = $this->_path . 'views/dist';

        $out = '<script id="getup-orejime-consent-defaults">'
             . 'window.dataLayer=window.dataLayer||[];'
             . 'function gtag(){dataLayer.push(arguments);}'
             . 'gtag("consent","default",{' . $denied . ',wait_for_update:500});'
             . '</script>';

        $out .= '<link rel="stylesheet" href="' . $base . '/theme/tokens.css">';
        $out .= '<link rel="stylesheet" href="' . $base . '/theme/presets/midnight-emerald.css">';

        $customCss = Configuration::get('GETUPOREJIME_CUSTOM_CSS');
        if (!empty($customCss)) {
            $out .= '<style>' . strip_tags($customCss) . '</style>';
        }

        $out .= '<script type="application/json" id="getup-consent-config">'
              . $this->encodeConfig($this->buildConfig($base))
              . '</script>';

        $out .= '<script src="' . $base . '/getup-consent.iife.js" defer></script>';

        return $out;
    }

    private function buildConfig(string $base): array
    {
        $purposes = json_decode((string) Configuration::get('GETUPOREJIME_PURPOSES'), true) ?: [];

        $config = [
            'privacyPolicyUrl' => (string) Configuration::get('GETUPOREJIME_PRIVACY_URL'),
            'assetsBaseUrl' => $base . '/vendor/orejime',
            'cookie' => [
                'name' => (string) Configuration::get('GETUPOREJIME_COOKIE_NAME'),
                'duration' => (int) Configuration::get('GETUPOREJIME_COOKIE_DURATION'),
            ],
            'purposes' => array_values(array_map(static function (array $p): array {
                $cookies = $p['cookies'] ?? '';
                return [
                    'id' => (string) ($p['id'] ?? ''),
                    'title' => (string) ($p['title'] ?? ''),
                    'description' => (string) ($p['description'] ?? ''),
                    'cookies' => is_array($cookies)
                        ? array_values($cookies)
                        : array_values(array_filter(array_map('trim', explode(',', (string) $cookies)), 'strlen')),
                    'default' => false,
                ];
            }, $purposes)),
            'ui' => [
                'badge' => (bool) Configuration::get('GETUPOREJIME_BADGE'),
                'bannerTitle' => (string) Configuration::get('GETUPOREJIME_BANNER_TITLE'),
            ],
        ];

        $smartlook = Configuration::get('GETUPOREJIME_SMARTLOOK_KEY');
        if (!empty($smartlook)) {
            $config['trackers']['smartlook'] = ['key' => (string) $smartlook];
        }

        return $config;
    }

    private function encodeConfig(array $config): string
    {
        return json_encode(
            $config,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE
        );
    }
}
```

Reprendre `getContent()` et le formulaire de configuration depuis la version 1.2.0 (`ps-module/getuporejime/getuporejime.php` du repo `getup-2K26`), en supprimant le champ `GETUPOREJIME_GCM` s'il existe.

`adapters/prestashop/index.php` et `views/index.php` : le fichier de garde PrestaShop habituel.

```php
<?php
header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
header('Location: ../');
exit;
```

- [ ] **Étape 2 : vérifier la syntaxe PHP**

```bash
find adapters/prestashop -name '*.php' -exec php -l {} \;
```
Attendu : `No syntax errors detected` pour chaque fichier.

- [ ] **Étape 3 : vérifier que la config produite est identique en structure à celle de WordPress**

```bash
php -r '
require "adapters/wordpress/includes/migrate.php";
$wp = getup_orejime_migrate_options([]);
echo implode(",", array_keys($wp)), PHP_EOL;
'
```
Attendu : `privacyPolicyUrl,cookie,purposes,ui,theme`. Les clés produites par `buildConfig()` de PrestaShop doivent être un sous-ensemble de celles-ci. Toute clé supplémentaire signale une divergence entre adaptateurs.

- [ ] **Étape 4 : commit**

```bash
git add adapters/prestashop
git commit -m "feat(prestashop): adaptateur fin, badge RGPD enfin livré"
```

---

### Tâche 14 : Zips de release et publication

**Fichiers :**
- Créer : `scripts/build-zips.mjs`, `.github/workflows/release.yml`, `NOTICE`
- Modifier : `package.json` (script `zips`)

**Interfaces :**
- Consomme : `dist/*` (Tâche 10), `adapters/*` (Tâches 12 et 13).
- Produit : `release/getup-orejime-wp.zip`, `release/getup-orejime-ps.zip`.

- [ ] **Étape 1 : écrire la notice de licence**

`NOTICE` :

```
Ce paquet redistribue Orejime (https://github.com/boscop-fr/orejime),
publié sous licence BSD-3-Clause. Le texte intégral de cette licence est
inclus dans vendor/orejime/LICENSE et doit accompagner toute redistribution.

Le code Getup Agency est publié sous licence MIT (voir LICENSE).
```

- [ ] **Étape 2 : écrire le script de packaging**

`scripts/build-zips.mjs` :

```js
import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));

const TARGETS = [
  { name: 'getup-orejime-wp', src: 'adapters/wordpress', slug: 'getup-orejime' },
  { name: 'getup-orejime-ps', src: 'adapters/prestashop', slug: 'getuporejime' }
];

await rm('release', { recursive: true, force: true });
await mkdir('release', { recursive: true });

for (const target of TARGETS) {
  const stage = `release/stage/${target.slug}`;
  await mkdir(stage, { recursive: true });

  await cp(target.src, stage, {
    recursive: true,
    filter: (path) => !path.includes('/vendor/') && !path.includes('/tests') && !path.endsWith('phpunit.xml')
  });

  const distTarget = target.slug === 'getuporejime' ? `${stage}/views/dist` : `${stage}/dist`;
  await cp('dist', distTarget, { recursive: true });
  await cp('NOTICE', `${stage}/NOTICE`);
  await cp('LICENSE', `${stage}/LICENSE`);

  execFileSync('zip', ['-rq', `../../${target.name}.zip`, target.slug], {
    cwd: 'release/stage'
  });
  console.log(`${target.name}.zip — v${version}`);
}

await rm('release/stage', { recursive: true, force: true });
```

Ajouter au `package.json` :

```json
"scripts": { "zips": "npm run build && node scripts/build-zips.mjs" }
```

- [ ] **Étape 3 : lancer et vérifier le contenu des zips**

```bash
npm run zips
unzip -l release/getup-orejime-wp.zip | grep -E 'LICENSE|NOTICE|iife|tokens.css' | head
unzip -l release/getup-orejime-ps.zip | grep -c 'views/dist/vendor/orejime'
```
Attendu : les deux zips contiennent `NOTICE`, `LICENSE`, `dist/getup-consent.iife.js` et `dist/theme/tokens.css`. Le zip PrestaShop place les actifs sous `views/dist/`.

- [ ] **Étape 4 : vérifier qu'aucun `vendor/` PHP ni test ne fuit dans les zips**

```bash
unzip -l release/getup-orejime-wp.zip | grep -cE 'phpunit|/tests/|composer'
```
Attendu : `0`.

- [ ] **Étape 5 : écrire le workflow de release**

`.github/workflows/release.yml` :

```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm test
      - run: npm run zips
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            release/getup-orejime-wp.zip
            release/getup-orejime-ps.zip
```

- [ ] **Étape 6 : commit et publication de la version**

```bash
git add scripts NOTICE .github/workflows/release.yml package.json
git commit -m "build: zips de release WordPress et PrestaShop"
git tag v2.0.0
git push origin main --tags
```

- [ ] **Étape 7 : vérifier la release publiée**

```bash
gh release view v2.0.0
```
Attendu : les deux zips sont attachés et téléchargeables.

---

## Après ce plan

**Chantier 2 — migration de `getup-2K26`**, à planifier une fois la v2.0.0 publiée. Il consiste à installer `github:GetupAgency/getup-consent#v2.0.0`, remplacer les ~300 lignes de `<Script>` de `src/app/layout.tsx` par `consentDefaultsScript()` en phase 1 et `<ConsentManager />` en phase 2, supprimer `public/orejime/`, retirer les deux règles `.orejime-Banner` de `src/design-system/main.scss`, et **corriger au passage la régression de conformité du constat 3** — c'est ce chantier qui la referme réellement en production.

Ses étapes dépendent de l'API effectivement publiée : elles seront écrites après coup, pas maintenant.

**Nettoyage indépendant**, hors périmètre des deux chantiers : suppression de `public/cookie-banner/` (Silktide, référencé nulle part) et de `wp-old/`.
