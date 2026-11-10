<?php

namespace App\Http\Responses;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

class LockedBinaryFileResponse extends BinaryFileResponse
{
    /** @param resource $lock */
    public function __construct(string $file, protected mixed $lock, array $headers = [])
    {
        parent::__construct($file, 200, $headers);
    }

    public function sendContent(): static
    {
        try {
            return parent::sendContent();
        } finally {
            $this->releaseLock();
        }
    }

    protected function releaseLock(): void
    {
        if (is_resource($this->lock)) {
            flock($this->lock, LOCK_UN);
            fclose($this->lock);
        }
        $this->lock = null;
    }

    public function __destruct()
    {
        $this->releaseLock();
    }
}
