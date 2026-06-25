# CityPulse CRM — Frontend (Next.js) image (dev server for the local demo)
FROM node:20-slim

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./

EXPOSE 3000
# Dev server: NEXT_PUBLIC_* are read from the runtime env (injected by compose),
# which keeps the image free of baked secrets and simple for a local demo.
CMD ["npm", "run", "dev"]
