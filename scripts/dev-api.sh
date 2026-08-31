#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${API_PORT:-8000}"

echo "==> Deteniendo servidores previos..."
bash "$ROOT/scripts/stop-api.sh" || exit 1

echo "==> Iniciando API Don Nicolás en http://localhost:$PORT"
echo "    Swagger: http://localhost:$PORT/api/docs"
echo "    Para detener: Ctrl+C o bash scripts/stop-api.sh"
cd "$ROOT/backend"
exec python -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$PORT"
