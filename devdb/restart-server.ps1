# Reinicia el servidor de juego en :7666 (modo desarrollo). Uso:
#   powershell -File devdb/restart-server.ps1 [-Fast]
# -Fast acorta los tiempos del MOBA (oleadas, respawn, reinicio) para los tests automaticos.
param([switch]$Fast)

$root = Split-Path -Parent $PSScriptRoot
$conn = Get-NetTCPConnection -LocalPort 7666 -State Listen -ErrorAction SilentlyContinue
$pids = @($conn.OwningProcess | Select-Object -Unique)
$parents = foreach ($x in $pids) { (Get-CimInstance Win32_Process -Filter "ProcessId=$x").ParentProcessId }
foreach ($x in @($pids) + @($parents)) {
    if (-not $x) { continue }
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$x").CommandLine
    if ($cmd -match 'tsx|server\.ts') { Stop-Process -Id $x -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

$env:NODE_ENV = "development"
if ($Fast) {
    $env:MOBA_WAVE_MS = "6000"
    $env:MOBA_FIRST_WAVE_MS = "2000"
    $env:MOBA_RESPAWN_MS = "3000"
    $env:MOBA_RESET_MS = "5000"
}
$log = Join-Path $PSScriptRoot "server.log"
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$root\server`" && npx -y tsx watch src/server.ts > `"$log`" 2>&1" -WindowStyle Hidden
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if ((Test-Path $log) -and (Select-String -Path $log -Pattern "Iniciado en" -Quiet)) { "server listo"; exit 0 }
}
"timeout esperando al servidor"; exit 1
