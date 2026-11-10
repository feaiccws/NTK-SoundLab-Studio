<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MediaDownload extends Model
{
    protected $table = 'media_downloads';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'url',
        'platform',
        'title',
        'format',
        'status',
        'progress',
        'file_path',
        'file_size',
        'error',
        'metadata',
        'expires_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'expires_at' => 'datetime',
        'progress' => 'integer',
        'file_size' => 'integer',
    ];
}
