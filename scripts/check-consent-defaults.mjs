/**
 * Garde anti-dérive du script de phase 1.
 *
 * La chaîne Consent Mode « default: denied » a une seule source :
 * `consentDefaultsScript()` dans src/core/consent-mode.ts, émise au build
 * dans dist/consent-defaults.{php,js} par scripts/emit-consent-defaults.mjs.
 *
 * Ce module échoue si :
 *   1. un fichier PHP d'adaptateur réintroduit une copie du script de phase 1
 *      (liste de signaux, `gtag("consent","default"…)`, `wait_for_update`) ;
 *   2. un adaptateur cesse de consommer l'artefact partagé ;
 *   3. l'artefact généré (si dist/ a été construit) ne correspond plus à la
 *      sortie de consentDefaultsScript().
 *
 * Utilisé à la fois par un test Vitest (src/core/phase1-single-source.test.ts)
 * et directement en CI (`node scripts/check-consent-defaults.mjs`), pour que
 * le job PHP, qui n'exécute pas Vitest, applique la même garde.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Marqueurs qui ne peuvent apparaître que dans une copie du script de phase 1. */
const FORBIDDEN = [
  { name: 'commande gtag consent/default', re: /gtag\s*\(\s*["']consent["']\s*,\s*["']default["']/ },
  { name: 'wait_for_update', re: /wait_for_update/ },
  { name: 'signal Consent Mode en dur', re: /analytics_storage|ad_user_data|ad_personalization/ },
  { name: 'shim gtag', re: /function\s+gtag\s*\(\s*\)\s*\{\s*dataLayer\.push/ }
];

/** Adaptateurs et fichier attendu comme consommateur de l'artefact partagé. */
const ADAPTER_ENTRYPOINTS = [
  'adapters/wordpress/includes/frontend.php',
  'adapters/prestashop/getuporejime.php'
];

const ARTIFACT_REFERENCE = 'consent-defaults.php';

async function phpFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'vendor' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await phpFiles(full)));
    else if (entry.name.endsWith('.php')) out.push(full);
  }
  return out;
}

/**
 * @param {{ expectedScript?: string }} [options] chaîne attendue, fournie par
 *   l'appelant qui sait l'obtenir (le test Vitest importe la source TS ; la CI
 *   la lit dans l'artefact construit).
 * @returns {Promise<string[]>} liste de problèmes, vide si tout va bien.
 */
export async function checkConsentDefaults(options = {}) {
  const problems = [];

  for (const file of await phpFiles(path.join(ROOT, 'adapters'))) {
    const source = await readFile(file, 'utf8');
    for (const { name, re } of FORBIDDEN) {
      if (re.test(source)) {
        problems.push(
          `${path.relative(ROOT, file)} : copie du script de phase 1 détectée (${name}). ` +
          `La chaîne doit venir de dist/consent-defaults.php, généré depuis ` +
          `consentDefaultsScript() (src/core/consent-mode.ts).`
        );
      }
    }
  }

  for (const entry of ADAPTER_ENTRYPOINTS) {
    const source = await readFile(path.join(ROOT, entry), 'utf8');
    if (!source.includes(ARTIFACT_REFERENCE)) {
      problems.push(
        `${entry} : ne consomme plus l'artefact partagé ${ARTIFACT_REFERENCE}.`
      );
    }
  }

  const artifactPhp = path.join(ROOT, 'dist', 'consent-defaults.php');
  const artifactJs = path.join(ROOT, 'dist', 'consent-defaults.js');
  if (options.expectedScript && existsSync(artifactPhp)) {
    const php = await readFile(artifactPhp, 'utf8');
    const expectedLiteral =
      "'" + options.expectedScript.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    if (!php.includes(`return ${expectedLiteral};`)) {
      problems.push(
        'dist/consent-defaults.php ne correspond pas à la sortie de consentDefaultsScript().'
      );
    }
    if (existsSync(artifactJs)) {
      const js = await readFile(artifactJs, 'utf8');
      if (!js.includes(options.expectedScript)) {
        problems.push(
          'dist/consent-defaults.js ne correspond pas à la sortie de consentDefaultsScript().'
        );
      }
    } else {
      problems.push('dist/consent-defaults.js manquant alors que dist/ est construit.');
    }
  }

  if (options.requireArtifact) {
    for (const artifact of [artifactPhp, artifactJs]) {
      if (!existsSync(artifact)) {
        problems.push(`${path.relative(ROOT, artifact)} manquant : le build ne l'a pas émis.`);
      } else if ((await stat(artifact)).size === 0) {
        problems.push(`${path.relative(ROOT, artifact)} est vide.`);
      }
    }
  }

  return problems;
}

// Exécution directe (CI).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requireArtifact = process.argv.includes('--require-artifact');
  let expectedScript;
  if (existsSync(path.join(ROOT, 'dist', 'core', 'index.js'))) {
    const { consentDefaultsScript, resolveConfig } = await import('../dist/core/index.js');
    expectedScript = consentDefaultsScript(
      resolveConfig({
        privacyPolicyUrl: '/',
        purposes: [{ id: 'analytics', title: 'A', description: 'A', cookies: [], default: false }]
      })
    );
  }
  const problems = await checkConsentDefaults({ expectedScript, requireArtifact });
  if (problems.length > 0) {
    console.error('Dérive du script de phase 1 :');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('Script de phase 1 : source unique confirmée.');
}
