@echo off
setlocal EnableDelayedExpansion

:: ============================================================
:: Native Messaging Host Installer for Windows
:: Supports: Chrome, Brave, Edge
::
:: Usage:
::   install_host.bat                   (prompted for extension ID)
::   install_host.bat <EXTENSION_ID>    (pass ID directly)
:: ============================================================

set "SCRIPT_DIR=%~dp0"
:: Remove trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "HOST_NAME=com.storagemanager.app"
set "LAUNCHER=%SCRIPT_DIR%\native_app.bat"
set "MANIFEST=%SCRIPT_DIR%\%HOST_NAME%.json"

:: ---- sanity checks ----------------------------------------

if not exist "%SCRIPT_DIR%\native_app.py" (
    echo ERROR: native_app.py not found in %SCRIPT_DIR%
    pause
    exit /b 1
)

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: python not found. Please install Python 3 and add it to PATH.
    pause
    exit /b 1
)

:: ---- get extension ID -------------------------------------

set "EXTENSION_ID=%~1"
if "%EXTENSION_ID%"=="" (
    echo Enter your Chrome extension ID (found at chrome://extensions):
    set /p EXTENSION_ID="Extension ID: "
)

if "%EXTENSION_ID%"=="" (
    echo ERROR: Extension ID is required.
    pause
    exit /b 1
)

:: ---- generate manifest ------------------------------------
:: Write the manifest with the absolute path to the launcher
:: and the user-supplied extension ID. No hardcoded values.

(
    echo {
    echo   "name": "%HOST_NAME%",
    echo   "description": "Storage Manager Native Host",
    echo   "path": "%LAUNCHER:\=\\%",
    echo   "type": "stdio",
    echo   "allowed_origins": [
    echo     "chrome-extension://%EXTENSION_ID%/"
    echo   ]
    echo }
) > "%MANIFEST%"

echo.
echo Generated manifest: %MANIFEST%
echo Extension ID:       %EXTENSION_ID%
echo Launcher:           %LAUNCHER%
echo.

:: ---- register in Windows registry for each browser --------

call :register_browser "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%"                   "Chrome"  "HKCU\Software\Google\Chrome"
call :register_browser "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HOST_NAME%"                  "Edge"    "HKCU\Software\Microsoft\Edge"
call :register_browser "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%HOST_NAME%"     "Brave"   "HKCU\Software\BraveSoftware\Brave-Browser"

echo.
echo Done! Restart your browser for changes to take effect.
echo.
echo NOTE: If you use multiple browsers, run this script once per
echo       browser using that browser's specific extension ID.
pause
exit /b 0

:: ---- helper: register one browser -------------------------
:register_browser
set "REG_KEY=%~1"
set "BROWSER=%~2"
set "DETECT_KEY=%~3"

REG QUERY "%DETECT_KEY%" >nul 2>&1
if errorlevel 1 (
    echo - Skipped %BROWSER% ^(not installed^)
    exit /b 0
)

REG ADD "%REG_KEY%" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
if errorlevel 1 (
    echo ERROR: Failed to register for %BROWSER%
) else (
    echo + Registered for %BROWSER%
)
exit /b 0
