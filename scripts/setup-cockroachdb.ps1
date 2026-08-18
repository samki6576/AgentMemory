#!/usr/bin/env powershell
# ============================================================================
# setup-cockroachdb.ps1 - Windows PowerShell Version
# Initialize CockroachDB schema for agent memory system
# ============================================================================

param(
    [string]$DbUrl = $env:COCKROACH_DB_URL
)

if (-not $DbUrl) {
    Write-Host "ERROR: COCKROACH_DB_URL environment variable not set" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: psql not found. Install PostgreSQL client." -ForegroundColor Red
    exit 1
}

Write-Host "Initializing CockroachDB schema for agent memory..." -ForegroundColor Cyan

$schemaPath = Join-Path -Path $PSScriptRoot -ChildPath "..\infrastructure\schema.sql"
if (-not (Test-Path $schemaPath)) {
    Write-Host "ERROR: Schema file not found at $schemaPath" -ForegroundColor Red
    exit 1
}

$content = Get-Content $schemaPath -Raw
$content | psql "$DbUrl" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: CockroachDB schema initialized!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Schema initialization failed with code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
