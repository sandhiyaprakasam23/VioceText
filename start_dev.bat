@echo off
echo ========================================================
echo  Starting VoiceText AI Development Environment
echo ========================================================

echo [1/3] Activating virtual environment...
call .\.venv\Scripts\activate.bat

echo [2/3] Starting Daphne ASGI Server (Port 8000)...
start cmd /k ".\.venv\Scripts\python.exe -m daphne -b 127.0.0.1 -p 8000 voicetext.asgi:application"

echo [3/3] Starting Vite Frontend (Port 5173)...
start cmd /k "cd frontend && npm run dev"

echo ========================================================
echo  Backend:  http://127.0.0.1:8000/
echo  Frontend: http://localhost:5173/
echo ========================================================
pause
