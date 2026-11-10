<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\File;

abstract class TestCase extends BaseTestCase
{
    protected ?string $isolatedStorage = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->isolatedStorage = sys_get_temp_dir().DIRECTORY_SEPARATOR.'omnistream-tests-'.bin2hex(random_bytes(8));
        foreach (['app/downloads', 'framework/views', 'framework/cache/data', 'framework/sessions', 'logs'] as $directory) {
            File::ensureDirectoryExists($this->isolatedStorage.DIRECTORY_SEPARATOR.$directory);
        }
        $this->app->useStoragePath($this->isolatedStorage);
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32)), 'cache.default' => 'array', 'session.driver' => 'array',
            'view.compiled' => $this->isolatedStorage.'/framework/views', 'logging.channels.single.path' => $this->isolatedStorage.'/logs/testing.log']);
    }

    protected function tearDown(): void
    {
        $path = $this->isolatedStorage;
        parent::tearDown();
        if ($path !== null && str_starts_with($path, sys_get_temp_dir().DIRECTORY_SEPARATOR.'omnistream-tests-') && ! is_link($path)) {
            File::deleteDirectory($path);
        }
    }
}
