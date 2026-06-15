param(
  [string]$ApiBaseUrl = $(if ($env:LIVE_API_BASE_URL) { $env:LIVE_API_BASE_URL } else { "http://localhost:3002/api" }),
  [int]$TimeoutSeconds = $(if ($env:LIVE_WAIT_TIMEOUT_SECONDS) { [int]$env:LIVE_WAIT_TIMEOUT_SECONDS } else { 60 })
)

Write-Host "Waiting for $ApiBaseUrl/health (timeout ${TimeoutSeconds}s)..."

for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "$ApiBaseUrl/health" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      Write-Host "API is healthy."
      exit 0
    }
  } catch {
    # API not ready yet.
  }

  Start-Sleep -Seconds 1
}

Write-Error "Timed out waiting for API."
exit 1
