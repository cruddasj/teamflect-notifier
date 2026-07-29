@echo off
setlocal

rem Always start from the app directory, even when this file is launched elsewhere.
cd /d "%~dp0app" || exit /b 1

set "APP_PORT=%PORT%"
if not defined APP_PORT set "APP_PORT=3000"
set "APP_URL=http://127.0.0.1:%APP_PORT%/"

rem Wait for the server before opening the default browser. Run this watcher in the
rem background so that Node remains attached to this window and Ctrl+C stops it.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command ^
  "$url = '%APP_URL%'; for ($attempt = 0; $attempt -lt 60; $attempt++) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if ($response.StatusCode -eq 200) { Start-Process $url; exit } } catch {}; Start-Sleep -Milliseconds 500 }" ^
  >nul 2>&1

echo Starting Teamflect notifier. Press Ctrl+C to stop it.
node server.js
exit /b %errorlevel%
