$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$pgCtl = "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"
$dataDir = Join-Path $projectRoot "pgdata"
$logFile = Join-Path $dataDir "postgres.log"

if (!(Test-Path $pgCtl)) {
  throw "未找到 PostgreSQL，请确认 C:\Program Files\PostgreSQL\17 已安装。"
}

& $pgCtl -D $dataDir -l $logFile -o "-p 55432" start
