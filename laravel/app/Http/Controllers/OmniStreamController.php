<?php

namespace App\Http\Controllers;

use App\Http\Responses\LockedBinaryFileResponse;
use App\Models\MediaDownload;
use App\Services\UniversalMediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

class OmniStreamController extends Controller
{
    protected UniversalMediaService $mediaService;

    public function __construct(UniversalMediaService $mediaService)
    {
        $this->mediaService = $mediaService;
    }

    /**
     * GET /api/capabilities or /api/health
     */
    public function capabilities(): JsonResponse
    {
        return response()->json(
            $this->mediaService->getCapabilities(),
            200,
            ['Access-Control-Allow-Origin' => '*']
        );
    }

    /**
     * GET /api/omni/resolve?url=<url>
     */
    public function resolve(Request $request): JsonResponse
    {
        $url = $request->query('url');
        if (! is_string($url) || trim($url) === '') {
            return response()->json(['error' => "Missing 'url' query parameter."], 400);
        }

        try {
            $metadata = $this->mediaService->resolveMetadata($url);

            return response()->json($metadata, 200, ['Access-Control-Allow-Origin' => '*']);
        } catch (\Throwable $e) {
            return $this->mediaError($e);
        }
    }

    /**
     * POST /api/omni/download
     * Payload: { url: string, format?: string, is_audio_only?: boolean }
     */
    public function download(Request $request): JsonResponse
    {
        $url = $request->input('url');
        if (! is_string($url) || trim($url) === '') {
            return response()->json(['error' => "Missing 'url' parameter."], 400);
        }

        $format = $request->input('format', 'mp3');
        if (! is_string($format)) {
            return response()->json(['error' => 'Invalid output format.'], 422);
        }
        $isAudioOnly = filter_var($request->input('is_audio_only', true), FILTER_VALIDATE_BOOLEAN);

        try {
            $job = $this->mediaService->startDownload($url, $format, $isAudioOnly);

            return response()->json([
                'success' => true,
                'job_id' => $job->id,
                'status' => $job->status,
                'progress' => $job->progress,
                'download_url' => $job->status === 'completed' ? url("/api/omni/stream/{$job->id}") : null,
            ], 200, ['Access-Control-Allow-Origin' => '*']);
        } catch (\Throwable $e) {
            return $this->mediaError($e);
        }
    }

    /**
     * GET /api/omni/passthrough?url=<url>&format=<format>&audio_only=<bool>
     * Zero-Disk Passthrough: Streams media chunks straight to client with 0 bytes written to disk.
     */
    public function passthrough(Request $request): StreamedResponse|JsonResponse
    {
        $url = $request->query('url');
        if (! is_string($url) || trim($url) === '') {
            return response()->json(['error' => "Missing 'url' query parameter."], 400);
        }

        $format = $request->query('format', 'mp3');
        $isAudioOnly = filter_var($request->query('audio_only', true), FILTER_VALIDATE_BOOLEAN);

        try {
            return $this->mediaService->streamPassthrough($url, $format, $isAudioOnly);
        } catch (\Throwable $e) {
            return $this->mediaError($e);
        }
    }

    /**
     * GET /api/omni/status/{id}
     */
    public function status(string $id): JsonResponse
    {
        $job = MediaDownload::find($id);
        if (! $job) {
            return response()->json(['error' => 'Job not found.'], 404);
        }

        return response()->json([
            'job_id' => $job->id,
            'status' => $job->status,
            'progress' => $job->progress,
            'download_url' => $job->status === 'completed' ? url("/api/omni/stream/{$job->id}") : null,
            'error' => $job->error,
        ], 200, ['Access-Control-Allow-Origin' => '*']);
    }

    /**
     * GET /api/omni/stream/{id}
     * Supports HTTP 206 Partial Content byte ranges for smooth audio/video seeking.
     */
    public function stream(string $id): BinaryFileResponse|JsonResponse
    {
        $lock = fopen(storage_path('app/downloads.lock'), 'c');
        if (! $lock || ! flock($lock, LOCK_SH | LOCK_NB)) {
            if ($lock) {
                fclose($lock);
            }

            return response()->json(['error' => 'Media storage is busy. Please retry.'], 503);
        }
        $job = MediaDownload::find($id);
        if (! $job || $job->status !== 'completed' || empty($job->file_path) || ! $this->mediaService->containedDownloadPath($job->file_path) || ($job->expires_at && $job->expires_at->isPast())) {
            flock($lock, LOCK_UN);
            fclose($lock);

            return response()->json(['error' => 'Stream file not found or expired.'], 404);
        }

        $filePath = $job->file_path;
        $mime = File::mimeType($filePath) ?: 'application/octet-stream';
        $filename = basename($filePath);

        $response = new LockedBinaryFileResponse($filePath, $lock, [
            'Content-Type' => $mime,
            'Accept-Ranges' => 'bytes',
            'Access-Control-Allow-Origin' => '*',
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
        ]);

        $response->setAutoEtag();

        return $response;
    }

    /**
     * POST /api/omni/cookies
     */
    public function saveCookies(Request $request): JsonResponse
    {
        if (! $this->adminAuthorized($request)) {
            return response()->json(['error' => 'Cookie management requires a configured server administrator key.'], 403);
        }

        $cookies = $request->input('cookies', '');
        if (! is_string($cookies) || strlen($cookies) > 65536) {
            return response()->json(['error' => 'Cookie file payload exceeds maximum allowed size (64 KB).'], 422);
        }

        try {
            $saved = $this->mediaService->saveCookies($cookies);
        } catch (\InvalidArgumentException $error) {
            return response()->json(['error' => $error->getMessage()], 422);
        }

        return response()->json([
            'success' => $saved,
            'message' => $saved ? 'Cookies saved into server storage.' : 'Could not save cookies.',
        ], $saved ? 200 : 500);
    }

    /**
     * GET /api/omni/cookies
     */
    public function getCookies(Request $request): JsonResponse
    {
        if (! $this->adminAuthorized($request)) {
            return response()->json(['error' => 'Cookie management requires a configured server administrator key.'], 403);
        }

        $cookieContent = $this->mediaService->getCookies();
        $hasCookies = ! empty(trim($cookieContent));

        return response()->json([
            'configured' => $hasCookies,
            'bytes' => strlen($cookieContent),
        ], 200);
    }

    /**
     * GET /api/omni/storage-stats
     */
    public function storageStats(): JsonResponse
    {
        $caps = $this->mediaService->getCapabilities();

        return response()->json($caps['storage'], 200, ['Access-Control-Allow-Origin' => '*']);
    }

    /**
     * GET /api/stems/capabilities
     */
    public function stemCapabilities(): JsonResponse
    {
        return response()->json([
            'available' => false,
            'engine' => 'In-Browser WebGPU/ONNX & Local Helper',
            'device' => 'client',
            'stems' => ['vocals', 'drums', 'bass', 'other', 'instrumental'],
            'supports_vocal_split' => false,
            'note' => 'This server does not run neural separation. The browser engine requires its runtime and model.',
        ], 200, ['Access-Control-Allow-Origin' => '*']);
    }

    protected function adminAuthorized(Request $request): bool
    {
        $key = config('media.admin_key');
        $provided = $request->header('X-Admin-Key');

        return is_string($key) && $key !== '' && is_string($provided) && hash_equals($key, $provided);
    }

    protected function mediaError(\Throwable $error): JsonResponse
    {
        if ($error instanceof \InvalidArgumentException) {
            return response()->json(['error' => $error->getMessage()], 422);
        }
        if ($error instanceof HttpExceptionInterface) {
            return response()->json(['error' => $error->getMessage()], $error->getStatusCode());
        }

        return response()->json(['error' => 'Media processing failed. Please retry or import a local file.'], 502);
    }
}
