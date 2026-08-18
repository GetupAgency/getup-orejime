<?php
/**
 * Getup Orejime — Admin settings page.
 * Uses the WordPress Settings API for proper nonce/redirect handling.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'admin_menu', 'getup_orejime_admin_menu' );
add_action( 'admin_init', 'getup_orejime_register_settings' );
add_action( 'admin_init', 'getup_orejime_maybe_run_optin_migration_check' );
add_action( 'admin_enqueue_scripts', 'getup_orejime_admin_assets' );
add_action( 'admin_notices', 'getup_orejime_optin_neutralized_notice' );

/**
 * Covers the in-place update path: register_activation_hook() only fires on
 * activation, never when a client takes the update through the WordPress
 * updater. Without this, a 1.4.0 site upgraded to 2.0.0 without a
 * deactivate/reactivate cycle would have its opt-in purpose silently
 * neutralised by getup_orejime_migrate_options() (which runs on every page
 * load) while never getting the admin_notices warning about it.
 *
 * Guarded by a cheap string comparison so the detection itself only runs
 * once per version bump, not on every admin page load.
 */
function getup_orejime_maybe_run_optin_migration_check(): void {
    $stored = (string) get_option( 'getup_orejime_schema_version', '' );
    if ( ! getup_orejime_schema_version_needs_migration( $stored, GETUP_OREJIME_VERSION ) ) {
        return;
    }
    getup_orejime_apply_optin_migration_flag();
}

/**
 * Warn the client when migration forced a previously opt-in purpose back to opt-out.
 */
function getup_orejime_optin_neutralized_notice(): void {
    if ( get_option( 'getup_orejime_optin_neutralized' ) !== '1' ) {
        return;
    }
    echo '<div class="notice notice-warning"><p>'
       . esc_html__( 'Getup Orejime 2.0 : une finalité était activée par défaut. Elle a été repassée en opt-in pour respecter le consentement préalable.', 'getup-orejime' )
       . '</p></div>';
}

/**
 * Add menu item under Settings.
 */
function getup_orejime_admin_menu() {
    add_options_page(
        'Getup Orejime',
        'Orejime Cookies',
        'manage_options',
        'getup-orejime',
        'getup_orejime_settings_page'
    );
}

/**
 * Register all settings with sanitize callbacks.
 *
 * Douze champs : le jeu de la 1.4.0 moins getup_orejime_google_consent_mode,
 * supprimé car Consent Mode v2 n'est plus désactivable.
 */
function getup_orejime_register_settings() {
    $fields = array(
        'getup_orejime_cookie_name'        => 'sanitize_text_field',
        'getup_orejime_cookie_duration'    => 'absint',
        'getup_orejime_privacy_policy_url' => 'sanitize_text_field',
        'getup_orejime_logo_url'           => 'esc_url_raw',
        'getup_orejime_banner_title'       => 'sanitize_text_field',
        'getup_orejime_placement'          => 'sanitize_text_field',
        'getup_orejime_custom_css'         => 'wp_strip_all_tags',
        'getup_orejime_exit_animation'     => 'absint',
        'getup_orejime_fix_seo_h1'         => 'absint',
        'getup_orejime_badge_mode'         => 'absint',
        'getup_orejime_smartlook_key'      => 'sanitize_text_field',
        'getup_orejime_purposes'           => 'getup_orejime_sanitize_purposes',
    );

    foreach ( $fields as $field => $sanitize ) {
        register_setting( 'getup_orejime_settings', $field, array(
            'sanitize_callback' => $sanitize,
        ) );
    }
}

/**
 * Sanitize purposes JSON: decode, sanitize each field, re-encode.
 */
function getup_orejime_sanitize_purposes( $raw ) {
    $purposes = json_decode( wp_unslash( $raw ), true );
    if ( ! is_array( $purposes ) ) {
        return '[]';
    }

    $clean = array();
    foreach ( $purposes as $p ) {
        $clean[] = array(
            'id'          => sanitize_text_field( $p['id'] ?? '' ),
            'title'       => sanitize_text_field( $p['title'] ?? '' ),
            'description' => sanitize_text_field( $p['description'] ?? '' ),
            'cookies'     => sanitize_text_field( $p['cookies'] ?? '' ),
            'default'     => ! empty( $p['default'] ),
        );
    }

    return wp_json_encode( $clean, JSON_UNESCAPED_UNICODE );
}

/**
 * Admin page assets: CodeMirror + custom styles.
 */
function getup_orejime_admin_assets( $hook ) {
    if ( $hook !== 'settings_page_getup-orejime' ) {
        return;
    }
    wp_enqueue_code_editor( array( 'type' => 'text/css' ) );
    wp_enqueue_style( 'getup-orejime-admin', false );
    wp_add_inline_style( 'getup-orejime-admin', '
        .go-wrap { max-width: 900px; }
        .go-card { background: #fff; border: 1px solid #c3c4c7; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
        .go-card h2 { margin-top: 0; padding: 0; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 16px; }
        .go-field { margin-bottom: 16px; }
        .go-field label { display: block; font-weight: 600; margin-bottom: 4px; }
        .go-field input[type="text"],
        .go-field input[type="number"],
        .go-field input[type="url"] { width: 100%; max-width: 500px; }
        .go-purposes-list { border: 1px solid #ddd; border-radius: 6px; padding: 16px; background: #f9f9f9; }
        .go-purpose { background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 12px; }
        .go-purpose:last-child { margin-bottom: 0; }
        .go-purpose input[type="text"] { width: 100%; }
        .go-purpose .go-row { display: flex; gap: 12px; margin-bottom: 8px; }
        .go-purpose .go-row > * { flex: 1; }
        .go-css-editor { border: 1px solid #ddd; min-height: 300px; }
        .go-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .go-badge { background: #0d3320; color: #34d399; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
    ' );
}

/**
 * Render admin settings page.
 */
function getup_orejime_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    $purposes_json = get_option( 'getup_orejime_purposes', '[]' );
    $purposes      = json_decode( $purposes_json, true );
    if ( ! is_array( $purposes ) ) {
        $purposes = array();
    }

    ?>
    <div class="wrap go-wrap">
        <div class="go-header">
            <h1>Getup Orejime</h1>
            <span class="go-badge">v<?php echo esc_html( GETUP_OREJIME_VERSION ); ?></span>
        </div>

        <form method="post" action="options.php" id="go-form">
            <?php settings_fields( 'getup_orejime_settings' ); ?>

            <!-- Bandeau -->
            <div class="go-card">
                <h2>Bandeau</h2>
                <div class="go-field">
                    <label for="go-banner-title">Titre du bandeau</label>
                    <input type="text" id="go-banner-title" name="getup_orejime_banner_title"
                           value="<?php echo esc_attr( get_option( 'getup_orejime_banner_title', 'Cookies maison' ) ); ?>" />
                </div>
                <div class="go-field">
                    <label for="go-logo">URL du logo / GIF</label>
                    <input type="url" id="go-logo" name="getup_orejime_logo_url"
                           value="<?php echo esc_attr( get_option( 'getup_orejime_logo_url', '' ) ); ?>"
                           placeholder="https://example.com/cookies.gif" />
                    <p class="description">Laisser vide pour aucun logo. Accepte GIF, PNG, SVG...</p>
                </div>
                <div class="go-field">
                    <label for="go-placement">Position du bandeau</label>
                    <select id="go-placement" name="getup_orejime_placement">
                        <option value="bottom-right" <?php selected( get_option( 'getup_orejime_placement', 'bottom-right' ), 'bottom-right' ); ?>>Bas droite</option>
                        <option value="bottom-left" <?php selected( get_option( 'getup_orejime_placement', 'bottom-right' ), 'bottom-left' ); ?>>Bas gauche</option>
                    </select>
                </div>
                <div class="go-field">
                    <label for="go-privacy">URL politique de confidentialité</label>
                    <input type="text" id="go-privacy" name="getup_orejime_privacy_policy_url"
                           value="<?php echo esc_attr( get_option( 'getup_orejime_privacy_policy_url', '/politique-de-confidentialite' ) ); ?>" />
                </div>
            </div>

            <!-- Cookie technique -->
            <div class="go-card">
                <h2>Cookie technique</h2>
                <div class="go-field">
                    <label for="go-cookie-name">Nom du cookie</label>
                    <input type="text" id="go-cookie-name" name="getup_orejime_cookie_name"
                           value="<?php echo esc_attr( get_option( 'getup_orejime_cookie_name', 'getup-cookies' ) ); ?>" />
                </div>
                <div class="go-field">
                    <label for="go-cookie-dur">Durée (jours)</label>
                    <input type="number" id="go-cookie-dur" name="getup_orejime_cookie_duration"
                           value="<?php echo intval( get_option( 'getup_orejime_cookie_duration', 365 ) ); ?>"
                           min="1" max="730" style="max-width:120px" />
                </div>
            </div>

            <!-- Finalités -->
            <div class="go-card">
                <h2>Finalités (purposes)</h2>
                <p class="description" style="margin-bottom:12px">Chaque finalité correspond à une catégorie de cookies que l'utilisateur peut accepter ou refuser.</p>
                <div class="go-purposes-list" id="go-purposes-list">
                    <?php foreach ( $purposes as $i => $p ) : ?>
                    <div class="go-purpose" data-index="<?php echo $i; ?>">
                        <div class="go-row">
                            <div>
                                <label>ID</label>
                                <input type="text" class="go-p-id" value="<?php echo esc_attr( $p['id'] ?? '' ); ?>" />
                            </div>
                            <div>
                                <label>Titre</label>
                                <input type="text" class="go-p-title" value="<?php echo esc_attr( $p['title'] ?? '' ); ?>" />
                            </div>
                        </div>
                        <div class="go-field">
                            <label>Description</label>
                            <input type="text" class="go-p-desc" value="<?php echo esc_attr( $p['description'] ?? '' ); ?>" />
                        </div>
                        <div class="go-row">
                            <div>
                                <label>Cookies (séparés par virgule, * = wildcard)</label>
                                <input type="text" class="go-p-cookies" value="<?php echo esc_attr( $p['cookies'] ?? '' ); ?>"
                                       placeholder="_ga, _ga_*, _gid" />
                            </div>
                            <div style="flex:0 0 120px">
                                <label>Par défaut</label>
                                <select class="go-p-default">
                                    <option value="0" <?php selected( empty( $p['default'] ) ); ?>>Refusé</option>
                                    <option value="1" <?php selected( ! empty( $p['default'] ) ); ?>>Accepté</option>
                                </select>
                            </div>
                        </div>
                        <button type="button" class="button go-remove-purpose" style="margin-top:8px;color:#b32d2e">Supprimer</button>
                    </div>
                    <?php endforeach; ?>
                </div>
                <button type="button" class="button" id="go-add-purpose" style="margin-top:12px">+ Ajouter une finalité</button>
                <input type="hidden" name="getup_orejime_purposes" id="go-purposes-json"
                       value="<?php echo esc_attr( $purposes_json ); ?>" />
            </div>

            <!-- Options -->
            <div class="go-card">
                <h2>Options</h2>
                <div class="go-field">
                    <label>
                        <input type="hidden" name="getup_orejime_exit_animation" value="0" />
                        <input type="checkbox" name="getup_orejime_exit_animation" value="1"
                            <?php checked( get_option( 'getup_orejime_exit_animation', true ) ); ?> />
                        Animation de sortie du bandeau
                    </label>
                </div>
                <div class="go-field">
                    <label>
                        <input type="hidden" name="getup_orejime_fix_seo_h1" value="0" />
                        <input type="checkbox" name="getup_orejime_fix_seo_h1" value="1"
                            <?php checked( get_option( 'getup_orejime_fix_seo_h1', true ) ); ?> />
                        Fix SEO : remplacer le H1 du bandeau par un P
                    </label>
                    <p class="description">Orejime utilise un &lt;h1&gt; par défaut — ça crée un doublon avec le H1 de votre page.</p>
                </div>
                <div class="go-field">
                    <label>
                        <input type="hidden" name="getup_orejime_badge_mode" value="0" />
                        <input type="checkbox" name="getup_orejime_badge_mode" value="1"
                            <?php checked( get_option( 'getup_orejime_badge_mode', false ) ); ?> />
                        Badge RGPD discret (scroll-up)
                    </label>
                    <p class="description">Remplace le gros bandeau par un petit badge qui apparaît quand l'utilisateur remonte la page. Deux boutons : « OK pour moi » (tout accepter) et « En savoir plus » (ouvre le bandeau complet).</p>
                </div>
            </div>

            <!-- Smartlook -->
            <div class="go-card">
                <h2>Smartlook</h2>
                <p class="description" style="margin-bottom:12px">Session recording conditionné au consentement analytics. Laissez vide pour désactiver.</p>
                <div class="go-field">
                    <label for="go-smartlook-key">Clé projet Smartlook</label>
                    <input type="text" id="go-smartlook-key" name="getup_orejime_smartlook_key"
                           value="<?php echo esc_attr( get_option( 'getup_orejime_smartlook_key', '' ) ); ?>"
                           placeholder="349a48d19669ffd4750548219e6e5808a26118a8" />
                    <p class="description">Trouvable dans Smartlook &rarr; Settings &rarr; Projects &rarr; Project key.</p>
                </div>
            </div>

            <!-- CSS personnalisé -->
            <div class="go-card">
                <h2>CSS personnalisé</h2>
                <p class="description" style="margin-bottom:12px">CSS ajouté après le thème Midnight Emerald. Utile pour adapter les couleurs, polices, ou le layout à votre charte.</p>
                <textarea id="go-custom-css" name="getup_orejime_custom_css" rows="15" style="width:100%;font-family:monospace;font-size:13px"><?php echo esc_textarea( get_option( 'getup_orejime_custom_css', '' ) ); ?></textarea>
            </div>

            <?php submit_button( 'Enregistrer' ); ?>
        </form>
    </div>

    <script>
    (function() {
        // ── Purposes dynamic form ──
        var list = document.getElementById('go-purposes-list');
        var hidden = document.getElementById('go-purposes-json');
        var form = document.getElementById('go-form');

        function purposeTemplate(data) {
            data = data || { id: '', title: '', description: '', cookies: '', 'default': false };
            var div = document.createElement('div');
            div.className = 'go-purpose';
            div.innerHTML =
                '<div class="go-row">' +
                    '<div><label>ID</label><input type="text" class="go-p-id" value="' + esc(data.id) + '" /></div>' +
                    '<div><label>Titre</label><input type="text" class="go-p-title" value="' + esc(data.title) + '" /></div>' +
                '</div>' +
                '<div class="go-field"><label>Description</label><input type="text" class="go-p-desc" value="' + esc(data.description) + '" /></div>' +
                '<div class="go-row">' +
                    '<div><label>Cookies (virgule, * = wildcard)</label><input type="text" class="go-p-cookies" value="' + esc(data.cookies) + '" placeholder="_ga, _ga_*" /></div>' +
                    '<div style="flex:0 0 120px"><label>Par défaut</label><select class="go-p-default"><option value="0"' + (!data['default'] ? ' selected' : '') + '>Refusé</option><option value="1"' + (data['default'] ? ' selected' : '') + '>Accepté</option></select></div>' +
                '</div>' +
                '<button type="button" class="button go-remove-purpose" style="margin-top:8px;color:#b32d2e">Supprimer</button>';
            return div;
        }

        function esc(s) {
            return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        document.getElementById('go-add-purpose').addEventListener('click', function() {
            list.appendChild(purposeTemplate());
        });

        list.addEventListener('click', function(e) {
            if (e.target.classList.contains('go-remove-purpose')) {
                e.target.closest('.go-purpose').remove();
            }
        });

        // Serialize purposes to hidden field before submit
        form.addEventListener('submit', function() {
            var purposes = [];
            list.querySelectorAll('.go-purpose').forEach(function(el) {
                purposes.push({
                    id: el.querySelector('.go-p-id').value,
                    title: el.querySelector('.go-p-title').value,
                    description: el.querySelector('.go-p-desc').value,
                    cookies: el.querySelector('.go-p-cookies').value,
                    'default': el.querySelector('.go-p-default').value === '1'
                });
            });
            hidden.value = JSON.stringify(purposes);
        });

        // ── CodeMirror for CSS editor ──
        if (typeof wp !== 'undefined' && wp.codeEditor) {
            wp.codeEditor.initialize(document.getElementById('go-custom-css'), {
                codemirror: {
                    mode: 'css',
                    lineNumbers: true,
                    lineWrapping: true,
                    theme: 'default'
                }
            });
        }
    })();
    </script>
    <?php
}
