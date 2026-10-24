# Processing worker: FFmpeg + fontconfig + Chromium (Playwright) for previews.
# Build from the repo root:  docker build -f apps/workers/Dockerfile -t frameflow-library-worker .
FROM mcr.microsoft.com/playwright:v1.63.0-noble
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-noto-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/workers/package.json apps/workers/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY apps/workers/src ./src
ENV NODE_ENV=production
USER pwuser
CMD ["node", "src/worker.js"]
