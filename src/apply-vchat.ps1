# Запуск: powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\apply-vchat.ps1"
param(
  [string]$Repo = "C:\Users\User\Desktop\blade-shop",
  [string]$Zip  = "$env:USERPROFILE\Downloads\vchat-patch.zip"
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Zip)) { throw "Не найден архив: $Zip" }
Set-Location $Repo

Write-Host "1/5 Возвращаю чужие файлы мессенджера из последнего рабочего коммита (если мой прошлый патч их затёр)..."
# Мой прошлый патч затёр mui.tsx и MessengerApp.tsx другой сессии. Возвращаем их версии из коммита перед патчем.
git log --oneline -6 -- src/components/messenger/mui.tsx
$hash = Read-Host "Введи хеш коммита, где mui.tsx ещё ЧУЖОЙ (последний до моего патча; Enter — пропустить)"
if ($hash) {
  git checkout $hash -- src/components/messenger src/app/m public/miligram
  Write-Host "   восстановлено из $hash"
}

Write-Host "2/5 Распаковываю мою версию (src/components/vchat, src/app/vc, public/vc)..."
Expand-Archive -Path $Zip -DestinationPath $Repo -Force
if (Test-Path "$Repo\README-VC.md") { Move-Item "$Repo\README-VC.md" "$Repo\README-VCHAT.md" -Force }

Write-Host "3/5 Подключаю polish.css в layout.tsx (если ещё не подключён)..."
$layout = "$Repo\src\app\layout.tsx"
if (Test-Path $layout) {
  $t = Get-Content $layout -Raw -Encoding UTF8
  if ($t -notmatch 'polish\.css') {
    $t2 = $t -replace '(import\s+"\./globals\.css";)', "`$1`nimport `"./polish.css`";"
    if ($t2 -ne $t) { Set-Content $layout $t2 -Encoding UTF8 -NoNewline; Write-Host "   подключён" } else { Write-Host "   не нашла import globals.css — добавь вручную: import `"./polish.css`";" }
  } else { Write-Host "   уже подключён" }
}

Write-Host "4/5 Коммит..."
git add -A
git commit -m "MiliGram vchat: smooth sending, stories fixes, chat list/profile design, site polish"

Write-Host "5/5 Отправляю на GitHub..."
git push
Write-Host "Готово. Мой мессенджер откроется по адресу /vc после деплоя на Vercel."
