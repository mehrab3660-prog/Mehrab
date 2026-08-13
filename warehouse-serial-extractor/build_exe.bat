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
echo NOTE: this program drives the Google Chrome already installed on the
echo target PC (it does not download/bundle its own browser), so Google
echo Chrome must be installed there.
echo.
echo [2/3] Building exe (this may take a minute or two)...
python -m PyInstaller --name WarehouseSerialExtractor --collect-all selenium --collect-all webdriver_manager --noconfirm extract_serials.py

echo.
if not exist "dist\WarehouseSerialExtractor\WarehouseSerialExtractor.exe" (
    echo [ERROR] Build failed. Check the messages above.
    echo.
    pause
    exit /b 1
)

echo Bundling Universal CRT DLLs locally (best-effort, for old Windows 7 targets)...
powershell -NoProfile -Command "$d=Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\Redist\*\ucrt\DLLs\x64' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1; if ($d) { Copy-Item \"$($d.FullName)\*.dll\" -Destination 'dist\WarehouseSerialExtractor' -Force; Write-Host \"Copied UCRT DLLs from $($d.FullName)\" } else { Write-Host 'UCRT redist DLLs not found locally (Windows SDK not installed) - skipping, this is optional.' }"

echo [3/3] Building single-file installer with Inno Setup...
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
