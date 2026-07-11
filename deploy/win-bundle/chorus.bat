@echo off
chcp 65001 >nul
node "%~dp0chorus\chorus.mjs" %*
