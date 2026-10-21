#!/usr/bin/env bash
echo "========================================================"
echo " Starting VoiceText AI Development Environment"
echo "========================================================"

# Activate virtualenv
source .venv/bin/activate

# Start backend ASGI
daphne -b 127.0.0.1 -p 8000 voicetext.asgi:application &
BACKEND_PID=$!

# Start frontend
cd frontend && npm run dev &
FRONTEND_PID=$!

echo "Backend running on http://127.0.0.1:8000 (PID: $BACKEND_PID)"
echo "Frontend running on http://localhost:5173 (PID: $FRONTEND_PID)"

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
