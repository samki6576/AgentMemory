#!/usr/bin/env powershell
# ============================================================================
# setup-mempalace.ps1 - Initialize MemPalace local memory system
# ============================================================================

Write-Host "🏛️  Initializing MemPalace (local agent memory)..." -ForegroundColor Cyan
Write-Host ""

# Check if mempalace is installed
if (-not (Get-Command mempalace -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  mempalace command not found" -ForegroundColor Yellow
    Write-Host "   Install with: pip install mempalace" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   If using Conda or virtual environment, activate it first:" -ForegroundColor Gray
    Write-Host "   conda activate mempalace  # or your env name" -ForegroundColor Gray
    exit 1
}

# Get mempalace version
$version = mempalace --version 2>&1 | Select-Object -First 1
Write-Host "✅ MemPalace version: $version" -ForegroundColor Green
Write-Host ""

# Check if already initialized
$mempalaceHome = if ($env:MEMPALACE_HOME) { $env:MEMPALACE_HOME } else { Join-Path $env:USERPROFILE ".mempalace\agent-memory" }

if (Test-Path $mempalaceHome) {
    Write-Host "ℹ️  MemPalace already initialized at: $mempalaceHome" -ForegroundColor Blue
} else {
    Write-Host "📦 Initializing MemPalace palace..." -ForegroundColor Cyan
    mempalace init $mempalaceHome
    Write-Host "✅ MemPalace initialized at: $mempalaceHome" -ForegroundColor Green
}

Write-Host ""
Write-Host "📊 MemPalace status:" -ForegroundColor Cyan
mempalace status 2>&1 | ForEach-Object { Write-Host "   $_" }

Write-Host ""
Write-Host "✅ MemPalace is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "🔗 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Set MEMPALACE_HOME environment variable (optional):" -ForegroundColor Gray
Write-Host "      `$env:MEMPALACE_HOME = '$mempalaceHome'" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Run integration tests:" -ForegroundColor Gray
Write-Host "      node scripts/test-integration.js" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Connect Claude Code MCP (see docs/MCP-SETUP.md)" -ForegroundColor Gray
