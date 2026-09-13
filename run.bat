@echo off
title HealthPal App
echo Starting HealthPal PWA Server...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
