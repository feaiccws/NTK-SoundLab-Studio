param(
    [string]$Distro = 'Ubuntu-26.04',
    [Parameter(Mandatory=$true)][string]$AppImageTool,
    [Parameter(Mandatory=$true)][string]$AppImageRuntime,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\..\SOFTWARE\LINUX')
)
$ErrorActionPreference = 'Stop'
$desktopRoot = Split-Path $PSScriptRoot -Parent
$workspaceRoot = Split-Path $desktopRoot -Parent
$stage = Join-Path $desktopRoot ('linux-build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
# Use the existing frontend allowlist, preserving old staging assets.
& (Join-Path $desktopRoot 'build.ps1') -StageOnly
Push-Location $desktopRoot
$priorGoOS=$env:GOOS; $priorGoArch=$env:GOARCH; $priorCGO=$env:CGO_ENABLED
try {
    $env:GOOS='linux'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'
    go test -c -o (Join-Path $stage 'desktop-linux.test') .
    if ($LASTEXITCODE -ne 0) { throw 'Linux tests did not compile' }
    go build -buildvcs=false -trimpath -ldflags '-s -w' -o (Join-Path $stage 'omnistream-studio') .
    if ($LASTEXITCODE -ne 0) { throw 'Linux build failed' }
} finally { $env:GOOS=$priorGoOS; $env:GOARCH=$priorGoArch; $env:CGO_ENABLED=$priorCGO; Pop-Location }
function Convert-LinuxPath([string]$Path) {
    $absolute=[IO.Path]::GetFullPath($Path)
    if ($absolute -notmatch '^([A-Za-z]):\\') { throw 'Use an absolute Windows drive path.' }
    return '/mnt/' + $Matches[1].ToLowerInvariant() + '/' + $absolute.Substring(3).Replace('\','/')
}
& wsl -d $Distro -- (Convert-LinuxPath (Join-Path $stage 'desktop-linux.test')) '-test.v'
if ($LASTEXITCODE -ne 0) { throw 'Linux native tests failed' }
& wsl -d $Distro -- bash (Convert-LinuxPath (Join-Path $PSScriptRoot 'package-linux.sh')) (Convert-LinuxPath (Join-Path $stage 'omnistream-studio')) (Convert-LinuxPath (Join-Path $workspaceRoot 'working\assets\icons\icon-192.png')) (Convert-LinuxPath $AppImageTool) (Convert-LinuxPath $AppImageRuntime) (Convert-LinuxPath $OutputDirectory)
if ($LASTEXITCODE -ne 0) { throw 'Linux packaging failed; previous packages retained' }
