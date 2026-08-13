@echo off
cd /d "%~dp0"

echo ================================================
echo   Building Warehouse Serial Extractor .exe file
echo ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found in PATH. Install Python from python.org
    echo and make sure to check "Add Python to PATH" during setup, then run this again.
    pause
    exit /b 1
)

echo [1/4] Installing/updating requirements...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller
if errorlevel 1 (
    echo [ERROR] Installing requirements failed. Check the messages above and fix them first.
    pause
    exit /b 1
)

echo.
echo [2/4] Downloading Chromium (bundled next to the program, so the final
echo        folder works on other PCs with no separate install step)...
set PLAYWRIGHT_BROWSERS_PATH=0
python -m playwright install chromium
if errorlevel 1 (
    echo [ERROR] Downloading Chromium failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo [3/4] Building exe (this may take a few minutes; the output folder is
echo        large because Chromium is bundled inside it)...
python -m PyInstaller --name WarehouseSerialExtractor --collect-all playwright --noconfirm extract_serials.py

echo.
if exist "dist\WarehouseSerialExtractor\WarehouseSerialExtractor.exe" (
    echo [4/4] Build completed successfully!
    echo.
    echo New program folder: %cd%\dist\WarehouseSerialExtractor
    echo.
    echo Copy the WHOLE "WarehouseSerialExtractor" folder ^(not just the .exe^)
    echo to any Windows PC and double-click WarehouseSerialExtractor.exe there.
    echo No Python, pip, or "playwright install" needed on that PC.
) else (
    echo [ERROR] Build failed. Check the messages above.
)

echo.
pause
