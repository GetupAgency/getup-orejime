# Extraction du module de consentement — Design

**Date** : 2026-08-18
**Statut** : validé, prêt pour plan d'implémentation
**Portée** : sortir le module de consentement de `getup-2K26` vers un repo dédié réutilisable sur les sites clients (WordPress, PrestaShop, Next.js).

Ce document est écrit dans `getup-2K26` faute de repo cible existant. Il sera copié dans `getup-consent` à sa création et y deviendra la source de vérité.

## 1. Contexte

Le module existe aujourd'hui en trois exemplaires indépendants, tous construits sur [Orejime](https://github.com/boscop-fr/orejime) 3.1.0 :

| Cible | Emplacement actuel | Version |
|---|---|---|
| WordPress | `wp-plugin/getup-orejime/` | 1.4.0 |
| PrestaShop | `ps-module/getuporejime/` | 1.2.0 |
| Next.js | `src/app/layout.tsx` (~300 lignes de `<Script>` inline) | — |

`wp-old/getup-orejime/` est l'ancienne 1.0.0, conservée sans usage.

### Constats d'audit

Quatre faits établis pendant l'exploration, qui motivent le design :

1. **Le bundle Orejime est vendoré trois fois.** `public/orejime/orejime-standard-fr.js` et `.css` sont identiques au bit près au paquet npm `orejime@3.1.0`, déjà présent dans `package.json` mais jamais importé. Les trois copies sont identiques entre elles.

2. **Le thème PrestaShop est en retard, pas divergent.** 457 lignes contre 629 côté Next/WordPress. Ce qui manque est le bloc badge RGPD complet (~145 lignes) et les variantes de placement. Aucun sélecteur spécifique à PrestaShop n'existe nulle part : la version Next/WP est un sur-ensemble strict. **Les clients PrestaShop n'ont jamais reçu la fonctionnalité badge.**

3. **Régression de conformité sur `getup-2K26`.** `src/app/layout.tsx:151` émet `analytics_storage: 'granted'` et la finalité `analytics` est déclarée `default: true`. Les deux adaptateurs PHP émettent `'denied'` avec `default => false`. Conséquence : Google Analytics **et l'enregistrement de session Smartlook** démarrent avant toute action du visiteur, le `check()` du chargeur Smartlook passant puisque `getConsent('analytics')` renvoie déjà `true`. Le commentaire du code annonce l'inverse de ce que le code fait.

4. **Asymétrie accepter/refuser sur le badge.** « OK pour moi » accepte tout en un clic ; refuser exige de passer par « En savoir plus » puis la bannière complète. C'est le motif que la CNIL sanctionne.

Les points 2, 3 et 4 partagent une cause unique : le comportement réglementaire est dupliqué dans trois langages. Un correctif demande trois écritures, et l'une des trois a déjà décroché.

### Objectif

Une seule implémentation du comportement de consentement, consommée par trois adaptateurs fins, distribuée en zips depuis un repo privé.

## 2. Décisions actées

| Sujet | Décision |
|---|---|
| Cibles | Les trois (WordPress, PrestaShop, Next/JS), cœur commun partagé |
| Distribution | Repo GitHub privé, zips générés par CI sur tag, install npm par URL git |
| `getup-2K26` | Migre pour consommer le paquet — sert de premier consommateur réel |
| Thématisation | Tokenisation CSS complète ; « Midnight Emerald » devient un preset |

## 3. Architecture

Un seul paquet npm à la racine, avec sous-chemins d'export. Un monorepo à paquets publiés séparément imposerait un registre privé, ce que la décision « aucun compte externe » exclut.

```
getup-consent/
├── package.json          @getup/consent — exports ./core, ./react, ./theme
├── src/
│   ├── core/             TypeScript, aucune dépendance framework
│   │   ├── config.ts     schéma, défauts conformes, validation
│   │   ├── consent-mode.ts   mapping finalités → Consent Mode v2
│   │   ├── trackers.ts   chargeurs conditionnels (GTM lazy, Smartlook)
│   │   ├── badge.ts      badge RGPD scroll-up
│   │   ├── a11y.ts       correctif H1→P, animations de sortie
│   │   └── index.ts      consentDefaultsScript() + initConsent()
│   ├── react/            <ConsentManager config={…} />
│   └── theme/
│       ├── tokens.css    ~35 variables, aucun hex en dur
│       └── presets/      midnight-emerald.css, …
├── adapters/
│   ├── wordpress/        PHP : écran d'options + sérialisation de config
│   └── prestashop/       PHP : idem
└── scripts/build-zips.mjs
```

**Règle de frontière** : aucun adaptateur ne contient de logique de consentement. Un adaptateur sait rendre un formulaire d'options et sérialiser un objet de config en JSON. Rien d'autre. Toute logique qui apparaîtrait dans un `.php` est un défaut de conception.

Orejime redevient une dépendance npm normale (`^3.1.0`) ; son `dist` est copié au build. Les trois bundles vendorés sortent du versionnage.

### Contrainte amont

Le paquet `orejime` n'expose **aucune entrée module** — pas de `main`, pas d'`exports`, pas de types. Il ne livre que des bundles navigateur qui s'auto-initialisent depuis `window.orejimeConfig` et exposent `window.orejime`. Le cœur ne peut donc pas l'importer ; il l'injecte comme `<script>` et s'accroche à son `onload`.

Contrepartie favorable : 14 locales sont livrées (`orejime-standard-<lang>.js`), donc le multilingue est disponible sans travail supplémentaire.

## 4. Interface publique

```ts
// Phase 1 — chaîne à inliner en <head>, synchrone, avant toute balise.
// Aucun accès DOM, aucune dépendance.
consentDefaultsScript(config: ConsentConfig): string

// Phase 2 — après interactive. Point d'entrée unique.
initConsent(config: ConsentConfig): Promise<ConsentApi>
```

Le découpage en deux phases est imposé par la conformité : les signaux Consent Mode par défaut doivent partir avant toute balise, le reste peut être différé.

| Cible | Phase 1 | Phase 2 |
|---|---|---|
| Next.js | `<script dangerouslySetInnerHTML>` | `<ConsentManager />` |
| WordPress | `wp_head` priorité 1 | `wp_footer` |
| PrestaShop | hook `displayHeader` | idem |

La même fonction génère la chaîne dans les trois cas.

### Suppression du polling

Le code actuel comporte quatre boucles `setTimeout` indépendantes qui attendent `window.orejime` (200 ms, 300 ms…). `initConsent` injectant lui-même le script, il utilise son `onload` : `window.orejime` est garanti présent ensuite. Une promesse remplace les quatre boucles.

### Schéma de config

```ts
type ConsentConfig = {
  privacyPolicyUrl: string            // requis
  locale?: 'fr' | 'en' | …            // défaut 'fr', 14 disponibles
  cookie?: { name?: string; duration?: number }   // défaut 'getup-cookies' / 365
  purposes: Purpose[]
  trackers?: {
    gtm?: { id: string; lazy?: boolean }
    smartlook?: { key: string; region?: string }
  }
  ui?: {
    badge?: boolean; exitAnimation?: boolean; fixSeoH1?: boolean
    placement?: 'bottom-right' | 'bottom-left' | …
    logo?: string; bannerTitle?: string
  }
  theme?: { preset?: 'midnight-emerald' | …; customCss?: string }
}

type Purpose = {
  id: string
  title: string
  description: string
  cookies: (string | RegExp)[]
  default: false                      // typé littéral
  unsafeDefaultOptIn?: true           // échappatoire explicite
}
```

`purposes` ne déclare que les finalités soumises à consentement. Les cookies strictement nécessaires ne sont pas déclarés comme finalité : ils n'ont pas à être consentis, donc `default: false` s'applique sans exception à toutes les entrées du tableau.

La clé Smartlook, aujourd'hui codée en dur dans `layout.tsx:290`, passe en config.

## 5. Garanties de conformité

Le design rend structurellement impossible la reproduction des constats 3 et 4.

- **`Purpose.default` est typé `false`.** Activer une finalité non essentielle par défaut exige `unsafeDefaultOptIn: true`, qui déclenche un avertissement console visible. Le nom du champ énonce ce qu'il fait. La régression de `getup-2K26` ne peut plus survenir par inadvertance.
- **Consent Mode est figé à `denied`** sur les quatre signaux (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`), non paramétrable.
- **Le badge gagne un bouton « Tout refuser »** à côté de « OK pour moi ». Un clic pour accepter, un clic pour refuser.
- **Smartlook reste conditionné au consentement analytics**, et ne s'initialise qu'une fois malgré les `update` répétés.

## 6. Robustesse

**Échec fermé, sans exception.** Si le bundle Orejime ne charge pas — réseau, bloqueur de contenu, CSP restrictive chez un client —, les défauts `denied` sont déjà partis et rien ne les met à jour. Aucun tracker ne démarre. La bannière n'apparaît pas et le visiteur n'est pas pisté : dégradé, mais conforme.

`initConsent` ne rejette jamais sa promesse vers l'appelant ; en cas d'échec elle journalise et retourne un `ConsentApi` inerte. **Un module de consentement ne doit jamais casser le site hôte.**

**Sérialisation.** Le PHP actuel assemble le JSON à la main champ par champ avec `esc_js` ; le Next embarque ses accents sous forme de séquences `\\u00e9` écrites à la main dans le littéral de gabarit. Les deux sont remplacés par une sérialisation `json_encode` avec `JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT`, seule méthode correcte d'injection d'un objet dans un `<script>` inline. Les accents redeviennent du texte normal.

## 7. Migration

**Aucun visiteur re-sollicité.** Orejime reste en 3.1.0 et le nom de cookie `getup-cookies` est préservé : le format du cookie ne change pas, les consentements déjà enregistrés restent valides.

**Aucun client ne reconfigure.** Les clés d'options existantes (`getup_orejime_*` en WordPress, `GETUPOREJIME_*` en PrestaShop) sont lues telles quelles et remappées vers la structure imbriquée par une routine de migration exécutée à l'activation.

**Réconciliation du thème.** La version Next/WordPress (629 lignes) est adoptée telle quelle comme base de tokenisation, étant un sur-ensemble strict. Les clients PrestaShop reçoivent le badge RGPD pour la première fois.

**Versionnage unifié.** WordPress 1.4.0 et PrestaShop 1.2.0 décrivent le même produit — c'est ce décalage qui a permis la dérive. Version unique pour les trois cibles à partir de **2.0.0** ; le majeur est justifié par le changement de structure de config.

## 8. Distribution

Un tag `v2.0.0` déclenche la CI :

1. build du cœur et du thème
2. copie du `dist` Orejime
3. génération de `getup-orejime-wp.zip` et `getup-orejime-ps.zip`
4. attachement à la release GitHub

Orejime est sous **BSD-3-Clause** (le code Getup est en MIT). Sa notice de copyright et son disclaimer doivent être embarqués dans chaque zip redistribué — obligation de la licence, à traiter dans `build-zips.mjs`.

Le consommateur Next installe via `npm i github:GetupAgency/getup-orejime#v2.0.0` ; npm exécute le script `prepare`, qui build. Aucun registre, aucun compte.

## 9. Tests

**Le test prioritaire** : aucune requête tracker ne part avant consentement. C'est la régression du constat 3, passée inaperçue plusieurs mois, et la seule qui porte un risque légal. Testée en Playwright sur une page réelle, par observation du réseau — sans mock :

1. page chargée, aucune interaction → zéro requête vers `googletagmanager.com` et `smartlook.com`
2. clic « Tout refuser » → toujours zéro
3. clic « OK pour moi » → les deux partent, et `dataLayer` contient un `consent update` en `granted`

Ces trois assertions verrouillent le comportement réglementaire des trois cibles à la fois, puisqu'elles portent sur le bundle commun.

**Vitest + jsdom pour le cœur**, en TDD, sur les unités porteuses de logique :

- `consent-mode` — mapping finalités → les quatre signaux Google, dans les deux sens
- `config` — refuse `default: true` sans échappatoire, applique les défauts, valide le requis
- `trackers` — Smartlook inactif sans consentement analytics ; initialisé une seule fois malgré les `update` répétés
- `badge` — les deux boutons produisent accepter-tout et refuser-tout
- résilience — script Orejime en échec → API inerte, aucune exception propagée

**PHP** : les adaptateurs étant fins, deux points seulement portent de la logique — la sérialisation de config (JSON valide et échappé) et la routine de migration des clés d'options. Le reste est du formulaire ; `php -l` en CI suffit.

**Pas de tests CSS.** La tokenisation se vérifie visuellement, et un test de valeur de couleur casse à chaque retouche de design.

## 10. Hors périmètre

- Publication sur npm public, WordPress.org ou PrestaShop Addons
- Presets de thèmes multiples au-delà de « Midnight Emerald » (la tokenisation les rend triviaux plus tard)
- Interface d'administration partagée entre WordPress et PrestaShop
- Remplacement d'Orejime par un autre moteur de CMP
- Suppression de `public/cookie-banner/` (Silktide, non référencé) et de `wp-old/` — nettoyage à part, sans lien avec l'extraction

## 11. Suite

Plan d'implémentation via le skill `writing-plans`. Deux chantiers, dans cet ordre : création et publication du repo `getup-consent` en 2.0.0, puis migration de `getup-2K26` pour le consommer.
