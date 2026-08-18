<?php
/**
 * Getup Orejime — Cookie Consent (RGPD / Consent Mode v2)
 *
 * @author    Getup Agency <contact@getup.agency>
 * @copyright 2026 Getup Agency
 * @license   MIT
 */

if (!defined('_PS_VERSION_')) { exit; }

class GetupOrejime extends Module
{
    private const SIGNALS = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

    public function __construct()
    {
        $this->name = 'getuporejime';
        $this->tab = 'front_office_features';
        $this->version = '2.0.0';
        $this->author = 'Getup Agency';
        $this->need_instance = 0;
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('Getup Orejime — Cookie Consent');
        $this->description = $this->l('Bandeau cookies RGPD avec Google Consent Mode v2, badge scroll-up et thème personnalisable.');
        $this->ps_versions_compliancy = ['min' => '1.7.0.0', 'max' => '9.99.99'];
    }

    /* ─────────────── Install / Uninstall ─────────────── */

    public function install(): bool
    {
        return parent::install()
            && $this->registerHook('displayHeader')
            && Configuration::updateValue('GETUPOREJIME_PRIVACY_URL', '/content/2-mentions-legales')
            && Configuration::updateValue('GETUPOREJIME_COOKIE_NAME', 'getup-cookies')
            && Configuration::updateValue('GETUPOREJIME_COOKIE_DURATION', 365)
            && Configuration::updateValue('GETUPOREJIME_BANNER_TITLE', 'Cookies maison')
            && Configuration::updateValue('GETUPOREJIME_BADGE', true)
            && Configuration::updateValue('GETUPOREJIME_PURPOSES', json_encode([]));
    }

    public function uninstall(): bool
    {
        Configuration::deleteByName('GETUPOREJIME_PRIVACY_URL');
        Configuration::deleteByName('GETUPOREJIME_COOKIE_NAME');
        Configuration::deleteByName('GETUPOREJIME_COOKIE_DURATION');
        Configuration::deleteByName('GETUPOREJIME_BANNER_TITLE');
        Configuration::deleteByName('GETUPOREJIME_BADGE');
        Configuration::deleteByName('GETUPOREJIME_CUSTOM_CSS');
        Configuration::deleteByName('GETUPOREJIME_SMARTLOOK_KEY');
        Configuration::deleteByName('GETUPOREJIME_PURPOSES');

        return parent::uninstall();
    }

    /* ─────────────── Admin configuration ─────────────── */

    /**
     * Helper: get the configure URL (works on PS 1.7, 8 and 9)
     */
    private function getConfigureUrl(string $extra = ''): string
    {
        // PS 8+ uses Symfony router — AdminController::$currentIndex may not exist
        if (method_exists($this->context->link, 'getAdminLink')) {
            return $this->context->link->getAdminLink('AdminModules', true, [], [
                'configure' => $this->name,
            ]) . $extra;
        }

        // Fallback PS 1.7
        return 'index.php?controller=AdminModules&configure=' . $this->name
            . '&token=' . Tools::getAdminTokenLite('AdminModules') . $extra;
    }

    public function getContent(): string
    {
        $output = '';

        if (Tools::isSubmit('submitGetupOrejime')) {
            $output .= $this->processSaveConfig();
        }

        if (Tools::isSubmit('addPurpose')) {
            $this->processAddPurpose();
        }

        if (Tools::getValue('deletePurpose') !== false && Tools::getValue('deletePurpose') !== '') {
            $this->processDeletePurpose((int) Tools::getValue('deletePurpose'));
        }

        return $output . $this->renderConfigForm();
    }

    private function processSaveConfig(): string
    {
        Configuration::updateValue('GETUPOREJIME_COOKIE_NAME', Tools::getValue('GETUPOREJIME_COOKIE_NAME'));
        Configuration::updateValue('GETUPOREJIME_COOKIE_DURATION', (int) Tools::getValue('GETUPOREJIME_COOKIE_DURATION'));
        Configuration::updateValue('GETUPOREJIME_PRIVACY_URL', Tools::getValue('GETUPOREJIME_PRIVACY_URL'));
        Configuration::updateValue('GETUPOREJIME_BANNER_TITLE', Tools::getValue('GETUPOREJIME_BANNER_TITLE'));
        Configuration::updateValue('GETUPOREJIME_BADGE', (bool) Tools::getValue('GETUPOREJIME_BADGE', 0));
        Configuration::updateValue('GETUPOREJIME_SMARTLOOK_KEY', Tools::getValue('GETUPOREJIME_SMARTLOOK_KEY'));
        Configuration::updateValue('GETUPOREJIME_CUSTOM_CSS', Tools::getValue('GETUPOREJIME_CUSTOM_CSS'), true);

        // Save purposes
        $purposes = json_decode((string) Configuration::get('GETUPOREJIME_PURPOSES'), true) ?: [];
        foreach ($purposes as $i => &$p) {
            $p['id'] = Tools::getValue('purpose_id_' . $i, $p['id']);
            $p['title'] = Tools::getValue('purpose_title_' . $i, $p['title']);
            $p['description'] = Tools::getValue('purpose_desc_' . $i, $p['description']);
            $p['cookies'] = Tools::getValue('purpose_cookies_' . $i, $p['cookies']);
            // Toute finalité non essentielle reste opt-out : le formulaire ne
            // propose plus de case « activé par défaut », cf. règle métier
            // partagée avec l'adaptateur WordPress (opt-in jamais pré-coché).
            $p['default'] = false;
        }
        unset($p);
        Configuration::updateValue('GETUPOREJIME_PURPOSES', json_encode($purposes));

        return $this->displayConfirmation($this->l('Configuration saved.'));
    }

    private function processAddPurpose(): void
    {
        $purposes = json_decode((string) Configuration::get('GETUPOREJIME_PURPOSES'), true) ?: [];
        $purposes[] = [
            'id' => 'new_purpose',
            'title' => 'New Purpose',
            'description' => '',
            'cookies' => '',
            'default' => false,
        ];
        Configuration::updateValue('GETUPOREJIME_PURPOSES', json_encode($purposes));
    }

    private function processDeletePurpose(int $index): void
    {
        $purposes = json_decode((string) Configuration::get('GETUPOREJIME_PURPOSES'), true) ?: [];
        if (isset($purposes[$index])) {
            array_splice($purposes, $index, 1);
            Configuration::updateValue('GETUPOREJIME_PURPOSES', json_encode($purposes));
        }
    }

    private function renderConfigForm(): string
    {
        $purposes = json_decode((string) Configuration::get('GETUPOREJIME_PURPOSES'), true) ?: [];
        $configureUrl = $this->getConfigureUrl();

        $html = '<div class="panel"><h3><i class="icon-cogs"></i> ' . $this->l('Getup Orejime — Configuration') . '</h3>';
        $html .= '<form method="post" action="' . htmlspecialchars($configureUrl) . '">';

        // General settings
        $html .= '<div class="form-group">';
        $html .= '<label>' . $this->l('Banner title') . '</label>';
        $html .= '<input type="text" name="GETUPOREJIME_BANNER_TITLE" value="' . Tools::safeOutput(Configuration::get('GETUPOREJIME_BANNER_TITLE')) . '" class="form-control" />';
        $html .= '</div>';

        $html .= '<div class="form-group">';
        $html .= '<label>' . $this->l('Privacy policy URL') . '</label>';
        $html .= '<input type="text" name="GETUPOREJIME_PRIVACY_URL" value="' . Tools::safeOutput(Configuration::get('GETUPOREJIME_PRIVACY_URL')) . '" class="form-control" />';
        $html .= '</div>';

        $html .= '<div class="form-group">';
        $html .= '<label>' . $this->l('Cookie name') . '</label>';
        $html .= '<input type="text" name="GETUPOREJIME_COOKIE_NAME" value="' . Tools::safeOutput(Configuration::get('GETUPOREJIME_COOKIE_NAME')) . '" class="form-control" />';
        $html .= '</div>';

        $html .= '<div class="form-group">';
        $html .= '<label>' . $this->l('Cookie duration (days)') . '</label>';
        $html .= '<input type="number" name="GETUPOREJIME_COOKIE_DURATION" value="' . (int) Configuration::get('GETUPOREJIME_COOKIE_DURATION') . '" class="form-control" />';
        $html .= '</div>';

        $badge = (bool) Configuration::get('GETUPOREJIME_BADGE');
        $html .= '<div class="form-group">';
        $html .= '<label>';
        $html .= '<input type="hidden" name="GETUPOREJIME_BADGE" value="0" />';
        $html .= '<input type="checkbox" name="GETUPOREJIME_BADGE" value="1"' . ($badge ? ' checked' : '') . ' /> ';
        $html .= $this->l('Badge RGPD discret (scroll-up)');
        $html .= '</label>';
        $html .= '<p class="help-block">' . $this->l('Remplace le gros bandeau par un petit badge qui apparaît quand l\'utilisateur remonte la page, avec un bouton refuser en un clic.') . '</p>';
        $html .= '</div>';

        $html .= '<div class="form-group">';
        $html .= '<label>' . $this->l('Clé projet Smartlook (optionnel)') . '</label>';
        $html .= '<input type="text" name="GETUPOREJIME_SMARTLOOK_KEY" value="' . Tools::safeOutput(Configuration::get('GETUPOREJIME_SMARTLOOK_KEY')) . '" class="form-control" placeholder="349a48d19669ffd4750548219e6e5808a26118a8" />';
        $html .= '<p class="help-block">' . $this->l('Session recording conditionné au consentement analytics. Laisser vide pour désactiver.') . '</p>';
        $html .= '</div>';

        $html .= '<div class="form-group">';
        $html .= '<label>' . $this->l('Custom CSS') . '</label>';
        $html .= '<textarea name="GETUPOREJIME_CUSTOM_CSS" class="form-control" rows="8">' . Tools::safeOutput(Configuration::get('GETUPOREJIME_CUSTOM_CSS')) . '</textarea>';
        $html .= '<p class="help-block">' . $this->l('CSS ajouté après le thème Midnight Emerald.') . '</p>';
        $html .= '</div>';

        // Purposes
        $html .= '<hr><h4>' . $this->l('Purposes (cookie categories)') . '</h4>';
        $html .= '<p class="help-block">' . $this->l('Toute finalité est opt-out par défaut : aucun consentement n\'est jamais pré-coché.') . '</p>';
        foreach ($purposes as $i => $p) {
            $deleteUrl = $this->getConfigureUrl('&deletePurpose=' . $i);
            $html .= '<div class="panel" style="background:#f8f8f8;padding:15px;margin-bottom:10px;">';
            $html .= '<div class="row">';
            $html .= '<div class="col-md-3"><label>' . $this->l('ID') . '</label><input type="text" name="purpose_id_' . $i . '" value="' . Tools::safeOutput($p['id']) . '" class="form-control" /></div>';
            $html .= '<div class="col-md-3"><label>' . $this->l('Title') . '</label><input type="text" name="purpose_title_' . $i . '" value="' . Tools::safeOutput($p['title']) . '" class="form-control" /></div>';
            $html .= '<div class="col-md-4"><label>' . $this->l('Description') . '</label><input type="text" name="purpose_desc_' . $i . '" value="' . Tools::safeOutput($p['description']) . '" class="form-control" /></div>';
            $html .= '<div class="col-md-2"><label>&nbsp;</label><a href="' . htmlspecialchars($deleteUrl) . '" class="btn btn-danger btn-block" onclick="return confirm(\'' . $this->l('Delete this purpose?') . '\')"><i class="icon-trash"></i></a></div>';
            $html .= '</div>';
            $html .= '<div class="row" style="margin-top:8px;">';
            $html .= '<div class="col-md-12"><label>' . $this->l('Cookies (comma-separated, use * for wildcards: _ga_*)') . '</label><input type="text" name="purpose_cookies_' . $i . '" value="' . Tools::safeOutput(is_array($p['cookies'] ?? null) ? implode(',', $p['cookies']) : ($p['cookies'] ?? '')) . '" class="form-control" /></div>';
            $html .= '</div>';
            $html .= '</div>';
        }

        $html .= '<button type="submit" name="addPurpose" class="btn btn-default"><i class="icon-plus"></i> ' . $this->l('Add purpose') . '</button>';
        $html .= '<hr>';
        $html .= '<button type="submit" name="submitGetupOrejime" class="btn btn-primary"><i class="icon-save"></i> ' . $this->l('Save') . '</button>';
        $html .= '</form></div>';

        return $html;
    }

    /* ─────────────── Front-office hook ─────────────── */

    /** Phase 1 puis phase 2, dans cet ordre. */
    public function hookDisplayHeader(): string
    {
        $denied = implode(',', array_map(
            static fn($s) => $s . ':"denied"',
            self::SIGNALS
        ));

        $base = $this->_path . 'views/dist';

        $out = '<script id="getup-orejime-consent-defaults">'
             . 'window.dataLayer=window.dataLayer||[];'
             . 'function gtag(){dataLayer.push(arguments);}'
             . 'gtag("consent","default",{' . $denied . ',wait_for_update:500});'
             . '</script>';

        $out .= '<link rel="stylesheet" href="' . $base . '/theme/tokens.css">';
        $out .= '<link rel="stylesheet" href="' . $base . '/theme/presets/midnight-emerald.css">';

        $customCss = Configuration::get('GETUPOREJIME_CUSTOM_CSS');
        if (!empty($customCss)) {
            $out .= '<style>' . strip_tags($customCss) . '</style>';
        }

        $out .= '<script type="application/json" id="getup-consent-config">'
              . $this->encodeConfig($this->buildConfig($base))
              . '</script>';

        $out .= '<script src="' . $base . '/getup-consent.iife.js" defer></script>';

        return $out;
    }

    private function buildConfig(string $base): array
    {
        $purposes = json_decode((string) Configuration::get('GETUPOREJIME_PURPOSES'), true) ?: [];

        $config = [
            'privacyPolicyUrl' => (string) Configuration::get('GETUPOREJIME_PRIVACY_URL'),
            'assetsBaseUrl' => $base . '/vendor/orejime',
            'cookie' => [
                'name' => (string) Configuration::get('GETUPOREJIME_COOKIE_NAME'),
                'duration' => (int) Configuration::get('GETUPOREJIME_COOKIE_DURATION'),
            ],
            'purposes' => array_values(array_map(static function (array $p): array {
                $cookies = $p['cookies'] ?? '';
                return [
                    'id' => (string) ($p['id'] ?? ''),
                    'title' => (string) ($p['title'] ?? ''),
                    'description' => (string) ($p['description'] ?? ''),
                    'cookies' => is_array($cookies)
                        ? array_values($cookies)
                        : array_values(array_filter(array_map('trim', explode(',', (string) $cookies)), 'strlen')),
                    'default' => false,
                ];
            }, $purposes)),
            'ui' => [
                'badge' => (bool) Configuration::get('GETUPOREJIME_BADGE'),
                'bannerTitle' => (string) Configuration::get('GETUPOREJIME_BANNER_TITLE'),
            ],
        ];

        $smartlook = Configuration::get('GETUPOREJIME_SMARTLOOK_KEY');
        if (!empty($smartlook)) {
            $config['trackers']['smartlook'] = ['key' => (string) $smartlook];
        }

        return $config;
    }

    private function encodeConfig(array $config): string
    {
        return json_encode(
            $config,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE
        );
    }
}
