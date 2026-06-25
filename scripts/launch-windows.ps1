# Launch TradingView Desktop (Windows) with the Chrome DevTools debug port enabled.
# The debug port only applies on a fresh launch, so we stop any running instance first.

$port = if ($env:GLASSTAPE_PORT) { $env:GLASSTAPE_PORT } else { "9222" }
$exe  = if ($env:TRADINGVIEW_EXE) { $env:TRADINGVIEW_EXE } else { "$env:LOCALAPPDATA\Programs\TradingView\TradingView.exe" }

if (-not (Test-Path $exe)) {
  Write-Error "TradingView.exe not found at $exe. Set TRADINGVIEW_EXE to its path."
  exit 1
}

Write-Host "-> Stopping any running TradingView (the debug flag only applies on a fresh launch)..."
Stop-Process -Name TradingView -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "-> Launching TradingView with --remote-debugging-port=$port ..."
Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$port"

Write-Host "OK. Verify the bridge with:  npx glasstape health"
