@echo off
title Beer Depot store tag printer
echo Setting up the Beer Depot store tag printer...
set "D=%APPDATA%\BeerDepotStorePrinter"
if not exist "%D%" mkdir "%D%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://beerdepotpewaukee.com/store-printer/StorePrinter.ps1' -OutFile '%D%\StorePrinter.ps1' } catch { Write-Host 'Could not download the program. Check the internet connection.'; exit 1 }"
if errorlevel 1 (
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%D%\StorePrinter.ps1" -Setup
