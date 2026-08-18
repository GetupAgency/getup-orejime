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

/**
 * Détecte une finalité historique opt-in (default: true) et positionne le
 * drapeau d'avertissement, puis marque la version de schéma comme migrée.
 *
 * Impure par nécessité (options WordPress) ; la détection elle-même reste
 * déléguée aux fonctions pures de includes/migrate.php. Appelée à la fois
 * depuis l'activation (installs neufs / réactivation manuelle) et depuis
 * admin_init (Étape suivante, dans includes/admin.php) pour couvrir le
 * chemin de mise à jour in-place, que register_activation_hook() ne
 * déclenche jamais.
 */
function getup_orejime_apply_optin_migration_flag(): void
{
    $legacyPurposes = get_option('getup_orejime_purposes', '[]');
    if (getup_orejime_has_optin_purpose(['getup_orejime_purposes' => $legacyPurposes])) {
        update_option('getup_orejime_optin_neutralized', '1');
    }

    update_option('getup_orejime_schema_version', GETUP_OREJIME_VERSION);
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

    // Une finalité historique opt-in (default: true) est repassée en opt-out par
    // la migration : le client doit en être averti plutôt que voir son
    // consentement basculer silencieusement.
    getup_orejime_apply_optin_migration_flag();
});
