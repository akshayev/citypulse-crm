import requests
try:
    print(requests.get("https://citypulse-backend-vn65.onrender.com/api/health", timeout=5).json())
except Exception as e:
    print("Backend failed:", e)
