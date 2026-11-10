<?php

namespace Tests\Unit;

use App\Services\SafeMediaHttp;
use PHPUnit\Framework\TestCase;

class SafeMediaHttpTest extends TestCase
{
    public function test_private_reserved_and_alternate_addresses_are_not_public(): void
    {
        $http = new SafeMediaHttp;
        foreach (['127.0.0.2', '10.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '64:ff9b::7f00:1', '2002:7f00:1::'] as $address) {
            $this->assertFalse($http->isPublicAddress($address), $address);
        }
        $this->assertTrue($http->isPublicAddress('8.8.8.8'));
    }

    protected function transport(array $dns, array $responses): SafeMediaHttp
    {
        return new class($dns, $responses) extends SafeMediaHttp
        {
            public array $calls = [];

            public function __construct(public array $dns, public array $responses) {}

            protected function resolveAddresses(string $host): array
            {
                return $this->dns[$host] ?? [];
            }

            protected function transfer(string $url, string $ip, string $method, array $headers, ?string $body, int $maxBytes, ?string $destination): array
            {
                $this->calls[] = [$url, $ip, $maxBytes];

                return array_shift($this->responses);
            }
        };
    }

    public function test_mixed_dns_answers_are_rejected_before_transfer(): void
    {
        $http = $this->transport(['media.example' => ['8.8.8.8', '127.0.0.1']], []);
        try {
            $http->request('https://media.example/a');
            $this->fail('Private DNS must reject');
        } catch (\InvalidArgumentException) {
            $this->assertSame([], $http->calls);
        }
    }

    public function test_redirects_revalidate_dns_and_keep_checked_address(): void
    {
        $http = $this->transport(['media.example' => ['8.8.8.8'], 'private.example' => ['10.0.0.1']], [
            ['status' => 302, 'headers' => ['location' => 'https://private.example/a'], 'body' => ''],
        ]);
        try {
            $http->request('https://media.example/a', maxBytes: 1024);
            $this->fail('Private redirect must reject');
        } catch (\InvalidArgumentException) {
            $this->assertSame([['https://media.example/a', '8.8.8.8', 1024]], $http->calls);
        }
    }

    public function test_relative_redirect_preserves_final_url_and_body(): void
    {
        $http = $this->transport(['media.example' => ['8.8.8.8']], [
            ['status' => 302, 'headers' => ['location' => '/final'], 'body' => ''],
            ['status' => 200, 'headers' => [], 'body' => 'valid'],
        ]);
        $response = $http->request('https://media.example/start');
        $this->assertSame('https://media.example/final', $response['url']);
        $this->assertSame('valid', $response['body']);
        $this->assertCount(2, $http->calls);
    }

    public function test_redirects_cannot_downgrade_tls_or_escape_provider_allowlist(): void
    {
        foreach (['http://media.example/a', 'https://other.example/a'] as $redirect) {
            $http = $this->transport(['media.example' => ['8.8.8.8']], [['status' => 302, 'headers' => ['location' => $redirect], 'body' => '']]);
            try {
                $http->request('https://media.example/a', allowedHosts: ['media.example']);
                $this->fail('Unsafe redirect accepted');
            } catch (\InvalidArgumentException|\RuntimeException) {
                $this->assertCount(1, $http->calls);
            }
        }
    }

    public function test_urls_reject_credentials_schemes_ports_and_controls(): void
    {
        $http = new SafeMediaHttp;
        foreach (['file:///etc/passwd', 'https://user:pass@example.com/a', 'http://example.com:8000/a', "https://example.com/a\nheader", 'http://localhost/a'] as $url) {
            try {
                $http->normalizeUrl($url);
                $this->fail('Unsafe URL accepted');
            } catch (\InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }
}
