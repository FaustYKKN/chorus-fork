@echo off
chcp 65001 >nul
title Chorus x opencode 一键安装
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node，请先安装 Node 20+ 或将其加入 PATH
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo 检测到 Node %%v ，需要 v20 以上
echo.
set /p CHORUS_URL_IN=平台地址，直接回车用默认 http://10.0.4.14:8637 : 
if "%CHORUS_URL_IN%"=="" set "CHORUS_URL_IN=http://10.0.4.14:8637"
if "%CHORUS_URL_IN:~-1%"=="/" set "CHORUS_URL_IN=%CHORUS_URL_IN:~0,-1%"
set "CHORUS_URL=%CHORUS_URL_IN%"
echo 使用平台地址: %CHORUS_URL%
echo.
echo === 1/4 配置 opencode（模型 + Chorus 接入 + AGENTS.md 工作规范）===
powershell -NoProfile -ExecutionPolicy Bypass -Command "$raw = Get-Content -LiteralPath '%~f0' | Where-Object { $_ -like '::PS64:*' } | ForEach-Object { $_.Substring(7) }; $code = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($raw -join ''))); Invoke-Expression $code"
echo.
echo === 2/4 登录平台 ===
set /p CHORUS_KEY=请输入平台 API Key，cho_ 开头: 
node "%~dp0chorus\chorus.mjs" login --url "%CHORUS_URL%" --api-key "%CHORUS_KEY%"
if errorlevel 1 (
  echo [错误] 登录失败：检查 key 是否完整、能否访问 %CHORUS_URL%
  pause
  exit /b 1
)
echo.
echo === 3/4 设置默认工作目录与串行执行 ===
if exist "D:\" (set "WORKDIR=D:\opencode-auto-work") else (set "WORKDIR=%USERPROFILE%\opencode-auto-work")
node "%~dp0tools\configure-daemon.cjs" "%WORKDIR%"
echo （之后可在本地控制台 http://127.0.0.1:8638 随时修改目录白名单）
echo.
echo === 4/4 写入用户环境变量 ===
setx CHORUS_API_KEY "%CHORUS_KEY%" >nul
setx CHORUS_BASE_URL "%CHORUS_URL%" >nul
setx CHORUS_URL "%CHORUS_URL%" >nul
echo 完成
echo.
echo 安装完成！下一步：双击 启动守护进程.bat
pause
exit /b 0
::PS64:JEVycm9yQWN0aW9uUHJlZmVyZW5jZSA9ICdTdG9wJwpXcml0ZS1Ib3N0ICc9PT0gQ2hvcnVzIHggb3BlbmNvZGUg5LiA6ZSu
::PS64:6YWN572uID09PScKV3JpdGUtSG9zdCAnJwoKIyDlubPlj7DlnLDlnYDvvJrnlLHlpJblsYIgYmF0IOmAmui/hyBDSE9SVVNf
::PS64:VVJMIOeOr+Wig+WPmOmHj+S8oOWFpe+8m+acquS8oOaXtueUqOm7mOiupOWAvOOAggokcGxhdGZvcm0gPSBpZiAoJGVudjpD
::PS64:SE9SVVNfVVJMKSB7ICRlbnY6Q0hPUlVTX1VSTC5UcmltKCkuVHJpbUVuZCgnLycpIH0gZWxzZSB7ICdodHRwOi8vMTAuMC40
::PS64:LjE0Ojg2MzcnIH0KV3JpdGUtSG9zdCAoJ+W5s+WPsOWcsOWdgDogJyArICRwbGF0Zm9ybSkKCiRkaXIgPSBKb2luLVBhdGgg
::PS64:JGVudjpVU0VSUFJPRklMRSAnLmNvbmZpZ1xvcGVuY29kZScKTmV3LUl0ZW0gLUl0ZW1UeXBlIERpcmVjdG9yeSAtRm9yY2Ug
::PS64:LVBhdGggJGRpciB8IE91dC1OdWxsCiR1dGY4Tm9Cb20gPSBOZXctT2JqZWN0IFN5c3RlbS5UZXh0LlVURjhFbmNvZGluZygk
::PS64:ZmFsc2UpCgojIC0tLS0tLS0tLS0gMS8yIG9wZW5jb2RlLmpzb24gLS0tLS0tLS0tLQokY2ZnUGF0aCA9IEpvaW4tUGF0aCAk
::PS64:ZGlyICdvcGVuY29kZS5qc29uJwoKJGNob3J1c01jcCA9IFtwc2N1c3RvbW9iamVjdF1AewogIHR5cGUgICAgPSAncmVtb3Rl
::PS64:JwogIHVybCAgICAgPSAkcGxhdGZvcm0gKyAnL2FwaS9tY3AnCiAgZW5hYmxlZCA9ICR0cnVlCiAgaGVhZGVycyA9IFtwc2N1
::PS64:c3RvbW9iamVjdF1AeyBBdXRob3JpemF0aW9uID0gJ0JlYXJlciB7ZW52OkNIT1JVU19BUElfS0VZfScgfQp9CgppZiAoVGVz
::PS64:dC1QYXRoIC1MaXRlcmFsUGF0aCAkY2ZnUGF0aCkgewogIENvcHktSXRlbSAtTGl0ZXJhbFBhdGggJGNmZ1BhdGggLURlc3Rp
::PS64:bmF0aW9uICgkY2ZnUGF0aCArICcuYmFrJykgLUZvcmNlCiAgJGNmZyA9IEdldC1Db250ZW50IC1SYXcgLUxpdGVyYWxQYXRo
::PS64:ICRjZmdQYXRoIHwgQ29udmVydEZyb20tSnNvbgogIFdyaXRlLUhvc3QgJ1sxLzJdIOajgOa1i+WIsOW3suaciSBvcGVuY29k
::PS64:ZS5qc29u77ya5bey5aSH5Lu95Li6IG9wZW5jb2RlLmpzb24uYmFr77yM5qih5Z6L6YWN572u5L+d5oyB5LiN5YqoJwp9IGVs
::PS64:c2UgewogICRjZmcgPSBbcHNjdXN0b21vYmplY3RdQHsKICAgICckc2NoZW1hJyA9ICdodHRwczovL29wZW5jb2RlLmFpL2Nv
::PS64:bmZpZy5qc29uJwogICAgcHJvdmlkZXIgID0gW3BzY3VzdG9tb2JqZWN0XUB7CiAgICAgIGRlZXBzZWVrID0gW3BzY3VzdG9t
::PS64:b2JqZWN0XUB7CiAgICAgICAgb3B0aW9ucyA9IFtwc2N1c3RvbW9iamVjdF1AewogICAgICAgICAgYXBpS2V5ICA9ICdzay1S
::PS64:RVBMQUNFLVdJVEgtUkVBTC1LRVknICAjIOS7k+W6k+eJiOS4uuWNoOS9jeespu+8muWGhee9keWIhuWPkeWJjeabv+aNouec
::PS64:n+WuniBrZXkg5bm26YeN6LeRIHJlZ2VuLXBheWxvYWQuc2jvvIzli7/miornnJ/lrp4ga2V5IOaPkOS6pAogICAgICAgICAg
::PS64:YmFzZVVSTCA9ICdodHRwczovL2FwaS5kZWVwc2Vlay5jb20vdjEnCiAgICAgICAgfQogICAgICAgIG1vZGVscyAgPSBbcHNj
::PS64:dXN0b21vYmplY3RdQHsKICAgICAgICAgICdkZWVwc2Vlay12NC1wcm8nID0gW3BzY3VzdG9tb2JqZWN0XUB7IG5hbWUgPSAn
::PS64:T2ZmaWNpYWwgRGVlcFNlZWsgVjQgUHJvJyB9CiAgICAgICAgfQogICAgICB9CiAgICB9CiAgICBtb2RlbCAgICAgPSAnZGVl
::PS64:cHNlZWsvZGVlcHNlZWstdjQtcHJvJwogIH0KICBXcml0ZS1Ib3N0ICdbMS8yXSDmnKrlj5HnjrAgb3BlbmNvZGUuanNvbu+8
::PS64:muW3suaWsOW7uuaooeadv++8iOaooeWeiyBhcGlLZXkg5Li65Y2g5L2N56ym77yM6K+35aGr55yf5a6e5YC877yJJwp9Cgpp
::PS64:ZiAoLW5vdCAoJGNmZy5QU09iamVjdC5Qcm9wZXJ0aWVzLk5hbWUgLWNvbnRhaW5zICdtY3AnKSAtb3IgKCRudWxsIC1lcSAk
::PS64:Y2ZnLm1jcCkpIHsKICAkY2ZnIHwgQWRkLU1lbWJlciAtTm90ZVByb3BlcnR5TmFtZSAnbWNwJyAtTm90ZVByb3BlcnR5VmFs
::PS64:dWUgKFtwc2N1c3RvbW9iamVjdF1Ae30pIC1Gb3JjZQp9CiRjZmcubWNwIHwgQWRkLU1lbWJlciAtTm90ZVByb3BlcnR5TmFt
::PS64:ZSAnY2hvcnVzJyAtTm90ZVByb3BlcnR5VmFsdWUgJGNob3J1c01jcCAtRm9yY2UKCiRqc29uID0gJGNmZyB8IENvbnZlcnRU
::PS64:by1Kc29uIC1EZXB0aCAxNgpbU3lzdGVtLklPLkZpbGVdOjpXcml0ZUFsbFRleHQoJGNmZ1BhdGgsICRqc29uLCAkdXRmOE5v
::PS64:Qm9tKQpXcml0ZS1Ib3N0ICgnICAgICAgQ2hvcnVzIE1DUCDlt7LlhpnlhaXvvIjljp/nlJ8gcmVtb3RlIOaWueW8j++8jOaX
::PS64:oOmcgOiBlOe9keijheaPkuS7tu+8iTogJyArICRjZmdQYXRoKQoKIyAtLS0tLS0tLS0tIDIvMiBBR0VOVFMubWQgLS0tLS0t
::PS64:LS0tLQokbGFuZ1NlY3Rpb24gPSBAJwojIOWFqOWxgOW3peS9nOinhOiMgwoKIyMg6K+t6KiACgotIOaJgOaciei+k+WHuuS4
::PS64:gOW+i+S9v+eUqOeugOS9k+S4reaWh++8muWvueivneWbnuWkjeOAgeS7u+WKoeivhOiuuuOAgeWuoeafpeaKpeWRiuOAgeaP
::PS64:kOS6pOS/oeaBr+OAgeaWh+aho+OAggotIOS+i+Wklu+8muS7o+eggeacrOi6q+OAgeS7o+eggeWGheagh+ivhuespuOAgeaX
::PS64:peW/ly/plJnor6/lhbPplK7lrZfjgIHku6Xlj4rlvJXnlKjnmoToi7Hmlofljp/mlofkv53mjIHljp/moLfjgIIKLSDljbPk
::PS64:vb/mlLbliLDnmoTmjIfku6TmiJbmioDog73mlofmoaPmmK/oi7HmlofvvIzlm57lpI3ku43nlKjkuK3mlofjgIIKJ0AKCiRj
::PS64:aG9ydXNTZWN0aW9uID0gQCcKIyMgQ2hvcnVzIOS7u+WKoea1geeoiwoK6KKr5oyH5rS+IENob3J1cyDku7vliqHvvIh0YXNr
::PS64:X2Fzc2lnbmVkIOWUpOmGku+8ieWQju+8jOaMieS7peS4i+mhuuW6j+aOqOi/m+eKtuaAge+8jOWQpuWImeaPkOS6pOmqjOiv
::PS64:geS8muiiq+aLkue7ne+8mgoKMS4g5Yqo5omL5YmN5YWI6LCD55SoIGBjaG9ydXNfcmVwb3J0X3dvcmtg77yM5Y+C5pWw5bim
::PS64:IGBzdGF0dXM6ICJpbl9wcm9ncmVzcyJg77yMcmVwb3J0IOWGmeS4gOWPpeW8gOW3peivtOaYjuKAlOKAlOi/meS4gOatpeaK
::PS64:iuS7u+WKoeS7jiBhc3NpZ25lZCDmjqjov5vliLAgaW5fcHJvZ3Jlc3PjgIIKMi4g5a6M5oiQ5bel5L2c5ZCO77yM5aaC5Lu7
::PS64:5Yqh5bim6aqM5pS25qCH5YeG77yM5YWI6LCD55SoIGBjaG9ydXNfcmVwb3J0X2NyaXRlcmlhX3NlbGZfY2hlY2tgIOmAkOad
::PS64:oeiHquajgOOAggozLiDmnIDlkI7osIPnlKggYGNob3J1c19zdWJtaXRfZm9yX3ZlcmlmeWAg5o+Q5Lqk5Lq65bel6aqM6K+B
::PS64:77yI5Y+q5pyJIGluX3Byb2dyZXNzIOeKtuaAgeeahOS7u+WKoeaJjeiDveaPkOS6pO+8ieOAggonQAoKJGFnZW50c1BhdGgg
::PS64:PSBKb2luLVBhdGggJGRpciAnQUdFTlRTLm1kJwppZiAoLW5vdCAoVGVzdC1QYXRoIC1MaXRlcmFsUGF0aCAkYWdlbnRzUGF0
::PS64:aCkpIHsKICBbU3lzdGVtLklPLkZpbGVdOjpXcml0ZUFsbFRleHQoJGFnZW50c1BhdGgsICgkbGFuZ1NlY3Rpb24gKyAiYHJg
::PS64:biIgKyAkY2hvcnVzU2VjdGlvbiArICJgcmBuIiksICR1dGY4Tm9Cb20pCiAgV3JpdGUtSG9zdCAnWzIvMl0gQUdFTlRTLm1k
::PS64:IOW3suWIm+W7uu+8iOS4reaWh+i+k+WHuuinhOiMgyArIENob3J1cyDku7vliqHmtYHnqIvvvIknCn0gZWxzZWlmICgtbm90
::PS64:ICgoR2V0LUNvbnRlbnQgLVJhdyAtTGl0ZXJhbFBhdGggJGFnZW50c1BhdGgpIC1tYXRjaCAnQ2hvcnVzIOS7u+WKoea1geeo
::PS64:iycpKSB7CiAgW1N5c3RlbS5JTy5GaWxlXTo6QXBwZW5kQWxsVGV4dCgkYWdlbnRzUGF0aCwgKCJgcmBuIiArICRjaG9ydXNT
::PS64:ZWN0aW9uICsgImByYG4iKSwgJHV0ZjhOb0JvbSkKICBXcml0ZS1Ib3N0ICdbMi8yXSBBR0VOVFMubWQg5bey5a2Y5Zyo77ya
::PS64:5bey5Zyo5pyr5bC+6L+95YqgIENob3J1cyDku7vliqHmtYHnqIvkuIDoioInCn0gZWxzZSB7CiAgV3JpdGUtSG9zdCAnWzIv
::PS64:Ml0gQUdFTlRTLm1kIOW3suWtmOWcqOS4lOW3suWQqyBDaG9ydXMg5Lu75Yqh5rWB56iL77ya6Lez6L+HJwp9CgpXcml0ZS1I
::PS64:b3N0ICcnCldyaXRlLUhvc3QgJz09PSDlrozmiJAgPT09JwpXcml0ZS1Ib3N0ICfor7TmmI7vvJonCldyaXRlLUhvc3QgJyAt
::PS64:IGRhZW1vbiDllKTphpIgb3BlbmNvZGUg5pe25Lya6Ieq5Yqo5rOo5YWlIENIT1JVU19BUElfS0VZIC8gQ0hPUlVTX0JBU0Vf
::PS64:VVJM77yMQ2hvcnVzIOW3peWFt+WNs+eUn+aViO+8mycKV3JpdGUtSG9zdCAnIC0g5omL5Yqo5Zyo57uI56uv6LeRIG9wZW5j
::PS64:b2RlIOS5n+aDs+eUqCBDaG9ydXMg5bel5YW35pe277yM5YWI5omn6KGMOiBzZXQgQ0hPUlVTX0FQSV9LRVk9Y2hvX3h4eCcK
::PS64:V3JpdGUtSG9zdCAoJyAtIOW5s+WPsOaOpeWFpeeCueW3suWGmeS4ujogJyArICRwbGF0Zm9ybSArICcvYXBpL21jcCcpCg==