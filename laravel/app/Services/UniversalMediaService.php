<?php

namespace App\Services;

use App\Models\MediaDownload;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\Process\Process;

class UniversalMediaService
{
    protected static ?string $cachedYtDlp = null;

    protected static ?string $cachedFfmpeg = null;

    protected string $downloadDir;

    protected string $cookiePath;

    public function __construct(protected SafeMediaHttp $http)
    {
        $this->downloadDir = storage_path('app/downloads');
        $this->cookiePath = storage_path('app/cookies.txt');
        File::ensureDirectoryExists($this->downloadDir, 0700);
    }

    public function cleanUrl(string $url): string
    {
        $url = $this->http->normalizeUrl($url);
        $host = strtolower(parse_url($url, PHP_URL_HOST));
        $path = parse_url($url, PHP_URL_PATH) ?: '/';
        if ($host === 'youtu.be' && preg_match('#^/([a-zA-Z0-9_-]{11})/?$#', $path, $match)) {
            return 'https://www.youtube.com/watch?v='.$match[1];
        }

        return $url;
    }

    public function isPublicHost(string $url): bool
    {
        try {
            $this->http->publicAddress($this->cleanUrl($url));

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    public function detectPlatform(string $url): string
    {
        $host = strtolower(parse_url($url, PHP_URL_HOST) ?: '');
        foreach (['youtube.com' => 'YouTube', 'youtu.be' => 'YouTube', 'tiktok.com' => 'TikTok', 'soundcloud.com' => 'SoundCloud', 'suno.com' => 'Suno AI', 'suno.ai' => 'Suno AI'] as $domain => $name) {
            if ($host === $domain || str_ends_with($host, '.'.$domain)) {
                return $name;
            }
        }

        return preg_match('/\.(mp3|wav|m4a|aac|flac|ogg|opus|mp4|webm|mov|mkv)$/i', parse_url($url, PHP_URL_PATH) ?: '') ? 'Direct Media File' : 'Universal';
    }

    public function getStorageUsedBytes(): int
    {
        return array_sum(array_map(fn ($file): int => $file->getSize(), File::allFiles($this->downloadDir)));
    }

    public function getCapabilities(): array
    {
        $used = $this->getStorageUsedBytes();
        $budget = (int) config('media.download_budget_bytes', 524288000);

        return [
            'status' => 'ok', 'server' => 'NTK OmniStream Studio (Laravel Edition)', 'php_version' => PHP_VERSION,
            'yt_dlp' => (bool) config('media.extractor_egress_sandboxed') && (bool) $this->findBinary(['yt-dlp', 'yt-dlp.exe']),
            'ffmpeg' => (bool) $this->findBinary(['ffmpeg', 'ffmpeg.exe']),
            'mobile_api_bypass' => false, 'zero_disk_streaming' => false,
            'cookie_configured' => is_file($this->cookiePath) && filesize($this->cookiePath) > 0,
            'storage' => ['downloads_bytes' => $used, 'downloads_formatted' => $this->formatBytes($used),
                'quota_limit_bytes' => $budget, 'quota_limit_formatted' => $this->formatBytes($budget),
                'quota_used_pct' => round(100 * $used / max(1, $budget), 2), 'safe_threshold_ok' => $used < $budget,
                'scope' => 'Application download budget; excludes other hosting usage'],
            'timestamp' => now()->toIso8601String(),
        ];
    }

    public function resolveMetadata(string $rawUrl): array
    {
        $url = $this->cleanUrl($rawUrl);
        $platform = $this->detectPlatform($url);
        $this->http->publicAddress($url);
        $meta = [];
        if (config('media.extractor_egress_sandboxed') && ($binary = $this->findBinary(['yt-dlp', 'yt-dlp.exe']))) {
            $process = new Process([$binary, '--ignore-config', '--no-cache-dir', '--no-playlist', '--dump-single-json', '--skip-download', '--', $url]);
            $process->setTimeout(20);
            $process->run();
            if ($process->isSuccessful() && strlen($process->getOutput()) <= 2097152) {
                $meta = json_decode($process->getOutput(), true) ?: [];
            }
        }
        $oembed = match ($platform) {
            'YouTube' => 'https://www.youtube.com/oembed',
            'SoundCloud' => 'https://soundcloud.com/oembed',
            'TikTok' => 'https://www.tiktok.com/oembed',
            default => null,
        };
        if (! $meta && $oembed) {
            $response = $this->http->request($oembed.'?'.http_build_query(['url' => $url, 'format' => 'json']));
            if ($response['status'] === 200) {
                $meta = json_decode($response['body'], true) ?: [];
            }
        }
        if (! $meta && $platform !== 'Direct Media File') {
            throw new HttpException(503, 'This host cannot safely resolve this link. Use a direct public media file or the local desktop helper.');
        }
        $title = $meta['title'] ?? pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_FILENAME);
        $artist = $meta['uploader'] ?? $meta['author_name'] ?? $platform;
        $image = $meta['thumbnail'] ?? $meta['thumbnail_url'] ?? asset('assets/icon.svg');

        return ['uuid' => 'omni-'.substr(hash('sha256', $url), 0, 12), 'title' => $title ?: 'Media',
            'artist' => $artist, 'artist_name' => $artist, 'imageLarge' => $image, 'image_url' => $image,
            'duration' => max(0, (int) ($meta['duration'] ?? 0)), 'prompt' => '', 'url' => $url,
            'platform' => $platform, 'format' => strtoupper($meta['ext'] ?? pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION)),
            'direct_stream_url' => $platform === 'Direct Media File' ? $url : null];
    }

    public function streamPassthrough(string $rawUrl, string $format = 'mp3', bool $isAudioOnly = true): never
    {
        $this->cleanUrl($rawUrl);
        throw new HttpException(503, 'Unbuffered media conversion is unavailable. Use the bounded download endpoint or local desktop helper.');
    }

    public function startDownload(string $rawUrl, string $format = 'mp3', bool $isAudioOnly = true): MediaDownload
    {
        $url = $this->cleanUrl($rawUrl);
        $format = strtolower($format);
        if (! in_array($format, ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'mp4', 'webm'], true)) {
            throw new InvalidArgumentException('Unsupported output format.');
        }
        $this->http->publicAddress($url);
        $lock = $this->acquireLock();
        if (! $lock) {
            throw new HttpException(429, 'Another download is processing. Please retry shortly.');
        }
        try {
            $maxBytes = (int) config('media.max_download_bytes', 157286400);
            if ($this->getStorageUsedBytes() + 2 * $maxBytes > (int) config('media.download_budget_bytes', 524288000)) {
                throw new HttpException(507, 'The application download budget has insufficient space.');
            }
            $download = MediaDownload::create(['id' => 'dl_'.Str::random(16), 'url' => $url,
                'platform' => $this->detectPlatform($url), 'format' => $format, 'status' => 'processing', 'progress' => 5]);
            $this->executeDownload($download, $isAudioOnly);

            return $download->fresh();
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public function executeDownload(MediaDownload $download, bool $isAudioOnly): void
    {
        $base = $this->downloadDir.DIRECTORY_SEPARATOR.$download->id;
        $source = $base.'.source';
        $output = $base.'.'.$download->format;
        $maxBytes = (int) config('media.max_download_bytes', 157286400);
        try {
            $ffmpeg = $this->findBinary(['ffmpeg', 'ffmpeg.exe']);
            if (! $ffmpeg) {
                throw new RuntimeException('Media conversion requires FFmpeg on this server. Use the local desktop helper.');
            }
            if ($download->platform === 'Direct Media File') {
                $response = $this->http->request($download->url, maxBytes: $maxBytes, destination: $source);
                if ($response['status'] !== 200 || ! is_file($source) || filesize($source) === 0) {
                    throw new RuntimeException('The media server did not return a complete media file.');
                }
            } else {
                if (! config('media.extractor_egress_sandboxed') || ! ($extractor = $this->findBinary(['yt-dlp', 'yt-dlp.exe']))) {
                    throw new RuntimeException('Hosted extraction is unavailable without a public-network egress sandbox. Use the local desktop helper or a direct media file.');
                }
                $args = [$extractor, '--ignore-config', '--no-cache-dir', '--no-playlist', '--no-part', '--max-filesize', (string) $maxBytes,
                    '-f', $isAudioOnly ? 'bestaudio/best' : 'best[height<=1080]/best', '-o', $source, '--', $download->url];
                $this->runBoundedProcess(new Process($args), [$source], $maxBytes);
            }
            $audio = in_array($download->format, ['mp3', 'wav', 'm4a', 'flac', 'ogg'], true);
            if ($isAudioOnly && ! $audio) {
                throw new RuntimeException('Choose an audio output format for an audio-only download.');
            }
            $args = [$ffmpeg, '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'aac,flac,matroska,webm,mov,mp3,ogg,wav', '-i', $source];
            if ($audio) {
                array_push($args, '-vn');
            }
            array_push($args, '-fs', (string) ($maxBytes + 1), $output);
            $this->runBoundedProcess(new Process($args), [$source, $output], $maxBytes);
            clearstatcache(true, $output);
            if (! is_file($output) || is_link($output) || filesize($output) < 1 || filesize($output) > $maxBytes) {
                throw new RuntimeException('Media conversion did not produce a valid bounded output.');
            }
            $mime = File::mimeType($output) ?: '';
            if (! str_starts_with($mime, 'audio/') && ! str_starts_with($mime, 'video/') && ! in_array($mime, ['application/ogg', 'application/octet-stream'], true)) {
                throw new RuntimeException('The converted output is not recognized as media.');
            }
            $download->update(['status' => 'completed', 'progress' => 100, 'file_path' => $output,
                'file_size' => filesize($output), 'expires_at' => now()->addMinutes(30)]);
        } catch (\Throwable $error) {
            $this->removeJobFiles($download->id);
            $download->update(['status' => 'failed', 'progress' => 0, 'file_path' => null, 'file_size' => 0,
                'error' => $error instanceof RuntimeException ? $error->getMessage() : 'Media processing failed.', 'expires_at' => now()->addMinutes(30)]);
        } finally {
            if (is_file($source) && ! is_link($source)) {
                unlink($source);
            }
        }
    }

    protected function runBoundedProcess(Process $process, array $paths, int $maxBytes): void
    {
        $process->setTimeout(180);
        $process->disableOutput();
        $process->start();
        try {
            while ($process->isRunning()) {
                $process->checkTimeout();
                foreach ($paths as $path) {
                    clearstatcache(true, $path);
                    if (is_file($path) && filesize($path) > $maxBytes) {
                        $process->stop(0.2);
                        throw new RuntimeException('Media exceeds the allowed output size.');
                    }
                }
                if (connection_aborted()) {
                    $process->stop(0.2);
                    throw new RuntimeException('Download was cancelled.');
                }
                usleep(50000);
            }
            if (! $process->isSuccessful()) {
                throw new RuntimeException('Media extraction or conversion failed; incomplete output was discarded.');
            }
        } finally {
            if ($process->isRunning()) {
                $process->stop(0.2);
            }
        }
    }

    public function saveCookies(string $cookieContent): bool
    {
        if (strlen($cookieContent) > 65536 || ($cookieContent !== '' && ! str_contains($cookieContent, '# Netscape HTTP Cookie File'))) {
            throw new InvalidArgumentException('A Netscape cookie file of at most 64 KB is required.');
        }
        $temporary = $this->cookiePath.'.tmp';
        if (file_put_contents($temporary, trim($cookieContent), LOCK_EX) === false) {
            return false;
        }
        @chmod($temporary, 0600);

        return rename($temporary, $this->cookiePath);
    }

    public function getCookies(): string
    {
        return is_file($this->cookiePath) ? (string) file_get_contents($this->cookiePath) : '';
    }

    /** @return resource|false */
    protected function acquireLock()
    {
        $handle = fopen(storage_path('app/downloads.lock'), 'c');
        if (! $handle || ! flock($handle, LOCK_EX | LOCK_NB)) {
            if ($handle) {
                fclose($handle);
            }

            return false;
        }

        return $handle;
    }

    public function containedDownloadPath(string $path): bool
    {
        $real = realpath($path);
        $root = realpath($this->downloadDir);
        if ($real === false || $root === false || is_link($path) || ! is_file($real)) {
            return false;
        }
        if (DIRECTORY_SEPARATOR === '\\') {
            $real = strtolower($real);
            $root = strtolower($root);
        }

        return str_starts_with($real, $root.DIRECTORY_SEPARATOR);
    }

    protected function removeJobFiles(string $id): void
    {
        if (! preg_match('/^dl_[A-Za-z0-9]{16}$/', $id)) {
            return;
        }
        foreach (glob($this->downloadDir.DIRECTORY_SEPARATOR.$id.'.*') ?: [] as $path) {
            if ($this->containedDownloadPath($path)) {
                unlink($path);
            }
        }
    }

    public function pruneExpiredDownloads(int $maxAgeMinutes = 30): int
    {
        if ($maxAgeMinutes < 1 || $maxAgeMinutes > 10080) {
            throw new InvalidArgumentException('max-age must be between 1 and 10080 minutes.');
        }
        $lock = $this->acquireLock();
        if (! $lock) {
            return 0;
        }
        $count = 0;
        try {
            // The shared execution lock proves no synchronous worker is active.
            foreach (MediaDownload::whereIn('status', ['processing', 'queued'])->where('updated_at', '<=', now()->subMinutes(max(30, $maxAgeMinutes)))->get() as $stale) {
                $this->removeJobFiles($stale->id);
                $stale->update(['status' => 'failed', 'error' => 'An interrupted download expired; incomplete files were discarded.', 'file_path' => null, 'file_size' => 0, 'progress' => 0, 'expires_at' => now()->addMinutes(30)]);
            }
            $jobs = MediaDownload::whereIn('status', ['completed', 'failed'])
                ->where('expires_at', '<=', now())->where('updated_at', '<=', now()->subMinutes($maxAgeMinutes))->get();
            foreach ($jobs as $job) {
                $handle = null;
                if ($job->file_path && file_exists($job->file_path)) {
                    if (! $this->containedDownloadPath($job->file_path)) {
                        continue;
                    }
                    $handle = fopen($job->file_path, 'rb');
                    if (! $handle || ! flock($handle, LOCK_EX | LOCK_NB)) {
                        if ($handle) {
                            fclose($handle);
                        }

                        continue;
                    }
                    flock($handle, LOCK_UN);
                    fclose($handle);
                    // Readers hold the shared global lock through response completion.
                    if (! unlink($job->file_path)) {
                        continue;
                    }
                }
                $this->removeJobFiles($job->id);
                $job->delete();
                $count++;
            }

            return $count;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    protected function findBinary(array $binaryNames): ?string
    {
        $isFfmpeg = in_array('ffmpeg', $binaryNames) || in_array('ffmpeg.exe', $binaryNames);
        if ($isFfmpeg && self::$cachedFfmpeg !== null) {
            return self::$cachedFfmpeg;
        }
        if (! $isFfmpeg && self::$cachedYtDlp !== null) {
            return self::$cachedYtDlp;
        }

        // Check environment variable overrides (useful for AlwaysData / custom VPS)
        $envOverride = config($isFfmpeg ? 'media.ffmpeg_path' : 'media.yt_dlp_path');
        if (! empty($envOverride) && file_exists($envOverride)) {
            if ($isFfmpeg) {
                self::$cachedFfmpeg = $envOverride;
            } else {
                self::$cachedYtDlp = $envOverride;
            }

            return $envOverride;
        }

        // Check system PATH
        foreach ($binaryNames as $name) {
            $command = (DIRECTORY_SEPARATOR === '\\') ? "where {$name} 2>NUL" : "which {$name} 2>/dev/null";
            $output = @shell_exec($command);
            if (! empty($output)) {
                $lines = explode("\n", trim($output));
                $path = trim($lines[0]);
                if (file_exists($path)) {
                    if ($isFfmpeg) {
                        self::$cachedFfmpeg = $path;
                    } else {
                        self::$cachedYtDlp = $path;
                    }

                    return $path;
                }
            }
        }

        // Check common user-level install directories on shared Linux hosting (e.g. AlwaysData ~/.local/bin)
        $homeDir = getenv('HOME') ?: ($_SERVER['HOME'] ?? '');
        $candidatePaths = $isFfmpeg ? [
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            $homeDir.'/.local/bin/ffmpeg',
            $homeDir.'/bin/ffmpeg',
        ] : [
            '/usr/bin/yt-dlp',
            '/usr/local/bin/yt-dlp',
            $homeDir.'/.local/bin/yt-dlp',
            $homeDir.'/bin/yt-dlp',
        ];

        foreach ($candidatePaths as $candidate) {
            if (! empty($candidate) && file_exists($candidate) && is_file($candidate)) {
                if ($isFfmpeg) {
                    self::$cachedFfmpeg = $candidate;
                } else {
                    self::$cachedYtDlp = $candidate;
                }

                return $candidate;
            }
        }

        if ($isFfmpeg) {
            self::$cachedFfmpeg = '';
        }
        if (! $isFfmpeg) {
            self::$cachedYtDlp = '';
        }

        return null;
    }

    protected function formatBytes(int $bytes): string
    {
        return $bytes >= 1048576 ? number_format($bytes / 1048576, 1).' MB' : number_format($bytes / 1024, 1).' KB';
    }
}
