@echo off
title NTK SoundLab Studio - Static PWA Launcher
color 0a
echo ======================================================================
echo    NTK SoundLab Studio - Offline PWA (Static Host Mode)
echo ======================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Serving static PWA from working\ on http://127.0.0.1:5000 ...
    cd /d "%~dp0working"
    start /min "" cmd /c "timeout /t 1 /nobreak >nul && start http://127.0.0.1:5000"
    python -m http.server 5000 --bind 127.0.0.1
    goto :end
)

where php >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Serving static PWA from working\ on http://127.0.0.1:5000 ...
    cd /d "%~dp0working"
    start /min "" cmd /c "timeout /t 1 /nobreak >nul && start http://127.0.0.1:5000"
    php -S 127.0.0.1:5000
    goto :end
)

echo [ERROR] Neither Python nor PHP was found in your PATH.
echo You can run dist\OmniStreamStudio-Portable.exe instead.
pause

:end
