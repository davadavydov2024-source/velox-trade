# Запуск: powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\apply-miligram.ps1"
param(
  [string]$Repo = "C:\Users\User\Desktop\blade-shop",
  [string]$Zip  = "$env:USERPROFILE\Downloads\miligram-ui-patch.zip"
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Zip)) { throw "Не найден архив: $Zip" }
Set-Location $Repo

Write-Host "1/4 Удаляю устаревшие файлы..."
foreach ($p in @("src\components\messenger\MessengerEntry.tsx", "src\app\m\manifest.webmanifest", "public\m")) {
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}
# мои прошлые копии в отдельных папках (если вдруг остались)
foreach ($p in @("src\components\vchat", "src\app\vc", "public\vc")) {
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

Write-Host "2/4 Распаковываю патч..."
Expand-Archive -Path $Zip -DestinationPath $Repo -Force
if (Test-Path "$Repo\README-MILIGRAM.md") { Move-Item "$Repo\README-MILIGRAM.md" "$Repo\README-MILIGRAM-UI.md" -Force }

Write-Host "3/4 Коммит..."
git add -A
git commit -m "MiliGram UI: build fixes, backend contract alignment"

Write-Host "4/4 Отправляю на GitHub (запустится деплой)..."
git push
Write-Host "Готово. Следи за деплоем на Vercel."
