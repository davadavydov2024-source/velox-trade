# Запуск: PowerShell -> powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\fix-and-deploy.ps1"
# Если архив лежит не в «Загрузках», укажи путь: ... -Zip "D:\путь\messenger-ui.zip"
param(
  [string]$Repo = "C:\Users\User\Desktop\blade-shop",
  [string]$Zip  = "$env:USERPROFILE\Downloads\messenger-ui.zip"
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Zip)) { throw "Не найден архив: $Zip. Скачай messenger-ui.zip или укажи путь через -Zip." }
Set-Location $Repo

Write-Host "1/5 Возвращаю чужие файлы мессенджера к версии 8272a3f..."
git checkout 8272a3f -- src/components/messenger src/app/m public/m
git rm -f --ignore-unmatch src/components/messenger/features.ts public/m/logo.png | Out-Null

Write-Host "2/5 Распаковываю новый мессенджер (src/components/vchat, src/app/vc, public/vc)..."
Expand-Archive -Path $Zip -DestinationPath $Repo -Force
if (Test-Path "$Repo\NOTES-B.md") { Move-Item "$Repo\NOTES-B.md" "$Repo\NOTES-VCHAT.md" -Force }

Write-Host "3/5 Разрешаю микрофон и камеру в securityHeaders..."
$sh = "$Repo\src\lib\securityHeaders.ts"
if (Test-Path $sh) {
  $t = Get-Content $sh -Raw -Encoding UTF8
  $t2 = $t -replace 'camera=\(\)', 'camera=(self)' -replace 'microphone=\(\)', 'microphone=(self)'
  if ($t2 -ne $t) { Set-Content $sh $t2 -Encoding UTF8 -NoNewline; Write-Host "   готово" } else { Write-Host "   уже настроено или другой формат — пропускаю" }
}

Write-Host "4/5 Коммит..."
git add -A
git commit -m "restore messenger files, add vchat (/vc)"

Write-Host "5/5 Отправляю на GitHub (запускается деплой на Vercel)..."
git push

Write-Host "Готово. Через пару минут открой: https://velox-trade-zeta.vercel.app/vc/start"
