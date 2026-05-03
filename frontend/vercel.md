# CityPulse CRM — Vercel Configuration
# Source: 08-CI-CD-and-Deployment.md

# Framework auto-detected as Next.js by Vercel
# Root directory: frontend/

# Build Settings (configured in Vercel Dashboard):
# - Framework Preset: Next.js
# - Root Directory: frontend
# - Build Command: npm run build
# - Output Directory: .next
# - Install Command: npm install

# Environment Variables (set in Vercel Dashboard):
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# NEXT_PUBLIC_SITE_URL (e.g., https://your-app.vercel.app or custom domain)
# GEMINI_API_KEY
# BACKEND_URL (Render backend URL)
# BACKEND_API_KEY (must match backend BACKEND_API_KEY on Render)

# Supabase Auth URL Configuration (Dashboard > Authentication > URL Configuration):
# - Site URL: set to NEXT_PUBLIC_SITE_URL value (production URL)
# - Redirect URLs: include production URL and Vercel preview URLs
