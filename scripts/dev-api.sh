#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${API_PORT:-8000}"

echo "==> Deteniendo procesos uvicorn previos en puerto $PORT..."

if command -v netstat &>/dev/null; then
  for pid in $(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $5}' | sort -u); do
    taskkill //PID "$pid" //F 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
  done
fi

sleep 1
echo "==> Iniciando API con hot reload en http://localhost:$PORT"
echo "    Swagger: http://localhost:$PORT/api/docs"
cd "$ROOT/backend"
exec python -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$PORT"
