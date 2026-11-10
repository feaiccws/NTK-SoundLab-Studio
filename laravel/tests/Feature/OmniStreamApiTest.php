<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OmniStreamApiTest extends TestCase
{
    use RefreshDatabase;
    /**
     * Test capabilities endpoint returns operational status and storage quota info.
     */
    public function test_capabilities_endpoint_returns_status_and_storage(): void
    {
        $response = $this->get('/api/capabilities');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'status',
            'server',
            'php_version',
            'yt_dlp',
            'ffmpeg',
            'storage' => [
                'downloads_bytes',
                'downloads_formatted',
                'quota_limit_bytes',
                'quota_limit_formatted',
                'quota_used_pct',
                'safe_threshold_ok',
            ],
            'timestamp',
        ]);
        $this->assertEquals('ok', $response->json('status'));
    }

    /**
     * Test health endpoint alias.
     */
    public function test_health_endpoint(): void
    {
        $response = $this->get('/api/health');
        $response->assertStatus(200);
        $this->assertEquals('ok', $response->json('status'));
    }

    /**
     * Test media resolve rejects missing url parameter.
     */
    public function test_resolve_rejects_missing_url(): void
    {
        $response = $this->getJson('/api/omni/resolve');
        $response->assertStatus(400);
        $response->assertJson([
            'error' => "Missing 'url' query parameter.",
        ]);
    }

    /**
     * Test media resolve rejects invalid scheme (e.g. file:// or command flag).
     */
    public function test_resolve_rejects_invalid_url_protocol(): void
    {
        $response = $this->getJson('/api/omni/resolve?url=file:///etc/passwd');
        $response->assertStatus(422);
        $this->assertStringContainsString('HTTP and HTTPS', $response->json('error'));
    }

    /**
     * Test status endpoint returns 404 for unknown job.
     */
    public function test_status_returns_404_for_unknown_job(): void
    {
        $response = $this->getJson('/api/omni/status/non-existent-uuid');
        $response->assertStatus(404);
        $response->assertJson([
            'error' => 'Job not found.',
        ]);
    }

    /**
     * Test Mango Rights proxy rejects invalid or missing UUID.
     */
    public function test_mango_rights_rejects_invalid_uuid(): void
    {
        $response = $this->postJson('/api/mango/rights', [
            'content_params' => [
                'content_id' => 'not-a-valid-uuid',
            ],
        ]);
        $response->assertStatus(422);
        $response->assertJson([
            'error' => 'Invalid or missing Suno song content UUID.',
        ]);
    }

    /**
     * Test storage stats endpoint.
     */
    public function test_storage_stats_endpoint(): void
    {
        $response = $this->getJson('/api/storage/stats');
        $response->assertStatus(200);
        $response->assertJsonStructure([
            'downloads_bytes',
            'downloads_formatted',
            'quota_limit_bytes',
            'quota_limit_formatted',
            'quota_used_pct',
            'safe_threshold_ok',
        ]);
    }

    /**
     * Test Artisan omni:prune command execution.
     */
    public function test_omni_prune_artisan_command(): void
    {
        $this->artisan('omni:prune', ['--max-age' => 30])
            ->assertExitCode(0);
    }
}
