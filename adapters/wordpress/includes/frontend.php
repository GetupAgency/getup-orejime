<?php
if (!defined('ABSPATH')) { exit; }

require_once GETUP_OREJIME_DIR . 'includes/config.php';

add_action('wp_head', 'getup_orejime_consent_defaults', 1);
add_action('wp_enqueue_scripts', 'getup_orejime_enqueue', 99);
add_action('wp_footer', 'getup_orejime_print_config', 5);

/**
 * Corps du script de phase 1, lu depuis l'artefact généré au build.
 *
 * Source unique : consentDefaultsScript() (src/core/consent-mode.ts), émise
 * dans dist/consent-defaults.php par scripts/emit-consent-defaults.mjs.
 * L'adaptateur ne contient aucune logique de consentement (docs/design.md §3)
 * et ne redit pas la liste des signaux : la garde
 * scripts/check-consent-defaults.mjs échoue si une copie réapparaît ici.
 *
 * Retourne une chaîne vide si l'artefact est absent — un plugin sans dist/
 * n'a de toute façon ni bundle ni thème ; mieux vaut ne rien émettre qu'un
 * fatal sur le site hôte.
 */
function getup_orejime_consent_defaults_script(): string
{
    $file = GETUP_OREJIME_DIR . 'dist/consent-defaults.php';

    return is_readable($file) ? (string) require $file : '';
}

/** Phase 1 — doit précéder toute balise de mesure. */
function getup_orejime_consent_defaults(): void
{
    $script = getup_orejime_consent_defaults_script();
    if ($script === '') {
        return;
    }

    echo '<script id="getup-orejime-consent-defaults">' . $script . '</script>';
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
