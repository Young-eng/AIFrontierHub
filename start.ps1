# Runs AITrending in the current PowerShell window. Ctrl+C or closing the window stops it.
# Nothing is registered with Windows; it never starts on its own.
#
#   .\start.ps1                 start (asks for the DeepSeek key if none is configured)
#   .\start.ps1 -SetKey         enter a new key even if one is configured
#   .\start.ps1 -Build          rebuild before starting (after code changes)
#   .\start.ps1 -Port 3001      use another port
param(
  [switch]$SetKey,
  [switch]$Build,
  [int]$Port = 3000
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$envFile = Join-Path $PSScriptRoot ".env.local"

function Get-SavedKey {
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*(DEEPSEEK_API_KEY|TRANSLATE_API_KEY)\s*=\s*(\S+)') { return $Matches[2] }
  }
  return $null
}

function Save-Key([string]$key) {
  $lines = @()
  if (Test-Path $envFile) {
    $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*DEEPSEEK_API_KEY\s*=' })
  }
  $lines += "DEEPSEEK_API_KEY=$key"
  [System.IO.File]::WriteAllLines($envFile, [string[]]$lines, [System.Text.UTF8Encoding]::new($false))
}

$hasKey = $env:DEEPSEEK_API_KEY -or $env:TRANSLATE_API_KEY -or (Get-SavedKey)
if ($SetKey -or -not $hasKey) {
  Write-Host "DeepSeek API key (input hidden; press Enter to skip, English stays untranslated):"
  $secure = Read-Host -AsSecureString
  $key = [System.Net.NetworkCredential]::new("", $secure).Password.Trim()
  if ($key) {
    $env:DEEPSEEK_API_KEY = $key
    $answer = Read-Host "Save it to .env.local so you are not asked next time? (y/N)"
    if ($answer -match '^[yY]') {
      Save-Key $key
      Write-Host "Saved to .env.local (git-ignored)."
    } else {
      Write-Host "Key is used for this run only."
    }
  }
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}
if ($Build -or -not (Test-Path ".next\BUILD_ID")) {
  Write-Host "Building production bundle..."
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
}

Write-Host ""
Write-Host "AITrending: http://localhost:$Port   (Ctrl+C to stop)"
Write-Host "Sources are fetched only when you click the sync button on the page."
Write-Host ""
& npm.cmd start -- -p $Port
