@echo off
cd /d "%~dp0"

echo ================================================
echo   Building Accounting App .exe file
echo ================================================
echo.

echo [1/3] Installing/updating requirements...
pip install -r requirements.txt --quiet
pip install pyinstaller --quiet

echo.
echo [2/3] Building exe (this may take a few minutes)...
pyinstaller --onefile --name AccountingApp --icon=assets/icon.ico --add-data "web;web" --add-data "assets;assets" --add-data "fonts;fonts" --noconfirm run_app.py

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
