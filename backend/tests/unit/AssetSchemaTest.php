<?php

namespace Tests\Unit;

use App\Exceptions\ValidationError;
use App\Libraries\AssetSchema as S;
use CodeIgniter\Test\CIUnitTestCase;
use Tests\Support\Fixtures;

/** Validators and the publish gate (packages/asset-schema parity). */
final class AssetSchemaTest extends CIUnitTestCase
{
    private function rule(callable $fn): ?string
    {
        try {
            $fn();
        } catch (ValidationError $e) {
            return $e->details[0]['rule'];
        }

        return null;
    }

    public function testLutSizeRowsAndRange(): void
    {
        $this->assertSame(17, S::parseCube(Fixtures::cube(17))['lut_size']);
        try {
            S::parseCube("LUT_3D_SIZE 32\n");
            $this->fail('expected lut.size');
        } catch (ValidationError $e) {
            $this->assertSame('lut.size', $e->details[0]['rule']);
            $this->assertSame(32, $e->details[0]['value']);
            $this->assertSame('LUT size must be 17, 33 or 65.', $e->getMessage());
        }
        $this->assertSame('lut.range', $this->rule(static fn () => S::parseCube(str_replace('1.0000 1.0000 1.0000', '1.5 1 1', Fixtures::cube(17)))));
        $this->assertSame('lut.rows', $this->rule(static fn () => S::parseCube("LUT_3D_SIZE 17\n0 0 0\n")));
        $this->assertSame('lut.dimension', $this->rule(static fn () => S::parseCube("LUT_1D_SIZE 17\n")));
    }

    public function testPresetTypesMatchFrameFlow(): void
    {
        $j = static fn (array $o) => json_encode($o);
        $this->assertSame('wipe', S::validateFile('transition', 'a.ffx', $j(['value' => ['type' => 'wipe']]))['meta']['render_engine']);
        $this->assertSame('transition.type', $this->rule(static fn () => S::validateFile('transition', 'a.ffx', $j(['value' => ['type' => 'melt']]))));
        $this->assertSame('filter.grade', $this->rule(static fn () => S::validateFile('filter', 'a.ffx', $j(['name' => 'x']))));
        $this->assertSame('filter.grade', $this->rule(static fn () => S::validateFile('filter', 'a.ffx', '{"grade":{}}')));
        $this->assertSame('text.params', $this->rule(static fn () => S::validateFile('text_template', 'a.json', $j(['placeholders' => []]))));
        $this->assertSame(4000, S::validateFile('video_template', 'a.fftemplate', $j(['aspect' => ['width' => 1920, 'height' => 1080], 'layers' => [['kind' => 'media', 'slot' => 0, 'start' => 0, 'duration' => 4]]]))['meta']['total_duration_ms']);
    }

    public function testSvgAndLottieSafety(): void
    {
        $this->assertSame([], S::svgProblems('<svg><rect fill="#fff"/></svg>'));
        $rules = array_column(S::svgProblems('<svg onload="x()"><script>1</script><image href="https://x/y.png"/><foreignObject/></svg>'), 'rule');
        sort($rules);
        $this->assertSame(['svg.event_handler', 'svg.external_ref', 'svg.foreignObject', 'svg.script'], $rules);
        $obj = static fn (array $a) => json_decode(json_encode($a));
        $this->assertSame(2000, S::lottieInfo($obj(Fixtures::lottie()))['duration_ms']);
        $this->assertSame('lottie.expressions', $this->rule(static fn () => S::lottieInfo($obj(Fixtures::lottie(['layers' => [['ks' => ['p' => ['x' => 'time*2']]]]])))));
        $this->assertSame('lottie.external_image', $this->rule(static fn () => S::lottieInfo($obj(Fixtures::lottie(['assets' => [['id' => 'i', 'p' => 'img.png', 'u' => 'images/']]])))));
        $this->assertSame('lottie.frames', $this->rule(static fn () => S::lottieInfo($obj(Fixtures::lottie(['op' => 900])))));
    }

    public function testUploadGateAndTypeDetection(): void
    {
        $this->assertSame('lut', S::detectType('a.cube', Fixtures::cube()));
        $this->assertSame('lottie', S::detectType('a.json', json_encode(Fixtures::lottie())));
        $this->assertSame('brand_kit', S::detectType('a.json', '{"colors":[]}'));
        $this->assertNull(S::detectType('a.ffx', '{}'));
        $bad = S::uploadChecks('fake.png', 'graphic', 'not a png');
        $this->assertFalse(array_column($bad, 'passed', 'check')['magic_bytes']);
        foreach (S::uploadChecks('a.png', 'graphic', Fixtures::png(600, 600)) as $c) {
            $this->assertTrue($c['passed'], $c['check']);
        }
        $this->assertSame(['w' => 600, 'h' => 400], S::imageSize(Fixtures::png(600, 400)));
        $this->assertSame('graphic.min_size', $this->rule(static fn () => S::validateFile('graphic', 'a.png', Fixtures::png(100, 100))));
    }

    public function testWavAndGif(): void
    {
        $pcm = str_repeat("\0", 48000 * 2);
        $wav = 'RIFF' . pack('V', 36 + strlen($pcm)) . 'WAVE' . 'fmt ' . pack('VvvVVvv', 16, 1, 1, 48000, 96000, 2, 16) . 'data' . pack('V', strlen($pcm)) . $pcm;
        $this->assertSame(['channels' => 1, 'sample_rate' => 48000, 'bit_depth' => 16, 'duration_ms' => 1000], S::wavInfo($wav));
        $gif = "GIF89a" . pack('vv', 10, 10) . "\x00\x00\x00" . "\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00" . "\x2C" . pack('vvvv', 0, 0, 10, 10) . "\x00" . "\x02\x02\x44\x01\x00" . "\x3B";
        $this->assertSame(['frame_count' => 1, 'loop' => true], S::gifInfo($gif));
    }

    public function testTagsSlugsAndSemver(): void
    {
        $this->assertSame(['en' => ['warm'], 'si' => ['උණුසුම්'], 'ta' => ['சூடான']], S::tagsByScript(['warm', 'උණුසුම්', 'சூடான']));
        $this->assertSame(['warm', 'sunset'], S::normalizeTags(['Warm', 'sunset', 'warm']));
        $this->assertSame('kandy-golden-hour', S::slugify('Kandy Golden Hour!'));
        $this->assertSame('cafe-creme', S::slugify('Café crème'));
        $this->assertSame(1, S::compareSemver('1.10.0', '1.9.0'));
        $this->assertSame(1, S::compareSemver('1.0.0', '1.0.0-beta'));
        $this->assertSame('2.0.0', S::bumpSemver('1.4.2', 'major'));
        $this->assertSame('1.5.0', S::bumpSemver('1.4.2'));
    }

    public function testPublishGateListsEveryBlocker(): void
    {
        $rules = array_column(S::publishProblems(['status' => 'draft', 'visibility' => 'internal', 'versions' => [['version' => '1.0.0', 'checks' => [['passed' => false]]]], 'current_version' => '1.0.0']), 'rule');
        foreach (['status.approved', 'thumbnail.required', 'category.required', 'min_app_version.required', 'licence.complete', 'checks.passed', 'audience.rule'] as $r) {
            $this->assertContains($r, $rules);
        }
        $this->assertSame([], S::publishProblems(['status' => 'draft', 'visibility' => 'public', 'thumbnail_file' => ['sha256' => 'x'], 'category_id' => 'c', 'min_app_version' => '1.0.0', 'licence_tier' => 'free', 'licence_terms' => 'royalty_free', 'current_version' => '1.0.0', 'versions' => [['version' => '1.0.0', 'checks' => []]]], true));
    }
}
