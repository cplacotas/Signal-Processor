#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "=========================================================="
echo "    Starting VITA 49 Signal Processor & Simulator         "
echo "=========================================================="

# 1. Start Python Backend
echo "[1/2] Launching Backend Server on port 8000 & UDP 4991..."
cd "$DIR"
./backend/.venv/bin/python3 -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Trap signals to gracefully kill background processes on Ctrl+C
cleanup() {
  echo ""
  echo "Shutting down VITA 49 Signal Processor..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Wait 1s for backend to initialize
sleep 1

# 2. Start Frontend Dev Server
echo "[2/2] Launching Frontend on http://localhost:5173..."
cd "$DIR/frontend"
npx vite --host &
FRONTEND_PID=$!

echo ""
echo ">> Signal Processor Dashboard: http://localhost:5173"
echo ">> REST API & Swagger Docs:   http://localhost:8000/docs"
echo ">> VITA 49 UDP Ingest Socket:  127.0.0.1:4991"
echo ""
echo "Press Ctrl+C to stop all services."

wait
