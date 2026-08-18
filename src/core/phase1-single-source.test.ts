import { describe, it, expect } from 'vitest';
import { resolveConfig } from './config';
import { consentDefaultsScript } from './consent-mode';
// @ts-expect-error — script de build en .mjs, sans déclaration de types.
import { checkConsentDefaults } from '../../scripts/check-consent-defaults.mjs';

/**
 * Régression auditée : le script de phase 1 existait en trois copies écrites
 * à la main (src/core/consent-mode.ts, adapters/wordpress/includes/frontend.php,
 * adapters/prestashop/getuporejime.php), avec trois listes de signaux codées
 * en dur. Changer `denied` en `granted` dans une seule copie ne faisait échouer
 * aucun test du dépôt.
 *
 * Ce test est la garde demandée : il échoue dès qu'un adaptateur PHP
 * réintroduit une copie du script, ou cesse de consommer l'artefact généré
 * au build depuis `consentDefaultsScript()`.
 */
describe('script de phase 1 — source unique', () => {
  const expectedScript = consentDefaultsScript(
    resolveConfig({
      privacyPolicyUrl: '/',
      purposes: [{ id: 'analytics', title: 'A', description: 'A', cookies: [], default: false }]
    })
  );

  it("aucun adaptateur ne contient de copie du script, tous consomment l'artefact", async () => {
    const problems: string[] = await checkConsentDefaults({ expectedScript });
    expect(problems).toEqual([]);
  });

  it('la chaîne de référence refuse les quatre signaux', () => {
    expect(expectedScript).toContain('analytics_storage:"denied"');
    expect(expectedScript).toContain('ad_storage:"denied"');
    expect(expectedScript).toContain('ad_user_data:"denied"');
    expect(expectedScript).toContain('ad_personalization:"denied"');
    expect(expectedScript).not.toContain('granted');
  });
});
