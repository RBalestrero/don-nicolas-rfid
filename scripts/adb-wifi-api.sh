#!/usr/bin/env bash
# Túnel API por ADB Wi‑Fi: el MC33 llega a la API en 127.0.0.1:8000
# Útil cuando la red bloquea TCP 8000 hacia la PC (ping OK pero curl timeout).
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
export PATH="${ANDROID_HOME}/platform-tools:${PATH}"

DEVICE_IP="${1:-}"
API_PORT="${API_PORT:-8000}"

if [[ -z "$DEVICE_IP" ]]; then
  # Intentar descubrir IP Wi‑Fi del dispositivo ya conectado por USB
  DEVICE_IP=$(adb shell "ip -f inet addr show wlan0 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1" 2>/dev/null | tr -d '\r' || true)
fi

if [[ -z "$DEVICE_IP" ]]; then
  echo "Uso: bash scripts/adb-wifi-api.sh <IP-del-MC33>"
  echo "Ejemplo: bash scripts/adb-wifi-api.sh 192.168.100.91"
  exit 1
fi

echo "==> Habilitando ADB TCP en el dispositivo..."
adb tcpip 5555 >/dev/null
sleep 1
echo "==> Conectando a ${DEVICE_IP}:5555 ..."
adb connect "${DEVICE_IP}:5555"
sleep 1
echo "==> Reverse tcp:${API_PORT} -> tcp:${API_PORT}"
adb -s "${DEVICE_IP}:5555" reverse --remove-all >/dev/null 2>&1 || true
adb -s "${DEVICE_IP}:5555" reverse "tcp:${API_PORT}" "tcp:${API_PORT}"
adb -s "${DEVICE_IP}:5555" reverse --list

echo "==> Probando health vía túnel..."
if adb -s "${DEVICE_IP}:5555" shell "curl -sf --connect-timeout 5 http://127.0.0.1:${API_PORT}/api/v1/health" >/dev/null; then
  echo "==> OK. En la app usá api.host=127.0.0.1 (mobile/local.properties)"
else
  echo "==> WARN: no se pudo verificar health. ¿API levantada en la PC?"
fi
