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

    // Une finalité historique opt-in (default: true) est repassée en opt-out par
    // la migration : le client doit en être averti plutôt que voir son
    // consentement basculer silencieusement.
    $legacyPurposes = get_option('getup_orejime_purposes', '[]');
    if (getup_orejime_has_optin_purpose(['getup_orejime_purposes' => $legacyPurposes])) {
        update_option('getup_orejime_optin_neutralized', '1');
    }

    update_option('getup_orejime_schema_version', '2.0.0');
});
