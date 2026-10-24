# The Library API + admin web + FrameFlow feed. State in PostgreSQL
# (DATABASE_URL) and files in R2/S3 (LIBRARY_S3_*); see README.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 LIBRARY_DATA_DIR=/tmp/library
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY apps ./apps
COPY packages ./packages
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "apps/api/src/server.js"]
