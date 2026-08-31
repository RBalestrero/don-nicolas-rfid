#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${API_PORT:-8000}"

echo "==> Deteniendo servidores previos en puerto $PORT..."

# 1. Matar workers huérfanos de uvicorn (spawn en Windows quedan vivos sin el padre)
if command -v wmic &>/dev/null; then
  wmic process where "CommandLine like '%multiprocessing.spawn%spawn_main%'" get ProcessId 2>/dev/null \
    | grep -E '^[0-9]+$' | while read -r pid; do
      taskkill //PID "$pid" //F 2>/dev/null || true
    done || true

  wmic process where "CommandLine like '%uvicorn%app.main%'" get ProcessId 2>/dev/null \
    | grep -E '^[0-9]+$' | while read -r pid; do
      taskkill //PID "$pid" //F 2>/dev/null || true
    done || true
fi

# 2. Matar procesos que escuchan en el puerto
if command -v netstat &>/dev/null; then
  for pid in $(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $5}' | sort -u); do
    taskkill //PID "$pid" //F 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
  done
fi

sleep 2

# 3. Segunda pasada por si quedaron workers huérfanos
if command -v wmic &>/dev/null; then
  wmic process where "CommandLine like '%multiprocessing.spawn%spawn_main%'" get ProcessId 2>/dev/null \
    | grep -E '^[0-9]+$' | while read -r pid; do
      taskkill //PID "$pid" //F 2>/dev/null || true
    done || true
fi

if curl -sf "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then
  echo "ERROR: sigue respondiendo un servidor viejo en el puerto $PORT."
  echo "       Cerrá todas las terminales con uvicorn y volvé a ejecutar este script."
  exit 1
fi

echo "==> Iniciando API Don Nicolás en http://localhost:$PORT"
echo "    Swagger: http://localhost:$PORT/api/docs"
cd "$ROOT/backend"
exec python -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$PORT"
