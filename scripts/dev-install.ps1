# Install AI Engineer Coach into Cursor and open Classic mode (required for local VSIX extensions).
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$CursorCli = Join-Path $env:LOCALAPPDATA 'Programs\cursor\resources\app\bin\cursor.cmd'
if (-not (Test-Path $CursorCli)) {
  throw "Cursor CLI not found at $CursorCli"
}

Write-Host 'Building and packaging extension...'
npm run package

$Vsix = Get-ChildItem -Path $RepoRoot -Filter 'ai-engineer-coach-*.vsix' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $Vsix) {
  throw 'No .vsix produced by npm run package'
}

Write-Host "Installing $($Vsix.Name)..."
& $CursorCli --install-extension $Vsix.FullName --force

Write-Host 'Opening Cursor in Classic mode (Glass mode hides many local extensions)...'
& $CursorCli --classic $RepoRoot

Write-Host ''
Write-Host 'In Classic Cursor window:'
Write-Host '  1. Ctrl+Shift+P'
Write-Host '  2. Type: AI Engineer Coach'
Write-Host '  3. Run: AI Engineer Coach: Open Dashboard'
Write-Host 'Or click the graph icon in the left Activity Bar.'
