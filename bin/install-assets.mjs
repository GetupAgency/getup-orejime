#!/usr/bin/env node
/**
 * Copie les actifs statiques dont le module a besoin à l'exécution vers le
 * dossier public du projet consommateur.
 *
 * `loader.ts` va chercher `<assetsBaseUrl>/orejime-standard.css` et
 * `<assetsBaseUrl>/orejime-standard-<locale>.js` à une URL publique. Ni Next
 * ni Astro ne servent `node_modules`, donc ces fichiers doivent être copiés.
 *
 *   npx getup-consent-assets                    → public/orejime, locale fr
 *   npx getup-consent-assets --locales fr,en
 *   npx getup-consent-assets --locales all
 *   npx getup-consent-assets --dest static/orejime   (Astro sans dossier public)
 */
import { cp, mkdir, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(pkgRoot, 'dist');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dest = path.resolve(process.cwd(), arg('dest', 'public/orejime'));
const locales = arg('locales', 'fr');

try {
  await access(dist);
} catch {
  console.error(
    `[getup-consent] dist/ introuvable dans ${pkgRoot}.\n` +
    `Le paquet n'a pas été construit — lancez \`npm run build\` dans le module.`
  );
  process.exit(1);
}

const vendor = path.join(dist, 'vendor', 'orejime');
const available = (await readdir(vendor))
  // Les bundles `dsfr` (thème de l'État français) ne sont jamais demandés par
  // loader.ts, qui ne construit que des URL `orejime-standard-*`. Les copier
  // ajouterait ~500 Ko d'actifs morts au dossier public.
  .filter((f) => f.startsWith('orejime-standard-') && f.endsWith('.js'))
  .map((f) => f.slice('orejime-standard-'.length, -'.js'.length));

const wanted = locales === 'all'
  ? available
  : locales.split(',').map((l) => l.trim()).filter(Boolean);

const unknown = wanted.filter((l) => !available.includes(l));
if (unknown.length) {
  console.error(
    `[getup-consent] Locale(s) inconnue(s) : ${unknown.join(', ')}\n` +
    `Disponibles : ${available.sort().join(', ')}`
  );
  process.exit(1);
}

await mkdir(dest, { recursive: true });

const copied = [];
async function copy(from, name) {
  await cp(from, path.join(dest, name));
  copied.push(name);
}

await copy(path.join(vendor, 'orejime-standard.css'), 'orejime-standard.css');
for (const locale of wanted) {
  const name = `orejime-standard-${locale}.js`;
  await copy(path.join(vendor, name), name);
}
await copy(path.join(dist, 'theme', 'tokens.css'), 'tokens.css');
for (const preset of await readdir(path.join(dist, 'theme', 'presets'))) {
  await copy(path.join(dist, 'theme', 'presets', preset), preset);
}
// La licence BSD-3-Clause d'Orejime accompagne le bundle redistribué.
await copy(path.join(vendor, 'LICENSE'), 'LICENSE-orejime.txt');

const rel = path.relative(process.cwd(), dest) || '.';
console.log(`[getup-consent] ${copied.length} fichiers copiés vers ${rel}/`);
console.log(`  locales : ${wanted.join(', ')}`);
console.log(`  pensez à servir ce dossier à l'URL déclarée dans assetsBaseUrl (défaut : /orejime)`);
