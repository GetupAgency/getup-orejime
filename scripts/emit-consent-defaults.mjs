/**
 * Émet le script de phase 1 (Consent Mode « default: denied ») comme artefact
 * de build, à partir de l'unique implémentation TypeScript.
 *
 * Spec §4 : « La même fonction génère la chaîne dans les trois cas. » Spec §3 :
 * « aucun adaptateur ne contient de logique de consentement ». Avant cet
 * artefact, la chaîne était recopiée à la main dans frontend.php (WordPress)
 * et getuporejime.php (PrestaShop), avec trois listes de signaux codées en
 * dur : changer `denied` en `granted` dans une seule copie ne cassait aucun
 * test.
 *
 * Deux formats sont écrits, même contenu :
 *   dist/consent-defaults.php  — `return '<script body>';`, consommé par les
 *                                deux adaptateurs PHP (inline en <head>).
 *   dist/consent-defaults.js   — le même corps, exécutable tel quel ; sert la
 *                                fixture E2E et tout consommateur non-PHP qui
 *                                préfère un fichier à une chaîne inline.
 */
import { writeFile } from 'node:fs/promises';
import { consentDefaultsScript, resolveConfig } from '../dist/core/index.js';

// `consentDefaultsScript` n'utilise pas la config (Consent Mode est figé à
// `denied` sur les quatre signaux, spec §5) mais exige un ResolvedConfig.
const script = consentDefaultsScript(
  resolveConfig({
    privacyPolicyUrl: '/',
    purposes: [{ id: 'analytics', title: 'A', description: 'A', cookies: [], default: false }]
  })
);

const banner = 'Généré par scripts/emit-consent-defaults.mjs — NE PAS ÉDITER.';

const phpLiteral = "'" + script.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

await writeFile(
  'dist/consent-defaults.php',
  `<?php\n// ${banner}\n// Source : src/core/consent-mode.ts (consentDefaultsScript).\nreturn ${phpLiteral};\n`
);

await writeFile('dist/consent-defaults.js', `/* ${banner} */\n${script}\n`);

console.log('dist/consent-defaults.{php,js} — phase 1 émise depuis consentDefaultsScript()');
