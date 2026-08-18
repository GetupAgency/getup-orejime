<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../includes/migrate.php';

class MigrateTest extends TestCase
{
    private function legacy(array $over = []): array
    {
        return array_merge([
            'getup_orejime_cookie_name'         => 'getup-cookies',
            'getup_orejime_cookie_duration'     => 365,
            'getup_orejime_privacy_policy_url'  => '/politique-de-confidentialite',
            'getup_orejime_logo_url'            => '/logo.gif',
            'getup_orejime_banner_title'        => 'Cookies maison',
            'getup_orejime_placement'           => 'bottom-right',
            'getup_orejime_custom_css'          => '.x{color:red}',
            'getup_orejime_google_consent_mode' => true,
            'getup_orejime_exit_animation'      => true,
            'getup_orejime_fix_seo_h1'          => true,
            'getup_orejime_badge_mode'          => false,
            'getup_orejime_smartlook_key'       => 'sl-key',
            'getup_orejime_purposes'            => json_encode([[
                'id' => 'analytics', 'title' => 'GA', 'description' => 'd',
                'cookies' => '_ga, _ga_*, _gid', 'default' => false,
            ]]),
        ], $over);
    }

    public function testRemapsFlatKeysToNestedStructure(): void
    {
        $c = getup_orejime_migrate_options($this->legacy());

        $this->assertSame('/politique-de-confidentialite', $c['privacyPolicyUrl']);
        $this->assertSame('getup-cookies', $c['cookie']['name']);
        $this->assertSame(365, $c['cookie']['duration']);
        $this->assertSame('/logo.gif', $c['ui']['logo']);
        $this->assertSame('Cookies maison', $c['ui']['bannerTitle']);
        $this->assertSame('bottom-right', $c['ui']['placement']);
        $this->assertSame('.x{color:red}', $c['theme']['customCss']);
        $this->assertSame('sl-key', $c['trackers']['smartlook']['key']);
    }

    public function testPreservesBadgeModeInsteadOfApplyingNewDefault(): void
    {
        $c = getup_orejime_migrate_options($this->legacy());
        $this->assertFalse($c['ui']['badge']);
    }

    public function testDropsTheGoogleConsentModeToggle(): void
    {
        $c = getup_orejime_migrate_options($this->legacy(['getup_orejime_google_consent_mode' => false]));
        $this->assertArrayNotHasKey('googleConsentMode', $c);
        $this->assertArrayNotHasKey('consentMode', $c);
    }

    public function testSplitsCookieListIntoArray(): void
    {
        $c = getup_orejime_migrate_options($this->legacy());
        $this->assertSame(['_ga', '_ga_*', '_gid'], $c['purposes'][0]['cookies']);
    }

    public function testForcesOptInPurposesBackToOptOut(): void
    {
        $legacy = $this->legacy([
            'getup_orejime_purposes' => json_encode([[
                'id' => 'analytics', 'title' => 'GA', 'description' => 'd',
                'cookies' => '_ga', 'default' => true,
            ]]),
        ]);
        $c = getup_orejime_migrate_options($legacy);
        $this->assertFalse($c['purposes'][0]['default']);
    }

    public function testSurvivesMissingLegacyOptions(): void
    {
        $c = getup_orejime_migrate_options([]);
        $this->assertSame('getup-cookies', $c['cookie']['name']);
        $this->assertSame([], $c['purposes']);
    }

    public function testDetectsOptInPurposeForActivationFlag(): void
    {
        $legacy = $this->legacy([
            'getup_orejime_purposes' => json_encode([[
                'id' => 'analytics', 'title' => 'GA', 'description' => 'd',
                'cookies' => '_ga', 'default' => true,
            ]]),
        ]);
        $this->assertTrue(getup_orejime_has_optin_purpose($legacy));
    }

    public function testDoesNotFlagWhenNoPurposeWasOptIn(): void
    {
        $this->assertFalse(getup_orejime_has_optin_purpose($this->legacy()));
    }

    public function testDoesNotFlagWhenPurposesAreMissing(): void
    {
        $this->assertFalse(getup_orejime_has_optin_purpose([]));
    }

    public function testNeedsMigrationWhenStoredVersionIsEmpty(): void
    {
        $this->assertTrue(getup_orejime_schema_version_needs_migration('', '2.0.0'));
    }

    public function testNeedsMigrationWhenStoredVersionDiffersFromCurrent(): void
    {
        $this->assertTrue(getup_orejime_schema_version_needs_migration('1.4.0', '2.0.0'));
    }

    public function testDoesNotNeedMigrationWhenVersionsMatch(): void
    {
        $this->assertFalse(getup_orejime_schema_version_needs_migration('2.0.0', '2.0.0'));
    }
}
