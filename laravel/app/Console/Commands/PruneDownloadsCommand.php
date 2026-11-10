<?php

namespace App\Console\Commands;

use App\Services\UniversalMediaService;
use Illuminate\Console\Command;

class PruneDownloadsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'omni:prune {--max-age=30 : Maximum age in minutes for cached media}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Prunes expired application downloads while preserving active transfers';

    /**
     * Execute the console command.
     */
    public function handle(UniversalMediaService $service): int
    {
        $maxAge = (int) $this->option('max-age');
        if ($maxAge < 1 || $maxAge > 10080) {
            $this->error('max-age must be between 1 and 10080 minutes.');

            return Command::INVALID;
        }
        $this->info("Scanning storage/app/downloads for media files older than {$maxAge} minutes...");

        $pruned = $service->pruneExpiredDownloads($maxAge);
        $this->info("Successfully pruned {$pruned} expired media file(s) and database record(s).");

        $caps = $service->getCapabilities();
        $this->line("Storage used: {$caps['storage']['downloads_formatted']} / {$caps['storage']['quota_limit_formatted']} ({$caps['storage']['quota_used_pct']}%)");

        return Command::SUCCESS;
    }
}
