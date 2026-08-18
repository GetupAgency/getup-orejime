<?php
if (!defined('ABSPATH') && !defined('GETUP_OREJIME_TESTING')) {
    define('GETUP_OREJIME_TESTING', true);
}

require_once __DIR__ . '/migrate.php';

/**
 * Sérialise la config pour injection dans une balise <script type="application/json">.
 * Les drapeaux HEX empêchent toute fermeture prématurée de balise.
 */
function getup_orejime_encode_config(array $config): string
{
    return json_encode(
        $config,
        JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE
    );
}

/** Construit la config depuis les options WordPress courantes. */
function getup_orejime_build_config(array $options): array
{
    return getup_orejime_migrate_options($options);
}
