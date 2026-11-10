param(
    [string]$SourceRoot = (Join-Path $PSScriptRoot '..\working'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist'),
    [switch]$ConsoleBuild,
    [switch]$StageOnly,
    [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$desktopRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
$assetRoot = Join-Path $desktopRoot 'assets'
$stageRoot = Join-Path $desktopRoot ('assets-stage-' + [Guid]::NewGuid().ToString('N'))

# Copy only application assets. No audit files, helpers, repository data, cookies,
# environment files, scripts or previous staging leftovers enter the binary.
$files = @('index.html','404.html','manifest.json','sw.js','robots.txt','lib/mediabunny/LICENSE.txt','lib/mediabunny/NOTICE.txt')
foreach ($rule in @(
    @{Directory='js'; Extensions=@('.js')},
    @{Directory='css'; Extensions=@('.css')},
    @{Directory='lib'; Extensions=@('.js','.wasm')},
    @{Directory='assets'; Extensions=@('.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2')}
)) {
    $folder = Join-Path $source $rule.Directory
    if (Test-Path -LiteralPath $folder) {
        foreach ($file in Get-ChildItem -LiteralPath $folder -File -Recurse) {
            if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is not allowed: $($file.FullName)" }
            if ($rule.Extensions -contains $file.Extension.ToLowerInvariant()) {
                $relative = $file.FullName.Substring($source.Length).TrimStart('\','/')
                if ($relative -match '(^|[\\/])(\.[^\\/]*|node_modules|EVIDENCE|helper)([\\/]|$)') { throw "Unexpected asset path: $relative" }
                $files += $relative
            }
        }
    }
}
New-Item -ItemType Directory -Path $stageRoot | Out-Null
try {
    foreach ($relative in $files | Sort-Object -Unique) {
        $inputFile = Join-Path $source $relative
        if (-not (Test-Path -LiteralPath $inputFile -PathType Leaf)) { throw "Required asset missing: $relative" }
        $dest = Join-Path $stageRoot $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
        Copy-Item -LiteralPath $inputFile -Destination $dest
    }
    # Preserve the previous staging directory for rollback; never merge stale data.
    if (Test-Path -LiteralPath $assetRoot) {
        $resolvedAsset = (Resolve-Path -LiteralPath $assetRoot).Path
        if ($resolvedAsset -ne (Join-Path $desktopRoot 'assets')) { throw 'Asset target escaped the desktop directory' }
        if (((Get-Item -LiteralPath $assetRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Asset directory must not be a reparse point' }
        $backupRoot = Join-Path $desktopRoot 'build-backups'
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        Move-Item -LiteralPath $assetRoot -Destination (Join-Path $backupRoot ('assets-' + [Guid]::NewGuid().ToString('N')))
    }
    if (-not ([IO.Path]::GetFullPath($stageRoot).StartsWith($desktopRoot + [IO.Path]::DirectorySeparatorChar))) { throw 'Stage target escaped the desktop directory' }
    Move-Item -LiteralPath $stageRoot -Destination $assetRoot
    $manifest = foreach ($file in Get-ChildItem -LiteralPath $assetRoot -File -Recurse) {
        [ordered]@{path=$file.FullName.Substring($assetRoot.Length+1).Replace('\','/');bytes=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $desktopRoot 'assets-manifest.json') -Encoding utf8
    if ($StageOnly) { Write-Output "Staged $($manifest.Count) application assets."; return }
    $go = Get-Command go -ErrorAction SilentlyContinue
    if (-not $go) {
        $goCandidate = Join-Path $env:LOCALAPPDATA 'Programs\go\bin\go.exe'
        if (-not (Test-Path -LiteralPath $goCandidate)) { throw 'Go is required; no compiler was installed automatically.' }
        $goPath = $goCandidate
    } else { $goPath = $go.Source }
    Push-Location $desktopRoot
    try {
        if (-not $SkipTests) { & $goPath test ./...; if ($LASTEXITCODE -ne 0) { throw 'Desktop regression tests failed.' } }
        New-Item -ItemType Directory -Force -Path $output | Out-Null
        $binary = Join-Path $output 'OmniStreamStudio-Portable.exe'
        if (Test-Path -LiteralPath $binary) {
            $backupRoot = Join-Path $desktopRoot 'build-backups'
            New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
            Copy-Item -LiteralPath $binary -Destination (Join-Path $backupRoot ('portable-' + [Guid]::NewGuid().ToString('N') + '.exe'))
        }
        $flags = '-s -w'; if (-not $ConsoleBuild) { $flags = '-H windowsgui -s -w' }
        & $goPath build -trimpath -ldflags $flags -o $binary .
        if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
        $artifact = Get-Item -LiteralPath $binary
        [ordered]@{file=$artifact.Name;bytes=$artifact.Length;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();builtUtc=$artifact.LastWriteTimeUtc.ToString('o');assetCount=$manifest.Count} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'portable-manifest.json') -Encoding utf8
        Write-Output "Built $binary with $($manifest.Count) allowlisted assets."
    } finally { Pop-Location }
} finally {
    # Failed staging is deliberately retained for diagnosis; no broad deletion.
}
