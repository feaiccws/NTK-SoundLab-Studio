<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Automatically schedule the prune job when standard Laravel scheduler runs
Schedule::command('omni:prune --max-age=30')->everyThirtyMinutes()->withoutOverlapping();
