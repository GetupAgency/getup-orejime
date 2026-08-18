# @getup/consent

Module de gestion du consentement RGPD, réutilisable sur les sites de l'agence.
Un cœur TypeScript unique, consommé par trois cibles : npm/React, WordPress et
PrestaShop. Construit sur [Orejime](https://github.com/boscop-fr/orejime).

## Ce que c'est, et ce que ce n'est pas

C'est une **bibliothèque et deux plugins**. Il n'y a ni serveur, ni application
web, ni interface à héberger — **aucun nom de domaine n'est nécessaire.**

Ce qui s'affiche vit ailleurs : le bandeau et le badge dans le navigateur du
visiteur, l'écran de réglages dans le `wp-admin` du client, le formulaire dans
le back-office PrestaShop.

## Garanties

Ces quatre points sont des obligations, pas des choix d'implémentation. Ils sont
tenus par des tests, et la CI échoue si l'un d'eux cède.

- **Aucune finalité non essentielle n'est accordée par défaut.** `Purpose.default`
  est typé littéral `false` ; pré-accorder une finalité exige un
  `unsafeDefaultGranted` explicite et
  déclenche un avertissement console.
- **Consent Mode v2 refuse les quatre signaux par défaut**, de façon synchrone
  dans le `<head>`, avant toute balise. Non paramétrable.
- **Refuser est aussi simple qu'accepter** — un clic chacun, au même niveau
  d'interface, et de poids visuel équivalent une fois rendu.
- **Le module ne casse jamais le site hôte.** En cas d'échec, il rend une API
  inerte et le suivi reste refusé.

Trois tests de bout en bout en navigateur réel verrouillent le comportement
réglementaire : aucune requête vers `googletagmanager.com` ou `smartlook.com`
avant consentement, aucune après un refus, les deux après une acceptation.

## Installation

```bash
npm i github:GetupAgency/getup-orejime#main   # #v2.0.0 une fois le tag posé
```

npm exécute `prepare`, qui construit `dist/`. Aucun registre, aucun compte.

### Actifs statiques

Le module va chercher `<assetsBaseUrl>/orejime-standard.css` et
`<assetsBaseUrl>/orejime-standard-<locale>.js` à une **URL publique**. Ni Next ni
Astro ne servent `node_modules` : il faut copier ces fichiers.

```bash
npx getup-consent-assets                          # → public/orejime, locale fr
npx getup-consent-assets --locales fr,en
npx getup-consent-assets --dest static/orejime    # Astro sans dossier public
```

Le script ne copie que les locales demandées et ignore les variantes `dsfr`, que
le chargeur ne demande jamais : 100 Ko en `fr` contre 568 Ko pour tout.
Branchez-le sur `predev` et `prebuild` pour qu'il ne soit jamais oublié.

## Next.js (App Router)

**Attention à une subtilité :** les `cookies` d'une finalité acceptent des
`RegExp`, qui ne traversent pas la frontière serveur/client. Passer la config en
prop depuis un composant serveur fait échouer Next avec *« Only plain objects can
be passed to Client Components »*. Le composant client doit donc **importer** la
config, pas la recevoir.

`consent.config.ts` — partagé, sans directive :

```ts
import type { ConsentConfig } from '@getup/consent/core';

export const consentConfig: ConsentConfig = {
  privacyPolicyUrl: '/confidentialite',
  locale: 'fr',
  trackers: { gtm: { id: 'G-XXXXXXX' } },
  ui: { badge: true, bannerTitle: 'Cookies maison' },
  purposes: [
    { id: 'analytics', title: 'Google Analytics', description: '…',
      cookies: ['_ga', /^_ga_/, '_gid'], default: false },
    { id: 'advertising', title: 'Publicité', description: '…',
      cookies: [/^_gcl_/, '_fbp'], default: false },
  ],
};
```

`consent.tsx` :

```tsx
'use client';
import { ConsentManager } from '@getup/consent/react';
import { consentConfig } from './consent.config';

export function Consent() { return <ConsentManager config={consentConfig} />; }
```

`layout.tsx` :

```tsx
import { consentDefaultsScript, resolveConfig } from '@getup/consent/core';
import { consentConfig } from './consent.config';
import { Consent } from './consent';

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* Phase 1 — synchrone, AVANT toute balise de mesure */}
        <script dangerouslySetInnerHTML={{ __html: consentDefaultsScript(resolveConfig(consentConfig)) }} />
        <link rel="stylesheet" href="/orejime/tokens.css" />
        <link rel="stylesheet" href="/orejime/midnight-emerald.css" />
      </head>
      <body>
        <Consent />
        {children}
      </body>
    </html>
  );
}
```

## Astro

Pas besoin de React.

```astro
---
import { consentDefaultsScript, resolveConfig } from '@getup/consent/core';
import { consentConfig } from '../consent.config';
const phase1 = consentDefaultsScript(resolveConfig(consentConfig));
---
<html lang="fr">
  <head>
    <script is:inline set:html={phase1} />
    <link rel="stylesheet" href="/orejime/tokens.css" />
    <link rel="stylesheet" href="/orejime/midnight-emerald.css" />
  </head>
  <body>
    <slot />
    <script>
      import { initConsent } from '@getup/consent/core';
      import { consentConfig } from '../consent.config';
      initConsent(consentConfig);
    </script>
  </body>
</html>
```

Le `is:inline` sur la phase 1 est **obligatoire** : sans lui Astro bundle et
diffère le script, et les défauts `denied` partiraient après les balises qu'ils
sont censés précéder. Le second `<script>` doit rester bundlé — c'est la phase 2,
elle a le droit d'attendre.

## WordPress et PrestaShop

Les zips sont produits par la CI de release sur un tag `v*`, ou localement :

```bash
npm run zips   # → release/getup-orejime-wp.zip, release/getup-orejime-ps.zip
```

Ils s'installent comme n'importe quel plugin ou module. Les réglages d'une
installation 1.x sont migrés automatiquement : le nom de cookie et sa durée sont
préservés, donc **les visiteurs ayant déjà consenti ne sont pas re-sollicités**.

## Revenir sur son choix

L'article 7.3 du RGPD exige que retirer son consentement soit aussi simple que
de le donner. Posez ce bouton où vous voulez — typiquement en pied de page :

```html
<button data-getup-consent="open">Gérer mes cookies</button>
```

C'est tout. Le module écoute les clics par délégation, donc **aucun JavaScript
côté site**, et le même attribut fonctionne à l'identique sur Next, Astro,
WordPress et PrestaShop. Le déclencheur peut être rendu après l'initialisation
(pied de page hydraté tardivement, navigation côté client) : il fonctionnera
quand même.

Pour piloter à la main, `initConsent()` retourne une `ConsentApi` :

```ts
const api = await initConsent(consentConfig);
api.openPreferences();      // ouvre la modale
api.acceptAll();            // ou declineAll()
api.getConsent('analytics');
```

Les cibles sans import ESM (WordPress, PrestaShop) la retrouvent sur
`window.GetupConsent.api`, publiée une fois l'initialisation terminée.

## Configuration

| Clé | Défaut | Rôle |
|---|---|---|
| `privacyPolicyUrl` | *requis* | Lien vers la politique de confidentialité |
| `locale` | `fr` | 14 locales disponibles |
| `cookie.name` / `.duration` | `getup-cookies` / `365` | **Ne pas changer** sur un site existant |
| `purposes[]` | *requis* | `id`, `title`, `description`, `cookies`, `default: false` |
| `trackers.gtm` | — | `{ id, lazy, purposeId }` — ne se charge qu'après consentement |
| `trackers.smartlook` | — | `{ key, region, purposeId }` — idem |
| `trackers.*.purposeId` | `analytics` | Finalité qui commande le chargement du traceur |
| `ui.badge` | `true` | Badge scroll-up plutôt que bandeau permanent |
| `ui.placement` | `bottom-right` | `bottom-right` \| `bottom-left` |
| `ui.exitAnimation` / `.fixSeoH1` | `true` | Animations de sortie, correctif du H1 dupliqué |
| `theme.preset` | `midnight-emerald` | |
| `assetsBaseUrl` | `/orejime` | Où sont servis les actifs copiés ci-dessus |

## Limites connues

- **Les back-offices WordPress et PrestaShop n'exposent pas `purposeId`.** Un
  client dont la finalité ne s'appelle pas `analytics` doit la renommer ainsi ;
  le module l'avertit désormais en console au lieu de rester inerte en silence.
- **Révoquer son consentement n'arrête pas un enregistreur déjà chargé** avant
  rechargement de la page.
- **PrestaShop n'expose ni `placement`, ni `exitAnimation`, ni `fixSeoH1`** dans
  son formulaire de configuration.
- **L'ordre du hook `displayHeader` de PrestaShop n'est pas épinglé.** WordPress
  force la priorité 1 ; côté PrestaShop, une boutique disposant d'un module de
  tag management doit vérifier dans *Modules > Positions* que GetupOrejime passe
  en premier — le script de phase 1 n'a de sens que s'il précède les balises.

## Avant de déployer chez un client existant

- Les sites configurés avec `ui.badge: false` ne présentaient en réalité
  **aucune interface de consentement**. Ils afficheront désormais le bandeau
  Orejime. C'est la correction d'un défaut, mais c'est un changement visible.
- Enregistrer les réglages efface la trace historique d'une finalité qui était
  en opt-in. Le comportement, lui, était déjà neutralisé.

## Développement

```bash
npm test                  # 87 tests unitaires (Vitest + jsdom)
npx playwright test       # 10 tests de bout en bout (Chromium réel)
npm run build             # dist/ : ESM + types, bundle IIFE, thème, actifs Orejime
npm run zips              # les deux zips installables
cd adapters/wordpress && vendor/bin/phpunit    # 15 tests PHP
```

Le script de phase 1 a **une seule source** : `consentDefaultsScript()`. Le build
en émet un artefact que les deux adaptateurs PHP consomment, et
`scripts/check-consent-defaults.mjs` échoue si une copie réapparaît quelque part.

## Licences

Code Getup Agency : MIT (`LICENSE`).
Orejime, redistribué avec ce paquet : BSD-3-Clause (`NOTICE`, et
`dist/vendor/orejime/LICENSE`).
