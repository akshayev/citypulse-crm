#!/bin/bash
echo "Starting backend..."
cd backend
SUPABASE_URL="http://localhost:8000" SUPABASE_SERVICE_ROLE_KEY="mock-key.jwt.mock" GEMINI_API_KEY="mock-key" BACKEND_API_KEY="dev-secret-key-123" PYTHONPATH=/app uvicorn main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!

echo "Starting frontend..."
cd ../frontend
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

echo "Both services started."
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
