param([switch]$DebugBuild)
$ErrorActionPreference = 'Stop'
$arguments = @((Join-Path $PSScriptRoot 'build.py'))
if ($DebugBuild) { $arguments += '--debug' }
python @arguments
if ($LASTEXITCODE -ne 0) { throw 'Android build failed. Previous artifacts were preserved.' }
