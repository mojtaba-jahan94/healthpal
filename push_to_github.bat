@echo off
title Push to GitHub
echo ============================================================
echo   Pushing HealthPal to GitHub (mojtaba-jahan94)
echo ============================================================
echo.
echo Make sure you have created the repository on GitHub:
echo https://github.com/new (Repository name: healthpal)
echo.
git branch -M main
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ============================================================
    echo [SUCCESS] Successfully pushed to https://github.com/mojtaba-jahan94/healthpal
    echo ============================================================
) else (
    echo [INFO] If prompted, please complete the sign-in in your browser.
)
pause
