<?php

namespace Tests\Unit;

use App\Libraries\Storage\S3BlobStore;
use App\Libraries\Storage\SigV4;
use CodeIgniter\Test\CIUnitTestCase;

/**
 * SigV4 against AWS's published examples (Signature Version 4 test suite
 * "get-vanilla"; S3 docs "Signature Calculations for the Authorization
 * Header", GET Object example) and against the AWS SDK signer
 * (@smithy/signature-v4) for the S3/R2 requests the library sends.
 */
final class SigV4Test extends CIUnitTestCase
{
    public function testAwsTestSuiteGetVanilla(): void
    {
        $sig = SigV4::sign('GET', '/', [], ['Host' => 'example.amazonaws.com', 'X-Amz-Date' => '20150830T123600Z'], hash('sha256', ''), 'us-east-1', 'service', 'AKIDEXAMPLE', 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY');
        $this->assertSame("GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", $sig['canonical']);
        $this->assertSame('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31', $sig['authorization']);
    }

    public function testAwsS3DocsGetObjectExample(): void
    {
        $empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        $sig   = SigV4::sign('GET', '/test.txt', [], ['Host' => 'examplebucket.s3.amazonaws.com', 'Range' => 'bytes=0-9', 'x-amz-content-sha256' => $empty, 'x-amz-date' => '20130524T000000Z'], $empty, 'us-east-1', 's3', 'AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
        $this->assertSame('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41', $sig['signature']);
    }

    public function testQueryStringsAreCanonicalised(): void
    {
        $sig = SigV4::sign('GET', '/', ['Param2' => 'value2', 'Param1' => 'value 1'], ['host' => 'example.amazonaws.com', 'x-amz-date' => '20150830T123600Z'], hash('sha256', ''), 'us-east-1', 'service', 'AKIDEXAMPLE', 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY');
        $this->assertStringContainsString("\nParam1=value%201&Param2=value2\n", $sig['canonical']);
    }

    /** Expected values from the AWS SDK signer, as tests/storage.test.js checks the Node signer. */
    public function testS3RequestsMatchTheAwsSdk(): void
    {
        $store = new S3BlobStore('https://acct.r2.cloudflarestorage.com', 'library', 'AKIDEXAMPLE', 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', 'auto', 'prod', static fn () => strtotime('2026-10-24T09:30:00Z'));
        $cases = [
            ['PUT', 'packages/warm-film-1.0.0.zip', ['content-type' => 'application/zip'], 'zip bytes', '/library/prod/packages/warm-film-1.0.0.zip', '1ddcbc043f4d3db51083ff22723aa4e6f0d57dea0cf5f60bb518fb40fea0753c'],
            ['GET', 'originals/ab cd+ef(1)!.png', ['range' => 'bytes=0-99'], null, '/library/prod/originals/ab%20cd%2Bef%281%29%21.png', '98ed2070801808856287a1d5716882d3163eb1613813044a40ed154ae059f861'],
            ['HEAD', 'packages/x.zip', [], null, '/library/prod/packages/x.zip', 'da5bf1ca41052436e12d458296eacbb22babe9e3c81eb55426e3b391750d9e2a'],
        ];
        foreach ($cases as [$method, $key, $headers, $body, $path, $expected]) {
            $req = $store->signRequest($method, $key, $headers, $body);
            $this->assertSame($path, $req['path'], $key);
            $this->assertStringEndsWith("Signature={$expected}", $req['headers']['authorization'], "{$method} {$key}");
            $this->assertSame($body === null ? 'UNSIGNED-PAYLOAD' : hash('sha256', $body), $req['headers']['x-amz-content-sha256']);
        }
    }
}
