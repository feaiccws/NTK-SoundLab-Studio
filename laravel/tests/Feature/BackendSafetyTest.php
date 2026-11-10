<?php

namespace Tests\Feature;

use App\Http\Controllers\OmniStreamController;
use App\Models\MediaDownload;
use App\Services\SafeMediaHttp;
use App\Services\UniversalMediaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class BackendSafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_cookies_fail_closed_and_never_return_cookie_contents(): void
    {
        config(['media.admin_key' => '']);
        $this->postJson('/api/omni/cookies', ['cookies' => '# Netscape HTTP Cookie File'])->assertForbidden();
        $this->getJson('/api/omni/cookies')->assertForbidden();
        $this->assertFileDoesNotExist(storage_path('app/cookies.txt'));
        config(['media.admin_key' => 'synthetic-admin-key']);
        $this->postJson('/api/omni/cookies', ['admin_key' => 'synthetic-admin-key', 'cookies' => 'bad'])->assertForbidden();
        $this->withHeader('X-Admin-Key', 'synthetic-admin-key')->postJson('/api/omni/cookies', ['cookies' => 'bad'])->assertUnprocessable();
        $contents = "# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\tsession\tsynthetic-secret";
        $this->withHeader('X-Admin-Key', 'synthetic-admin-key')->postJson('/api/omni/cookies', ['cookies' => $contents])->assertOk()->assertJson(['success' => true]);
        $response = $this->withHeader('X-Admin-Key', 'synthetic-admin-key')->getJson('/api/omni/cookies')->assertOk()->assertJson(['configured' => true]);
        $this->assertStringNotContainsString('synthetic-secret', $response->getContent());
    }

    public function test_unsafe_urls_and_non_string_payloads_reject_before_transport(): void
    {
        foreach (['file:///etc/passwd', 'http://127.0.0.1/a.mp3', 'http://169.254.169.254/a.mp3', 'https://example.com:8443/a.mp3'] as $url) {
            $this->postJson('/api/omni/download', ['url' => $url])->assertUnprocessable();
        }
        $this->postJson('/api/omni/download', ['url' => ['bad']])->assertBadRequest();
        $this->getJson('/api/suno/unshorten?url='.urlencode('http://127.0.0.1/s/anything'))->assertUnprocessable();
        $this->getJson('/api/suno/unshorten?url='.urlencode('https://suno.com.attacker.example/s/anything'))->assertUnprocessable();
        $this->assertDatabaseCount('media_downloads', 0);
    }

    public function test_suno_proxy_preserves_upstream_failure_and_range_metadata(): void
    {
        $this->app->instance(SafeMediaHttp::class, new class extends SafeMediaHttp
        {
            public int $status = 206;

            public function request(string $url, string $method = 'GET', array $headers = [], ?string $body = null, int $maxBytes = 2097152, ?string $destination = null, array $allowedHosts = []): array
            {
                if ($destination) {
                    file_put_contents($destination, 'abc');
                }

                return ['status' => $this->status, 'headers' => ['content-range' => 'bytes 0-2/10'], 'body' => '', 'url' => $url];
            }
        });
        $id = '11111111-1111-1111-1111-111111111111';
        $result = $this->withHeader('Range', 'bytes=0-2')->get('/api/suno/stream/'.$id);
        $result->assertStatus(206)->assertHeader('Content-Range', 'bytes 0-2/10');
        $this->assertSame('abc', $result->streamedContent());
        $this->assertSame([], glob(storage_path('app/suno-streams/stream-*')));
        $this->app->make(SafeMediaHttp::class)->status = 404;
        $this->get('/api/suno/stream/'.$id)->assertNotFound();
        $this->withHeader('Range', 'bytes=0-2,4-5')->get('/api/suno/stream/'.$id)->assertStatus(416);
    }

    public function test_no_insecure_retry_after_provider_transport_failure(): void
    {
        $transport = new class extends SafeMediaHttp
        {
            public int $calls = 0;

            public function request(string $url, string $method = 'GET', array $headers = [], ?string $body = null, int $maxBytes = 2097152, ?string $destination = null, array $allowedHosts = []): array
            {
                $this->calls++;
                throw new \RuntimeException('Synthetic certificate failure');
            }
        };
        $this->app->instance(SafeMediaHttp::class, $transport);
        $this->postJson('/api/mango/rights', ['uuid' => '11111111-1111-1111-1111-111111111111'])->assertStatus(502);
        $this->assertSame(1, $transport->calls);
    }

    public function test_prune_only_removes_expired_terminal_jobs_and_recovers_abandoned_jobs(): void
    {
        $service = $this->app->make(UniversalMediaService::class);
        $expired = $this->job('dl_aaaaaaaaaaaaaaaa', 'completed', true);
        $fresh = $this->job('dl_bbbbbbbbbbbbbbbb', 'completed', false);
        $active = $this->job('dl_cccccccccccccccc', 'processing', false);
        $stale = $this->job('dl_dddddddddddddddd', 'processing', true);
        $outside = $this->job('dl_eeeeeeeeeeeeeeee', 'completed', true);
        $outsidePath = storage_path('app/preserved.txt');
        file_put_contents($outsidePath, 'preserve');
        $outside->forceFill(['file_path' => $outsidePath, 'updated_at' => now()->subHours(2)])->save();
        $this->assertSame(1, $service->pruneExpiredDownloads(30));
        $this->assertFileDoesNotExist($expired->file_path);
        $this->assertFileExists($fresh->file_path);
        $this->assertFileExists($active->file_path);
        $this->assertFileExists($outsidePath);
        $this->assertSame('failed', $stale->fresh()->status);
        $this->assertNull($stale->fresh()->file_path);
        $this->assertDatabaseHas('media_downloads', ['id' => $outside->id]);
    }

    public function test_prune_waits_for_active_read_response_and_download_lock(): void
    {
        $service = $this->app->make(UniversalMediaService::class);
        $job = $this->job('dl_ffffffffffffffff', 'completed', false);
        $response = $this->app->make(OmniStreamController::class)->stream($job->id);
        $job->forceFill(['expires_at' => now()->subHour(), 'updated_at' => now()->subHours(2)])->save();
        $this->assertSame(0, $service->pruneExpiredDownloads(30));
        $this->assertFileExists($job->file_path);
        unset($response);
        $this->assertSame(1, $service->pruneExpiredDownloads(30));
        $this->artisan('omni:prune', ['--max-age' => 0])->assertExitCode(2);
    }

    public function test_partial_or_failed_converter_output_never_completes(): void
    {
        $transport = new class extends SafeMediaHttp
        {
            public function publicAddress(string $url): string
            {
                return '8.8.8.8';
            }

            public function request(string $url, string $method = 'GET', array $headers = [], ?string $body = null, int $maxBytes = 2097152, ?string $destination = null, array $allowedHosts = []): array
            {
                file_put_contents($destination, 'synthetic-source');

                return ['status' => 200, 'headers' => [], 'body' => '', 'url' => $url];
            }
        };
        $service = new class($transport) extends UniversalMediaService
        {
            protected function findBinary(array $names): ?string
            {
                return PHP_BINARY;
            }

            protected function runBoundedProcess(Process $process, array $paths, int $maxBytes): void
            {
                file_put_contents($paths[count($paths) - 1], 'partial');
                throw new \RuntimeException('Synthetic failed conversion');
            }
        };
        $job = $service->startDownload('https://media.example/a.wav', 'mp3', true);
        $this->assertSame('failed', $job->status);
        $this->assertNull($job->file_path);
        $this->assertSame([], glob(storage_path('app/downloads/'.$job->id.'.*')));
    }

    protected function job(string $id, string $status, bool $old): MediaDownload
    {
        $path = storage_path('app/downloads/'.$id.'.mp3');
        file_put_contents($path, 'synthetic-media');
        $job = MediaDownload::create(['id' => $id, 'url' => 'https://media.example/a.mp3', 'status' => $status, 'file_path' => $path, 'expires_at' => $old ? now()->subHour() : now()->addHour()]);
        if ($old) {
            $job->forceFill(['updated_at' => now()->subHours(2)])->save();
        }

        return $job;
    }

    public function test_actual_ffmpeg_converts_synthetic_wav_to_mp3(): void
    {
        $binary = trim((string) shell_exec(DIRECTORY_SEPARATOR === '\\' ? 'where ffmpeg 2>NUL' : 'command -v ffmpeg'));
        $binary = strtok($binary, "\r\n");
        if (! $binary || ! is_file($binary)) {
            $this->markTestSkipped('FFmpeg not installed in test environment.');
        }
        config(['media.ffmpeg_path' => $binary]);
        $transport = new class extends SafeMediaHttp
        {
            public function publicAddress(string $url): string
            {
                return '8.8.8.8';
            }

            public function request(string $url, string $method = 'GET', array $headers = [], ?string $body = null, int $maxBytes = 2097152, ?string $destination = null, array $allowedHosts = []): array
            {
                $pcm = str_repeat("\0", 16000);
                $wav = 'RIFF'.pack('V', 36 + strlen($pcm)).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16).'data'.pack('V', strlen($pcm)).$pcm;
                file_put_contents($destination, $wav);

                return ['status' => 200, 'headers' => [], 'body' => '', 'url' => $url];
            }
        };
        $service = new UniversalMediaService($transport);
        $job = $service->startDownload('https://media.example/a.wav', 'mp3', true);
        $this->assertSame('completed', $job->status, $job->error ?? '');
        $this->assertFileExists($job->file_path);
        $this->assertGreaterThan(100, filesize($job->file_path));
        $this->assertSame('audio/mpeg', mime_content_type($job->file_path));
        $this->assertFileDoesNotExist(storage_path('app/downloads/'.$job->id.'.source'));
    }
}
