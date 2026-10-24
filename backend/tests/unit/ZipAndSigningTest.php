<?php

namespace Tests\Unit;

use App\Libraries\Json;
use App\Libraries\Pack\Zip;
use App\Libraries\Pack\ZipProblem;
use App\Libraries\Signing\Ed25519Key;
use CodeIgniter\Test\CIUnitTestCase;

/** Deterministic ZIPs, the upload zip guard and Ed25519 interop with Node's crypto. */
final class ZipAndSigningTest extends CIUnitTestCase
{
    /** Produced by apps/api/src/pack.js createZip() for the same entries (Node's zlib). */
    private const NODE_ZIP = 'UEsDBBQAAAgIAAAAIQBXN2KFCwAAACMAAAAHAAAAYS9iLnR4dMtIzcnJV8jARwIAUEsDBBQAAAgAAAAAIQAdgLxVAwAAAAMAAAAFAAAAYy5iaW4BAgNQSwECHgMUAAAICAAAACEAVzdihQsAAAAjAAAABwAAAAAAAAAAAAAApIEAAAAAYS9iLnR4dFBLAQIeAxQAAAgAAAAAIQAdgLxVAwAAAAMAAAAFAAAAAAAAAAAAAACkgTAAAABjLmJpblBLBQYAAAAAAgACAGgAAABWAAAAAAA=';

    /** Node: PKCS#8 for seed 0x07×32, its SPKI PEM, and crypto.sign(null, "catalog text\n"). */
    private const NODE_PEM = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH\n-----END PRIVATE KEY-----\n";
    private const NODE_PUB = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=\n-----END PUBLIC KEY-----\n";
    private const NODE_SIG = 'SqOUd7aVEFgs71987MnU3q5BFMFvAPiTMItERr2C/DTtQhmlYQRERnLDwXWTrsV2jDdrNvJgaOpsg+fUxdZ6Ag==';

    public function testZipIsByteIdenticalToNode(): void
    {
        $zip = Zip::create([['name' => 'a/b.txt', 'data' => 'hello hello hello hello hello hello'], ['name' => 'c.bin', 'data' => "\x01\x02\x03"]]);
        $this->assertSame(self::NODE_ZIP, base64_encode($zip));
        $this->assertSame(['a/b.txt', 'c.bin'], Zip::inspect($zip));
    }

    public function testZipFormatDetails(): void
    {
        $zip = Zip::create([['name' => 'x.txt', 'data' => 'abc']]);
        $h   = unpack('Vsig/vver/vflags/vmethod/vtime/vdate', $zip);
        $this->assertSame([0x04034B50, 20, 0x0800, 0, 0, 0x21], array_values($h)); // stored (deflate isn't smaller), 1980-01-01
        $this->assertSame('abc', substr($zip, 30 + 5, 3));
    }

    public function testZipGuardRejectsTraversalSymlinksAndBombs(): void
    {
        $zip  = Zip::create([['name' => 'ok/a.txt', 'data' => 'x']]);
        $evil = substr_replace($zip, '../a.txt', strrpos($zip, 'ok/a.txt'), 8);
        $this->assertRule('zip.path', $evil);
        $this->assertRule('zip.ratio', Zip::create([['name' => 'big', 'data' => str_repeat("\0", 5_000_000)]]));
        $link = Zip::create([['name' => 'l', 'data' => 'target']]);
        $cd   = strrpos($link, "PK\x01\x02");
        $link = substr_replace($link, pack('V', (0o120777 << 16) & 0xFFFFFFFF), $cd + 38, 4);
        $this->assertRule('zip.symlink', $link);
        $this->assertRule('zip.format', 'not a zip at all');
        $this->assertNull(Zip::safeEntryName('/etc/passwd'));
        $this->assertNull(Zip::safeEntryName('C:x'));
        $this->assertNull(Zip::safeEntryName('a\\b'));
        $this->assertSame('a/b/', Zip::safeEntryName('a/b/'));
    }

    private function assertRule(string $rule, string $buf): void
    {
        try {
            Zip::inspect($buf);
            $this->fail("expected {$rule}");
        } catch (ZipProblem $e) {
            $this->assertSame($rule, $e->rule);
        }
    }

    public function testNodePemKeysSignTheSame(): void
    {
        $key = Ed25519Key::fromPem(self::NODE_PEM);
        $this->assertSame(self::NODE_PUB, $key->publicPem());
        // Ed25519 is deterministic: same key + message → same signature as Node.
        $this->assertSame(self::NODE_SIG, $key->sign("catalog text\n"));
        $this->assertTrue(Ed25519Key::verifyWith(Ed25519Key::publicKeyFromPem(self::NODE_PUB), "catalog text\n", self::NODE_SIG));
        $this->assertFalse($key->verify("catalog text", self::NODE_SIG));
        $this->assertSame(self::NODE_PEM, $key->privatePem());
        // Env files often hold the PEM with literal \n escapes.
        $this->assertSame(self::NODE_PUB, Ed25519Key::fromPem(str_replace("\n", '\\n', self::NODE_PEM))->publicPem());
    }

    public function testGeneratedKeysRoundTrip(): void
    {
        $k = Ed25519Key::generate();
        $this->assertSame($k->publicPem(), Ed25519Key::fromPem($k->privatePem())->publicPem());
        $this->assertTrue($k->verify('x', $k->sign('x')));
    }

    public function testJsonMatchesJavaScript(): void
    {
        $this->assertSame("{\n\t\"a\": [\n\t\t1,\n\t\t\"é/x\"\n\t],\n\t\"b\": {}\n}", Json::pretty(['a' => [1, 'é/x'], 'b' => new \stdClass()]));
    }
}
