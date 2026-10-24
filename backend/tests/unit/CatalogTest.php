<?php

use App\Libraries\Pack\PackBuilder;
use CodeIgniter\Test\CIUnitTestCase;

/**
 * @internal
 */
final class CatalogTest extends CIUnitTestCase
{
    private static function entry(string $id, string $slug, array $deps = []): array
    {
        return [
            'asset'    => ['id' => $id, 'slug' => $slug, 'type' => 'lut', 'title' => $slug, 'licence_terms' => 'x', 'licence_tier' => 'free', 'min_app_version' => '1.0.0', 'tags' => [], 'keywords' => [], 'dependencies' => $deps],
            'version'  => ['version' => '1.0.0', 'package' => ['size' => 1, 'sha256' => str_repeat('0', 64)]],
            'category' => null,
        ];
    }

    public function testDependenciesBecomePackIdsInTheChannel(): void
    {
        $catalog = PackBuilder::buildCatalog('stable', [
            self::entry('a1', 'title-pack', [['asset_id' => 'b1'], ['asset_id' => 'gone']]),
            self::entry('b1', 'base-font'),
        ], '2026-10-24T00:00:00Z');
        $bySlug = array_column($catalog['packs'], null, 'id');
        $this->assertSame(['base-font'], $bySlug['title-pack']['dependencies']);
        $this->assertSame([], $bySlug['base-font']['dependencies']);
        $this->assertSame('a1', $bySlug['title-pack']['libraryAssetId']);
    }
}
