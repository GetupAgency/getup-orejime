<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../includes/config.php';

class ConfigTest extends TestCase
{
    public function testSerializesToJsonSafeForInlineScriptTag(): void
    {
        $json = getup_orejime_encode_config([
            'privacyPolicyUrl' => '/c',
            'ui' => ['bannerTitle' => '</script><script>alert(1)</script>'],
        ]);
        $this->assertStringNotContainsString('</script>', $json);
        $this->assertNotNull(json_decode($json, true));
    }

    public function testKeepsAccentedCharactersReadable(): void
    {
        $json = getup_orejime_encode_config(['ui' => ['bannerTitle' => 'Publicité']]);
        $this->assertStringContainsString('Publicité', $json);
    }

    public function testRoundTripsWithoutLoss(): void
    {
        $config = ['privacyPolicyUrl' => '/c', 'purposes' => [
            ['id' => 'analytics', 'title' => 'A', 'description' => 'd', 'cookies' => ['_ga'], 'default' => false],
        ]];
        $this->assertSame($config, json_decode(getup_orejime_encode_config($config), true));
    }
}
