<?php

namespace Tests\Unit;

use App\Libraries\Storage\FileBlobStore;
use CodeIgniter\Test\CIUnitTestCase;

final class FileBlobStoreTest extends CIUnitTestCase
{
    public function testPutGetHeadRangeAndEscapes(): void
    {
        $s = new FileBlobStore(sys_get_temp_dir() . '/fflib-blobs-' . bin2hex(random_bytes(4)));
        $this->assertFalse($s->has('packages/a b+c.zip'));
        $s->put('packages/a b+c.zip', str_repeat('0123456789', 100));
        $this->assertSame(1000, $s->head('packages/a b+c.zip')['size']);
        $got = '';
        $s->stream('packages/a b+c.zip', 10, 19, static function ($c) use (&$got) { $got .= $c; });
        $this->assertSame('0123456789', $got);
        $this->assertNull($s->get('nope'));
        $this->assertNull($s->head('nope'));
        $this->expectException(\InvalidArgumentException::class);
        $s->put('../escape', 'x');
    }
}
