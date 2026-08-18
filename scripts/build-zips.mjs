import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));

const TARGETS = [
  { name: 'getup-orejime-wp', src: 'adapters/wordpress', slug: 'getup-orejime' },
  { name: 'getup-orejime-ps', src: 'adapters/prestashop', slug: 'getuporejime' }
];

const EXCLUDED_BASENAMES = new Set(['composer.json', 'composer.lock']);

function isExcluded(path) {
  if (path.includes('/vendor/') || path.endsWith('/vendor')) return true;
  if (path.includes('/tests')) return true;
  const basename = path.split('/').pop();
  if (basename.toLowerCase().includes('phpunit')) return true;
  return EXCLUDED_BASENAMES.has(basename);
}

await rm('release', { recursive: true, force: true });
await mkdir('release', { recursive: true });

for (const target of TARGETS) {
  const stage = `release/stage/${target.slug}`;
  await mkdir(stage, { recursive: true });

  await cp(target.src, stage, {
    recursive: true,
    filter: (path) => !isExcluded(path)
  });

  const distTarget = target.slug === 'getuporejime' ? `${stage}/views/dist` : `${stage}/dist`;
  await cp('dist', distTarget, { recursive: true });
  await cp('NOTICE', `${stage}/NOTICE`);
  await cp('LICENSE', `${stage}/LICENSE`);

  execFileSync('zip', ['-rq', `../${target.name}.zip`, target.slug], {
    cwd: 'release/stage'
  });
  console.log(`${target.name}.zip — v${version}`);
}

await rm('release/stage', { recursive: true, force: true });
