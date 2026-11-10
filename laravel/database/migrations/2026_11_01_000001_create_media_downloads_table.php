<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('media_downloads', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->text('url');
            $table->string('platform', 64)->default('Universal');
            $table->string('title', 255)->nullable();
            $table->string('format', 32)->default('mp3');
            $table->string('status', 32)->default('processing'); // queued, processing, completed, failed
            $table->integer('progress')->default(0);
            $table->string('file_path', 512)->nullable();
            $table->unsignedBigInteger('file_size')->default(0);
            $table->text('error')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('expires_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('media_downloads');
    }
};
