<?php

use App\Http\Controllers\OmniStreamController;
use App\Http\Controllers\SunoProxyController;
use Illuminate\Support\Facades\Route;

// Main Studio Interface
Route::get('/', function () {
    return view('welcome');
});

// Direct support for PWA app shell and legacy bookmarks hitting /index.html
Route::get('/index.html', function () {
    return view('welcome');
});

// Global CORS Preflight handling for API routes
Route::options('/api/{any}', function () {
    return response('', 204, [
        'Access-Control-Allow-Origin' => '*',
        'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers' => 'Content-Type, Authorization, X-Requested-With, X-Admin-Key',
    ]);
})->where('any', '.*');

// Proxy API Routes (Directly callable by client-side browser) with rate limiting
Route::prefix('api')->middleware(['throttle:60,1'])->group(function () {
    // Health & Capabilities
    Route::get('/health', [OmniStreamController::class, 'capabilities']);
    Route::get('/capabilities', [OmniStreamController::class, 'capabilities']);

    // Universal Media Extractor (OmniStream)
    Route::get('/omni/resolve', [OmniStreamController::class, 'resolve']);
    Route::get('/omni/passthrough', [OmniStreamController::class, 'passthrough']);
    Route::post('/omni/download', [OmniStreamController::class, 'download'])->middleware('throttle:10,1');
    Route::get('/omni/status/{id}', [OmniStreamController::class, 'status']);
    Route::get('/omni/stream/{id}', [OmniStreamController::class, 'stream']);
    Route::get('/omni/cookies', [OmniStreamController::class, 'getCookies']);
    Route::post('/omni/cookies', [OmniStreamController::class, 'saveCookies']);
    Route::get('/omni/storage-stats', [OmniStreamController::class, 'storageStats']);
    Route::get('/storage/stats', [OmniStreamController::class, 'storageStats']);

    // Stems Engine Status
    Route::get('/stems/capabilities', [OmniStreamController::class, 'stemCapabilities']);

    // Suno AI Mango DRM, Audio Streaming & Metadata Proxy
    Route::post('/mango/rights', [SunoProxyController::class, 'mangoRights']);
    Route::get('/suno/unshorten', [SunoProxyController::class, 'unshorten']);
    Route::get('/suno/stream/{id}', [SunoProxyController::class, 'streamAudio']);
    Route::get('/suno/song/{id}', [SunoProxyController::class, 'clipMetadata']);
    Route::get('/suno/clip/{id}', [SunoProxyController::class, 'clipMetadata']);
    Route::get('/suno/playlist/{id}', [SunoProxyController::class, 'playlistMetadata']);
});
