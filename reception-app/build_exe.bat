@echo off
cd /d "%~dp0"

echo ================================================
echo   Building Reception App .exe file
echo ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found in PATH. Install Python from python.org
    echo and make sure to check "Add Python to PATH" during setup, then run this again.
    pause
    exit /b 1
)

echo [1/3] Installing/updating requirements...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller
if errorlevel 1 (
    echo [ERROR] Installing requirements failed. Check the messages above and fix them first.
    pause
    exit /b 1
)

echo.
echo [2/3] Building exe (this may take a few minutes)...
python -m PyInstaller --onefile --windowed --name ReceptionApp --add-data "web;web" --noconfirm app.py

echo.
if exist "dist\ReceptionApp.exe" (
    echo [3/3] Build completed successfully!
    echo.
    echo New file location: %cd%\dist\ReceptionApp.exe
    echo.
    echo Copy this file anywhere you want ^(Desktop, etc^). Your data
    echo ^(reception.db^) will be created next to it, not inside it.
) else (
    echo [ERROR] Build failed. Check the messages above.
)

echo.
pause
