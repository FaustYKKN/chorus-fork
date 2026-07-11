@echo off
chcp 65001 >nul
title 关闭开机自启
powershell -NoProfile -ExecutionPolicy Bypass -Command "$raw = Get-Content -LiteralPath '%~f0' | Where-Object { $_ -like '::PS64:*' } | ForEach-Object { $_.Substring(7) }; $code = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($raw -join ''))); Invoke-Expression $code"
echo.
pause
exit /b 0
::PS64:JEVycm9yQWN0aW9uUHJlZmVyZW5jZSA9ICdTdG9wJwokc3RhcnR1cCA9IFtFbnZpcm9ubWVudF06OkdldEZvbGRlclBhdGgo
::PS64:J1N0YXJ0dXAnKQokdmJzID0gSm9pbi1QYXRoICRzdGFydHVwICdjaG9ydXMtZGFlbW9uLWF1dG9zdGFydC52YnMnCmlmIChU
::PS64:ZXN0LVBhdGggLUxpdGVyYWxQYXRoICR2YnMpIHsKICBSZW1vdmUtSXRlbSAtTGl0ZXJhbFBhdGggJHZicyAtRm9yY2UKICBX
::PS64:cml0ZS1Ib3N0ICc9PT0g5bey5YWz6Zet5byA5py66Ieq5ZCvID09PScKICBXcml0ZS1Ib3N0ICgn5bey5Yig6Zmk5ZCv5Yqo
::PS64:6aG5OiAnICsgJHZicykKICBXcml0ZS1Ib3N0ICfmraPlnKjov5DooYznmoTlrojmiqTov5vnqIvkuI3lj5flvbHlk43vvJvo
::PS64:poHlgZzmraLlroPor7flnKjmjqfliLblj7DpobXpnaLngrki5YGc5q2iIuOAgicKfSBlbHNlIHsKICBXcml0ZS1Ib3N0ICfm
::PS64:nKrlj5HnjrDlvIDmnLroh6rlkK/pobnvvIjmnKzmnaXlsLHmsqHlvIDlkK/vvInjgIInCn0K