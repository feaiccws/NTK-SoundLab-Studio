<?php

namespace App\Services;

use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use InvalidArgumentException;
use RuntimeException;

class SafeMediaHttp
{
    public function normalizeUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '' || strlen($url) > 8192 || preg_match('/[\x00-\x20\x7f\\\\]/', $url)) {
            throw new InvalidArgumentException('Invalid media URL.');
        }
        $parts = parse_url($url);
        if (! $parts || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
            || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])
            || ! filter_var($url, FILTER_VALIDATE_URL)) {
            throw new InvalidArgumentException('Only HTTP and HTTPS URLs without embedded credentials are supported.');
        }
        $host = strtolower(trim($parts['host'], '[]'));
        $port = $parts['port'] ?? (strtolower($parts['scheme']) === 'https' ? 443 : 80);
        if ($port !== (strtolower($parts['scheme']) === 'https' ? 443 : 80)) {
            throw new InvalidArgumentException('Only standard HTTP and HTTPS ports are supported.');
        }
        if ($host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local')) {
            throw new InvalidArgumentException('Private network URLs are not permitted.');
        }
        if (filter_var($host, FILTER_VALIDATE_IP) && ! $this->isPublicAddress($host)) {
            throw new InvalidArgumentException('Private or reserved network addresses are not permitted.');
        }

        return (string) (new Uri($url))->withScheme(strtolower($parts['scheme']))->withHost(strtolower($parts['host']))->withFragment('');
    }

    public function isPublicAddress(string $address): bool
    {
        return (bool) filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_GLOBAL_RANGE | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)
            && ! preg_match('/^(?:::ffff:|64:ff9b:|2002:)/i', $address);
    }

    /** @return array<int, string> */
    protected function resolveAddresses(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$host];
        }
        $records = dns_get_record($host, DNS_A | DNS_AAAA);

        return array_values(array_unique(array_filter(array_map(
            fn (array $record): ?string => $record['ip'] ?? $record['ipv6'] ?? null,
            $records ?: [],
        ))));
    }

    public function publicAddress(string $url): string
    {
        $url = $this->normalizeUrl($url);
        $host = trim(parse_url($url, PHP_URL_HOST), '[]');
        $addresses = $this->resolveAddresses($host);
        if (! $addresses) {
            throw new InvalidArgumentException('The media host could not be resolved.');
        }
        foreach ($addresses as $address) {
            if (! $this->isPublicAddress($address)) {
                throw new InvalidArgumentException('The media host resolves to a private or reserved address.');
            }
        }

        return $addresses[0];
    }

    /** @return array{status: int, headers: array<string, string>, body: string, url: string} */
    public function request(string $url, string $method = 'GET', array $headers = [], ?string $body = null, int $maxBytes = 2097152, ?string $destination = null, array $allowedHosts = []): array
    {
        $url = $this->normalizeUrl($url);
        if ($maxBytes < 1 || $maxBytes > 157286400) {
            throw new InvalidArgumentException('Invalid response size limit.');
        }
        for ($hop = 0; $hop <= 3; $hop++) {
            $host = strtolower(parse_url($url, PHP_URL_HOST));
            if ($allowedHosts && ! in_array($host, $allowedHosts, true)) {
                throw new InvalidArgumentException('Redirect to an unsupported host was rejected.');
            }
            $ip = $this->publicAddress($url);
            try {
                $response = $this->transfer($url, $ip, $method, $headers, $body, $maxBytes, $destination);
            } catch (\Throwable $error) {
                if ($destination !== null && is_file($destination) && ! is_link($destination)) {
                    unlink($destination);
                }
                throw $error;
            }
            if ($response['status'] >= 300 && $response['status'] < 400) {
                if ($hop === 3 || empty($response['headers']['location']) || $method !== 'GET') {
                    throw new RuntimeException('Unsupported or excessive media redirects.');
                }
                $next = (string) UriResolver::resolve(new Uri($url), new Uri($response['headers']['location']));
                if (parse_url($url, PHP_URL_SCHEME) === 'https' && parse_url($next, PHP_URL_SCHEME) !== 'https') {
                    throw new RuntimeException('An insecure media redirect was rejected.');
                }
                $url = $this->normalizeUrl($next);

                continue;
            }

            return [...$response, 'url' => $url];
        }
        throw new RuntimeException('Unable to fetch media.');
    }

    /** @return array{status: int, headers: array<string, string>, body: string} */
    protected function transfer(string $url, string $ip, string $method, array $headers, ?string $body, int $maxBytes, ?string $destination): array
    {
        if (! extension_loaded('curl')) {
            throw new RuntimeException('Secure media requests require the PHP cURL extension.');
        }
        $parts = parse_url($url);
        $host = trim($parts['host'], '[]');
        $port = $parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80);
        $pinnedIp = str_contains($ip, ':') ? '['.$ip.']' : $ip;
        $received = 0;
        $status = 0;
        $responseHeaders = [];
        $responseBody = '';
        $limitExceeded = false;
        $headerLines = ['Accept: */*'];
        foreach ($headers as $key => $value) {
            if (preg_match('/[\r\n]/', $key.$value)) {
                throw new InvalidArgumentException('Invalid request header.');
            }
            $headerLines[] = $key.': '.$value;
        }
        $file = $destination !== null ? @fopen($destination, 'wb') : null;
        if ($destination !== null && ! $file) {
            throw new RuntimeException('Unable to create the temporary media file.');
        }
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_PROXY => '',
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_RESOLVE => [$host.':'.$port.':'.$pinnedIp],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_LOW_SPEED_LIMIT => 128,
            CURLOPT_LOW_SPEED_TIME => 20,
            CURLOPT_USERAGENT => 'NTK-Hub-OmniStream/2026.11',
            CURLOPT_HEADERFUNCTION => function ($handle, string $line) use (&$status, &$responseHeaders, &$limitExceeded, $maxBytes): int {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $match)) {
                    $status = (int) $match[1];
                    $responseHeaders = [];
                } elseif (str_contains($line, ':')) {
                    [$key, $value] = explode(':', $line, 2);
                    $responseHeaders[strtolower(trim($key))] = trim($value);
                    if (strtolower(trim($key)) === 'content-length' && (int) trim($value) > $maxBytes && $status >= 200 && $status < 300) {
                        $limitExceeded = true;

                        return 0;
                    }
                }

                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($handle, string $chunk) use (&$received, &$responseBody, &$limitExceeded, &$status, $maxBytes, $file): int {
                $length = strlen($chunk);
                $received += $length;
                if ($received > $maxBytes) {
                    $limitExceeded = true;

                    return 0;
                }
                if ($file && $status >= 200 && $status < 300) {
                    $written = fwrite($file, $chunk);

                    return $written === false ? 0 : $written;
                }
                if (! $file) {
                    $responseBody .= $chunk;
                }

                return $length;
            },
        ]);
        if ($body !== null) {
            curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
        }
        try {
            $ok = curl_exec($curl);
            if ($ok === false) {
                throw new RuntimeException($limitExceeded ? 'Media response exceeds the allowed size.' : 'Secure media request failed or timed out.');
            }

            return ['status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), 'headers' => $responseHeaders, 'body' => $responseBody];
        } finally {
            curl_close($curl);
            if ($file) {
                fclose($file);
            }
        }
    }
}
