@echo off
cd /d "%~dp0"

echo ================================================
echo   Building Accounting App .exe file
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
REM Using "python -m pip" / "python -m PyInstaller" (instead of bare "pip"/"pyinstaller")
REM guarantees both commands use the SAME Python install. On machines with more
REM than one Python version, plain "pip" and "pyinstaller" can silently resolve to
REM different installs, which built an exe missing Flask (ModuleNotFoundError).
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
python -m PyInstaller --onefile --windowed --name AccountingApp --icon=assets/icon.ico --add-data "web;web" --add-data "assets;assets" --add-data "fonts;fonts" --hidden-import=socks --noconfirm run_app.py

echo.
if exist "dist\AccountingApp.exe" (
    echo [3/3] Build completed successfully!
    echo.
    echo New file location: %cd%\dist\AccountingApp.exe
    echo.
    echo Copy this file over your old exe file.
    echo Your data is safe - it is stored next to the exe, not inside it.
) else (
    echo [ERROR] Build failed. Check the messages above.
)

echo.
pause
