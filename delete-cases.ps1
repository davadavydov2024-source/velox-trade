# Запускать из корня проекта (там, где лежит папка src):  .\delete-cases.ps1
$paths = @(
  'src\app\admin\cases',
  'src\app\admin\ticket-requests',
  'src\app\api\cases',
  'src\app\api\tickets',
  'src\app\case',
  'src\app\profile\case-history',
  'src\app\profile\tickets',
  'src\lib\cases.ts',
  'src\lib\ticketRequests.ts'
)
foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force; Write-Host "удалено: $p" }
  else { Write-Host "уже нет: $p" }
}
