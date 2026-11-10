@echo off
title NTK SoundLab Studio Launcher
color 0b
echo ======================================================================
echo    NTK SoundLab Studio - Universal Media Extractor ^& Stem Studio
echo ======================================================================
echo.

where php >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Starting Laravel PHP Backend on http://127.0.0.1:8000 ...
    cd /d "%~dp0laravel"
    start /min "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8000"
    php artisan serve --host=127.0.0.1 --port=8000
    goto :end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] PHP not detected in PATH. Starting Python static web server on http://127.0.0.1:8000 ...
    cd /d "%~dp0working"
    start /min "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8000"
    python -m http.server 8000 --bind 127.0.0.1
    goto :end
)

echo [ERROR] Neither PHP nor Python was found in your system PATH.
echo To run NTK SoundLab Studio locally, you can run the standalone desktop
echo executable in dist\OmniStreamStudio-Portable.exe (requires zero dependencies).
echo.
pause

:end
