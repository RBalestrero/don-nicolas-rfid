#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${VITE_PORT:-5174}"

echo "==> Deteniendo procesos en puerto $PORT..."
if command -v netstat &>/dev/null; then
  for pid in $(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $5}' | sort -u); do
    taskkill //PID "$pid" //F 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
  done
fi

sleep 1
echo "==> Iniciando Don Nicolás web en http://localhost:$PORT"
cd "$ROOT/frontend"
exec npm run dev -- --port "$PORT" --host 0.0.0.0
