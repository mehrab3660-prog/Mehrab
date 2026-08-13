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
if not exist "dist\WarehouseSerialExtractor\WarehouseSerialExtractor.exe" (
    echo [ERROR] Build failed. Check the messages above.
    echo.
    pause
    exit /b 1
)

echo [4/4] Building single-file installer with Inno Setup...
set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist %ISCC% set ISCC="C:\Program Files\Inno Setup 6\ISCC.exe"
if exist %ISCC% (
    %ISCC% installer.iss
    echo.
    echo Build completed successfully!
    echo.
    echo Installer: %cd%\installer_output\WarehouseSerialExtractorSetup.exe
    echo Send just this ONE file to any Windows PC and double-click it to install.
) else (
    echo [WARNING] Inno Setup not found, so only the plain folder was built ^(no installer^).
    echo Install Inno Setup 6 from https://jrsoftware.org/isdl.php and run this again to
    echo get a single Setup.exe, or just copy the whole folder below to another PC:
    echo.
    echo Program folder: %cd%\dist\WarehouseSerialExtractor
)

echo.
pause
