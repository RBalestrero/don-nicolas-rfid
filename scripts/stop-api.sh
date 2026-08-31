#!/usr/bin/env bash
# Detiene todos los procesos de la API Don Nicolás (incluye workers huérfanos en Windows)
set -uo pipefail

PORT="${API_PORT:-8000}"

echo "==> Deteniendo API en puerto $PORT..."

# PowerShell: mata el proceso real que escucha en el puerto
powershell -NoProfile -Command "
  Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }
" 2>/dev/null || true

# PowerShell: mata workers huérfanos de uvicorn (multiprocessing spawn)
powershell -NoProfile -Command "
  Get-CimInstance Win32_Process |
    Where-Object { \$_.CommandLine -like '*spawn_main*' -or \$_.CommandLine -like '*uvicorn*app.main*' } |
    ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }
" 2>/dev/null || true

# Respaldo con taskkill por netstat
if command -v netstat &>/dev/null; then
  for pid in $(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $5}' | sort -u); do
    taskkill //PID "$pid" //F 2>/dev/null || true
  done
fi

sleep 2

if curl -sf "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then
  echo "ERROR: el puerto $PORT sigue activo."
  echo "       Ejecutá en PowerShell como administrador:"
  echo "       Get-NetTCPConnection -LocalPort $PORT | %% { Stop-Process -Id \$_.OwningProcess -Force }"
  exit 1
fi

echo "==> API detenida correctamente."
