<?php

namespace App\Http\Controllers;

use App\Services\SafeMediaHttp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SunoProxyController extends Controller
{
    public function __construct(protected SafeMediaHttp $http) {}

    protected function validId(mixed $id): bool
    {
        return is_string($id) && preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i', $id);
    }

    public function mangoRights(Request $request): JsonResponse
    {
        $id = $request->input('content_params.content_id') ?? $request->input('content_id') ?? $request->input('uuid');
        if (! $this->validId($id)) {
            return response()->json(['error' => 'Invalid or missing Suno song content UUID.'], 422);
        }
        $payload = json_encode(['content_params' => ['content_id' => strtolower($id), 'content_type' => 'clip']], JSON_THROW_ON_ERROR);

        return $this->proxyJson('https://studio-api.prod.suno.com/api/mango/rights', 'POST', $payload);
    }

    protected function proxyJson(string $url, string $method = 'GET', ?string $body = null): JsonResponse
    {
        try {
            $result = $this->http->request($url, $method, ['Content-Type' => 'application/json'], $body, allowedHosts: ['studio-api.prod.suno.com']);
            $data = json_decode($result['body'], true);
            if ($result['status'] < 200 || $result['status'] >= 300 || ! is_array($data)) {
                return response()->json(['error' => 'Suno could not supply this resource.'], $result['status'] >= 400 && $result['status'] < 600 ? $result['status'] : 502);
            }

            return response()->json($data)->header('Cache-Control', 'no-store');
        } catch (\Throwable) {
            return response()->json(['error' => 'Could not securely reach Suno. Check the server CA certificates and connection.'], 502);
        }
    }

    public function clipMetadata(string $id): JsonResponse
    {
        if (! $this->validId($id)) {
            return response()->json(['error' => 'Invalid UUID.'], 422);
        }

        return $this->proxyJson('https://studio-api.prod.suno.com/api/clip/'.strtolower($id));
    }

    public function playlistMetadata(Request $request, string $id): JsonResponse
    {
        if (! $this->validId($id)) {
            return response()->json(['error' => 'Invalid UUID.'], 422);
        }
        $page = $request->query('page', '1');
        if (! is_scalar($page) || ! preg_match('/^[1-9][0-9]{0,3}$/', (string) $page)) {
            return response()->json(['error' => 'Invalid playlist page.'], 422);
        }

        return $this->proxyJson('https://studio-api.prod.suno.com/api/playlist/'.strtolower($id).'/?page='.$page);
    }

    public function unshorten(Request $request): JsonResponse
    {
        $raw = $request->query('url') ?? $request->input('url');
        if (! is_string($raw) || $raw === '') {
            return response()->json(['error' => 'Missing url parameter.'], 400);
        }
        try {
            $url = $this->http->normalizeUrl($raw);
            $hosts = ['suno.com', 'www.suno.com', 'suno.ai', 'www.suno.ai'];
            if (! in_array(strtolower(parse_url($url, PHP_URL_HOST)), $hosts, true)) {
                return response()->json(['error' => 'A Suno song or short link is required.'], 422);
            }
            $path = parse_url($url, PHP_URL_PATH) ?: '';
            if (! preg_match('#^/song/([0-9a-f-]+)/?$#i', $path, $match)) {
                if (! preg_match('#^/s/[a-zA-Z0-9_-]+/?$#', $path)) {
                    return response()->json(['error' => 'A Suno song or short link is required.'], 422);
                }
                $result = $this->http->request($url, allowedHosts: $hosts);
                if ($result['status'] !== 200 || ! preg_match('#^/song/([0-9a-f-]+)/?$#i', parse_url($result['url'], PHP_URL_PATH) ?: '', $match)) {
                    return response()->json(['error' => 'Could not resolve Suno UUID from link.'], 404);
                }
            }
            if (! $this->validId($match[1])) {
                return response()->json(['error' => 'Invalid UUID.'], 422);
            }
            $id = strtolower($match[1]);

            return response()->json(['status' => 'ok', 'uuid' => $id, 'target_url' => 'https://suno.com/song/'.$id]);
        } catch (\InvalidArgumentException) {
            return response()->json(['error' => 'Only public Suno links are supported.'], 422);
        } catch (\Throwable) {
            return response()->json(['error' => 'Could not securely resolve this Suno link.'], 502);
        }
    }

    public function streamAudio(Request $request, string $id): StreamedResponse|JsonResponse
    {
        $id = preg_replace('/\.m4a$/i', '', $id);
        if (! $this->validId($id)) {
            return response()->json(['error' => 'Invalid UUID.'], 422);
        }
        $range = $request->header('Range');
        if ($range && ! preg_match('/^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/', $range)) {
            return response()->json(['error' => 'Only one valid byte range is supported.'], 416);
        }
        $dir = storage_path('app/suno-streams');
        File::ensureDirectoryExists($dir, 0700);
        $lock = fopen(storage_path('app/suno-streams.lock'), 'c');
        if (! $lock || ! flock($lock, LOCK_EX | LOCK_NB)) {
            if ($lock) {
                fclose($lock);
            }

            return response()->json(['error' => 'Another audio transfer is active. Please retry shortly.'], 429);
        }
        $release = static function () use (&$lock): void {
            if (is_resource($lock)) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
            $lock = null;
        };
        $temporary = tempnam($dir, 'stream-');
        if ($temporary === false) {
            $release();

            return response()->json(['error' => 'Temporary stream storage is unavailable.'], 503);
        }
        register_shutdown_function(static function () use ($temporary, $release): void {
            if (is_file($temporary)) {
                @unlink($temporary);
            }
            $release();
        });
        try {
            $result = $this->http->request('https://d2lwuy8qc234o3.cloudfront.net/1/clip/'.strtolower($id).'.m4a', headers: $range ? ['Range' => $range] : [], maxBytes: 150 * 1024 * 1024, destination: $temporary, allowedHosts: ['d2lwuy8qc234o3.cloudfront.net']);
            if (! in_array($result['status'], [200, 206], true)) {
                @unlink($temporary);
                $release();

                return response()->json(['error' => 'The audio provider could not supply this track.'], $result['status'] >= 400 && $result['status'] < 600 ? $result['status'] : 502);
            }
            $headers = ['Content-Type' => 'audio/mp4', 'Cache-Control' => 'no-store', 'Accept-Ranges' => 'bytes', 'Content-Length' => (string) filesize($temporary)];
            if (isset($result['headers']['content-range'])) {
                $headers['Content-Range'] = $result['headers']['content-range'];
            }

            return response()->stream(static function () use ($temporary, $release): void {
                $file = fopen($temporary, 'rb');
                try {
                    if ($file) {
                        while (! feof($file) && ! connection_aborted()) {
                            echo fread($file, 65536);
                        }
                    }
                } finally {
                    if ($file) {
                        fclose($file);
                    }
                    @unlink($temporary);
                    $release();
                }
            }, $result['status'], $headers);
        } catch (\Throwable) {
            @unlink($temporary);
            $release();

            return response()->json(['error' => 'The audio transfer failed or exceeded the 150 MB limit.'], 502);
        }
    }
}
