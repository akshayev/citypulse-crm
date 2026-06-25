# CityPulse CRM — Backend (FastAPI) image
FROM python:3.11-slim

WORKDIR /app

# System deps kept minimal. The Selenium fallback needs Chrome at runtime and is
# NOT installed here (SerpApi is the supported scraper; the demo uses seed data).
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY pytest.ini ./pytest.ini

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
