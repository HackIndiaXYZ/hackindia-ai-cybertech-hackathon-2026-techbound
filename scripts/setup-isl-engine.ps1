# PowerShell script to set up the Python ISL ML Engine environment
Write-Host "=== Setting up Python ISL Engine ===" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineDir = Join-Path (Split-Path -Parent $scriptDir) "apps\isl-engine"
$venvDir = Join-Path $engineDir ".venv"

Set-Location $engineDir

if (-not (Test-Path $venvDir)) {
    Write-Host "Creating virtual environment at $venvDir..." -ForegroundColor Yellow
    python -m venv .venv
}

$pythonExe = Join-Path $venvDir "Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "Error: Python executable not found at $pythonExe" -ForegroundColor Red
    exit 1
}

Write-Host "Upgrading pip and installing requirements..." -ForegroundColor Yellow
& $pythonExe -m pip install --upgrade pip setuptools wheel
& $pythonExe -m pip install -r requirements.txt

Write-Host "=== ISL Engine setup completed successfully! ===" -ForegroundColor Green
Write-Host "To run the ISL Engine manually:" -ForegroundColor Cyan
Write-Host "  & '$pythonExe' app.py" -ForegroundColor White
