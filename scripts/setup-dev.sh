#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Copiando .env si no existe..."
[ -f .env ] || cp .env.example .env

echo "==> Instalando dependencias del backend..."
cd backend
python -m pip install -e ".[dev]" -q
cd "$ROOT"

echo "==> Instalando dependencias del frontend..."
cd frontend
npm install
cd "$ROOT"

echo ""
echo "Setup completo. Para iniciar con hot reload rápido:"
echo "  make dev-fast"
echo ""
echo "O con Docker (todo en contenedores):"
echo "  make dev"
