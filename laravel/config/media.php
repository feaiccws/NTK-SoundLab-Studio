<?php

return [
    'admin_key' => env('ADMIN_KEY', ''),
    'yt_dlp_path' => env('YT_DLP_PATH'),
    'ffmpeg_path' => env('FFMPEG_PATH'),
    // Enable only behind operator-enforced egress rules rejecting private networks on every connection.
    'extractor_egress_sandboxed' => (bool) env('MEDIA_EXTRACTOR_EGRESS_SANDBOXED', false),
    'max_download_bytes' => 150 * 1024 * 1024,
    'download_budget_bytes' => 500 * 1024 * 1024,
];
