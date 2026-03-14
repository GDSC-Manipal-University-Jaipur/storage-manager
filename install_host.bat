@echo off
set "MANIFEST_PATH=%~dp0com.storagemanager.app.json"
echo Installing Native Messaging Host for Chrome
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.storagemanager.app" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f
echo.
echo Installing Native Messaging Host for Edge
REG ADD "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.storagemanager.app" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f
echo.
echo Installation complete!
echo WARNING: Make sure to update com.storagemanager.app.json with your actual Extension ID!
pause
