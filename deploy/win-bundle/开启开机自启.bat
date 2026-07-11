@echo off
chcp 65001 >nul
title 开启开机自启
set "BUNDLE_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$raw = Get-Content -LiteralPath '%~f0' | Where-Object { $_ -like '::PS64:*' } | ForEach-Object { $_.Substring(7) }; $code = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($raw -join ''))); Invoke-Expression $code"
echo.
pause
exit /b 0
::PS64:JEVycm9yQWN0aW9uUHJlZmVyZW5jZSA9ICdTdG9wJwokYnVuZGxlID0gJGVudjpCVU5ETEVfRElSCmlmICgtbm90ICRidW5k
::PS64:bGUpIHsgV3JpdGUtSG9zdCAnW+mUmeivr10g57y65bCRIEJVTkRMRV9ESVInOyBleGl0IDEgfQokY2hvcnVzTWpzID0gSm9p
::PS64:bi1QYXRoICRidW5kbGUgJ2Nob3J1c1xjaG9ydXMubWpzJwppZiAoLW5vdCAoVGVzdC1QYXRoIC1MaXRlcmFsUGF0aCAkY2hv
::PS64:cnVzTWpzKSkgewogIFdyaXRlLUhvc3QgKCdb6ZSZ6K+vXSDmnKrmib7liLAgJyArICRjaG9ydXNNanMgKyAn77yM6K+35oqK
::PS64:5pys6ISa5pys5pS+5Zue6Kej5Y6L55uu5b2V5ZCO5YaN6L+Q6KGMJykKICBleGl0IDEKfQokc3RhcnR1cCA9IFtFbnZpcm9u
::PS64:bWVudF06OkdldEZvbGRlclBhdGgoJ1N0YXJ0dXAnKQokdmJzID0gSm9pbi1QYXRoICRzdGFydHVwICdjaG9ydXMtZGFlbW9u
::PS64:LWF1dG9zdGFydC52YnMnCiMgVkJTIOmHjCAiIiDooajnpLrlrZfpnaLlj4zlvJXlj7fvvJvpmpDol4/nqpflj6MoMCnlkK/l
::PS64:iqjvvIzkuI3miZPlvIDmtY/op4jlmagKJGNtZCA9ICdjbWQgL2Mgbm9kZSAiIicgKyAkY2hvcnVzTWpzICsgJyIiIGRhZW1v
::PS64:biAtZCAtLWFnZW50IG9wZW5jb2RlIC0teW9sbycKJGNvbnRlbnQgPSAnQ3JlYXRlT2JqZWN0KCJXU2NyaXB0LlNoZWxsIiku
::PS64:UnVuICInICsgJGNtZCArICciLCAwLCBGYWxzZScKU2V0LUNvbnRlbnQgLUxpdGVyYWxQYXRoICR2YnMgLVZhbHVlICRjb250
::PS64:ZW50IC1FbmNvZGluZyBVbmljb2RlCldyaXRlLUhvc3QgJz09PSDlt7LlvIDlkK/lvIDmnLroh6rlkK8gPT09JwpXcml0ZS1I
::PS64:b3N0ICgn5ZCv5Yqo6aG55paH5Lu2OiAnICsgJHZicykKV3JpdGUtSG9zdCAn5q+P5qyh55m75b2VIFdpbmRvd3Mg5ZCO77yM
::PS64:5a6I5oqk6L+b56iL5Lya6Ieq5Yqo5Zyo5ZCO5Y+w5ZCv5Yqo77yI5peg56qX5Y+j77yJ44CCJwpXcml0ZS1Ib3N0ICfpnIDo
::PS64:poHnnIvnirbmgIHml7bvvIzmtY/op4jlmajmiZPlvIAgaHR0cDovLzEyNy4wLjAuMTo4NjM4IOWNs+WPr+OAgicKV3JpdGUt
::PS64:SG9zdCAn5Y+W5raI6Ieq5ZCv77ya5Y+M5Ye7IOWFs+mXreW8gOacuuiHquWQry5iYXQnCg==