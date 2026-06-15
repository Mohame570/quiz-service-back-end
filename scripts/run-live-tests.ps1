$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==> Starting Postgres + MailHog + API (Docker Compose)"
docker compose up -d --build postgres mailhog api

Write-Host "==> Waiting for API health"
& "$PSScriptRoot/wait-for-api.ps1"

Write-Host "==> Applying migrations (host) and seeding database"
npm run prisma:migrate:deploy
npm run db:seed

Write-Host "==> Running live server tests"
$env:LIVE_TESTS = "1"
npm run test:live

Write-Host "Live smoke tests passed."
