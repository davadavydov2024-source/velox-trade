# Обновление бота одной командой: берёт самый свежий tgassistant*.zip из Загрузок,
# заменяет файлы проекта (не трогая .env, venv, базу), коммитит и пушит на GitHub.
$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
$zip = Get-ChildItem "$HOME\Downloads" -Filter "tgassistant*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { Write-Host "Не нашёл tgassistant*.zip в папке Загрузки. Сначала скачай архив." -ForegroundColor Red; exit 1 }
Write-Host "Архив: $($zip.Name) от $($zip.LastWriteTime)" -ForegroundColor Cyan

$tmp = Join-Path $env:TEMP "tgupd"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip.FullName -DestinationPath $tmp -Force
robocopy (Join-Path $tmp "tgassistant") $proj /E /XF .env .gitignore data.db update.ps1 /XD venv .git __pycache__ tmp | Out-Null
Remove-Item $tmp -Recurse -Force
if (Test-Path (Join-Path $proj "tgassistant\main.py")) { Remove-Item (Join-Path $proj "tgassistant") -Recurse -Force }  # лишняя вложенная копия

Set-Location $proj
Select-String -Path "app\config.py" -Pattern '^VERSION =' | ForEach-Object { Write-Host "Версия в файлах: $($_.Line)" -ForegroundColor Green }

git add -A
$bad = git diff --cached --name-only | Select-String -Pattern '^\.env$|data\.db|^venv/'
if ($bad) { Write-Host "СТОП: в коммит попали секретные файлы: $bad" -ForegroundColor Red; git reset | Out-Null; exit 1 }
if (-not (git status --porcelain)) { Write-Host "Изменений нет: этот архив уже применён." -ForegroundColor Yellow; exit 0 }
git commit -m "update $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-Null
git push
Write-Host "`nГотово. Теперь на хостинге нажми «Передеплоить», потом напиши боту /version" -ForegroundColor Green
