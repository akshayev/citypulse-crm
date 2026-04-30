# CityPulse CRM — Render Configuration
# Source: 08-CI-CD-and-Deployment.md

# Service Settings:
# - Name: citypulse-backend
# - Runtime: Python 3
# - Root Directory: backend
# - Build Command: pip install -r requirements.txt
# - Start Command: uvicorn backend.main:app --host 0.0.0.0 --port $PORT

# Environment Variables (set in Render Dashboard):
# SUPABASE_URL
# SUPABASE_SERVICE_ROLE_KEY
# SERPAPI_KEY
# GEMINI_API_KEY
# BACKEND_API_KEY (shared secret used by frontend server proxy)
# CORS_ORIGINS (set to your Vercel frontend URL)
