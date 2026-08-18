<?php

function getup_orejime_split_cookies($raw): array
{
    if (is_array($raw)) {
        return array_values($raw);
    }
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    return array_values(array_filter(array_map('trim', explode(',', $raw)), 'strlen'));
}

function getup_orejime_decode_legacy_purposes($raw): array
{
    $purposes = is_string($raw) ? json_decode($raw, true) : $raw;
    return is_array($purposes) ? $purposes : [];
}

/**
 * Remappe les clés plates historiques vers la structure imbriquée de @getup/consent.
 *
 * L'option getup_orejime_google_consent_mode est volontairement abandonnée :
 * Consent Mode v2 n'est plus désactivable.
 */
function getup_orejime_migrate_options(array $legacy): array
{
    $get = static function (string $key, $default = null) use ($legacy) {
        return array_key_exists($key, $legacy) && $legacy[$key] !== '' ? $legacy[$key] : $default;
    };

    $purposes = getup_orejime_decode_legacy_purposes($get('getup_orejime_purposes', '[]'));

    $config = [
        'privacyPolicyUrl' => (string) $get('getup_orejime_privacy_policy_url', '/politique-de-confidentialite'),
        'cookie' => [
            'name'     => (string) $get('getup_orejime_cookie_name', 'getup-cookies'),
            'duration' => (int) $get('getup_orejime_cookie_duration', 365),
        ],
        'purposes' => array_values(array_map(static function (array $p): array {
            return [
                'id'          => (string) ($p['id'] ?? ''),
                'title'       => (string) ($p['title'] ?? ''),
                'description' => (string) ($p['description'] ?? ''),
                'cookies'     => getup_orejime_split_cookies($p['cookies'] ?? ''),
                // Opt-in historique neutralisé : le consentement préalable prime.
                'default'     => false,
            ];
        }, $purposes)),
        'ui' => [
            'badge'         => (bool) $get('getup_orejime_badge_mode', false),
            'exitAnimation' => (bool) $get('getup_orejime_exit_animation', true),
            'fixSeoH1'      => (bool) $get('getup_orejime_fix_seo_h1', true),
            'placement'     => (string) $get('getup_orejime_placement', 'bottom-right'),
            'logo'          => $get('getup_orejime_logo_url'),
            'bannerTitle'   => $get('getup_orejime_banner_title', 'Cookies maison'),
        ],
        'theme' => [
            'preset'    => 'midnight-emerald',
            'customCss' => $get('getup_orejime_custom_css'),
        ],
    ];

    $smartlook = $get('getup_orejime_smartlook_key');
    if ($smartlook) {
        $config['trackers']['smartlook'] = ['key' => (string) $smartlook];
    }

    return $config;
}

/**
 * Détecte si les options historiques contiennent une finalité opt-in (default: true).
 *
 * Sert uniquement à signaler à l'activation qu'une finalité a été neutralisée
 * opt-in -> opt-out par la migration ; ne modifie rien elle-même.
 */
function getup_orejime_has_optin_purpose(array $legacy): bool
{
    $purposes = getup_orejime_decode_legacy_purposes($legacy['getup_orejime_purposes'] ?? '[]');
    foreach ($purposes as $p) {
        if (!empty($p['default'])) {
            return true;
        }
    }
    return false;
}
